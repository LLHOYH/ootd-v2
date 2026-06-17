// Try-on provider - wraps Replicate google/nano-banana-pro.
//
// SPEC §10.10 (Wear-this) generation flow. Given a person/model reference
// photo and one or more garment photos (closet item `tuned` images), returns
// the bytes of a generated photo of the person wearing the combo.
//
// Two implementations:
//   MockTryonProvider — fails loudly. Returning the person reference
//                       unchanged looks like a successful try-on in the app,
//                       so dogfooding should not allow it.
//   RealTryonProvider — uses Nano Banana Pro image editing with the person
//                       image as reference 1 and combo garments after it.

import type { ClothingCategory } from '@mei/types';
import type { ImageWorkerConfig } from '../config';

export interface TryonInput {
  /** Raw bytes of the person/model reference image. */
  humanImage: Buffer;
  /** Garment references from the selected closet combination. */
  garments: {
    /** Raw bytes of the garment photo (typically closet item's tuned/webp). */
    image: Buffer;
    /** Free-text garment description for the model — usually the item's name. */
    description: string;
    /** Mei `clothing_category`. Used to clarify the edit prompt. */
    category: ClothingCategory;
  }[];
  /** Optional short tag used to prefix step-narrator logs so concurrent
   *  generations stay legible in the dev terminal. */
  logTag?: string;
}

export interface TryonResult {
  /** Bytes of the generated image. We re-encode to WebP downstream. */
  image: Buffer;
  /** Replicate prediction id, useful for log forensics. */
  providerId?: string;
}

export interface TryonProvider {
  generate(input: TryonInput): Promise<TryonResult>;
}

function categoryLabelFor(c: ClothingCategory): string {
  switch (c) {
    case 'DRESS':
      return 'dress or one-piece outfit';
    case 'TOP':
      return 'top';
    case 'OUTERWEAR':
      return 'outerwear layer';
    case 'BOTTOM':
      return 'bottom';
    case 'SHOE':
      return 'shoes';
    case 'BAG':
      return 'bag';
    case 'ACCESSORY':
      return 'accessory';
  }
}

// ---------------------------------------------------------------------------
// MockTryonProvider — no fake successes for try-on.
// ---------------------------------------------------------------------------

class MockTryonProvider implements TryonProvider {
  async generate(): Promise<TryonResult> {
    throw new Error(
      'Try-on generation requires IMAGE_WORKER_MODE=real and REPLICATE_API_TOKEN.',
    );
  }
}

// ---------------------------------------------------------------------------
// RealTryonProvider - Replicate Nano Banana Pro.
// ---------------------------------------------------------------------------

const NANO_BANANA_MODEL = 'google/nano-banana-pro';
const NANO_BANANA_PREDICTIONS_URL =
  `https://api.replicate.com/v1/models/${NANO_BANANA_MODEL}/predictions`;

// Replicate's prediction lifecycle: starting → processing → succeeded |
// failed | canceled. We poll until terminal. Cap total wait — a stuck
// queue shouldn't block /tryon indefinitely.
const POLL_INTERVAL_MS = 1_500;
const MAX_WAIT_MS = 120_000;
const CREATE_RETRY_LIMIT = 3;
const CREATE_RETRY_FALLBACK_MS = 12_000;

class RealTryonProvider implements TryonProvider {
  constructor(private readonly apiToken: string) {}

  async generate(input: TryonInput): Promise<TryonResult> {
    if (input.garments.length === 0) {
      throw new Error('Try-on generation needs at least one garment reference.');
    }

    const tag = input.logTag ?? 'replicate';
    const t0 = Date.now();
    const log = (msg: string) => console.log(`[tryon ${tag}] ${msg}`);
    const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);

    // Convert both image buffers to data URIs so we don't need to upload them
    // to a public CDN first. Reference order matters to the prompt below:
    // first is the person/model, then the selected combo garment references.
    log(
      `encoding image inputs as data URIs (person ${(input.humanImage.length / 1024).toFixed(0)} KB, garments ${input.garments.map((g) => `${(g.image.length / 1024).toFixed(0)} KB`).join(', ')})`,
    );
    const humanDataUri = toDataUri(input.humanImage);
    const garmentDataUris = input.garments.map((garment) => toDataUri(garment.image));
    const prompt = buildTryonPrompt(input);
    const predictionBody = JSON.stringify({
      input: {
        prompt,
        image_input: [humanDataUri, ...garmentDataUris],
        aspect_ratio: '3:4',
        resolution: '1K',
        output_format: 'jpg',
        safety_filter_level: 'block_medium_and_above',
        allow_fallback_model: false,
      },
    });

    // 1. Create the prediction.
    log(`POST Replicate ${NANO_BANANA_MODEL} try-on edit`);
    const createRes = await createPredictionWithRetry({
      apiToken: this.apiToken,
      body: predictionBody,
      log,
    });
    const created = (await createRes.json()) as ReplicatePrediction;
    const id = created.id;
    if (!id) {
      throw new Error('Replicate predictions.create returned no id');
    }
    log(`prediction ${id} created (status=${created.status ?? 'unknown'})`);

    // 2. Poll until terminal. Log only on status transitions so we don't
    // spam every 1.5s — just narrate when something actually changes.
    const started = Date.now();
    let pred: ReplicatePrediction = created;
    let lastStatus = pred.status;
    while (pred.status === 'starting' || pred.status === 'processing') {
      if (Date.now() - started > MAX_WAIT_MS) {
        throw new Error(`Replicate prediction ${id} timed out after ${MAX_WAIT_MS}ms`);
      }
      await sleep(POLL_INTERVAL_MS);
      const getRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
        headers: { authorization: `Bearer ${this.apiToken}` },
      });
      if (!getRes.ok) {
        const body = await safeText(getRes);
        throw new Error(
          `Replicate prediction ${id} get failed: ${getRes.status} ${body.slice(0, 240)}`,
        );
      }
      pred = (await getRes.json()) as ReplicatePrediction;
      if (pred.status !== lastStatus) {
        log(`prediction ${id}: ${lastStatus} → ${pred.status} (${elapsed()}s)`);
        lastStatus = pred.status;
      }
    }

    if (pred.status === 'failed' || pred.status === 'canceled') {
      log(`prediction ${id} ${pred.status} after ${elapsed()}s`);
      throw new Error(
        `Replicate prediction ${id} ${pred.status}: ${pred.error ?? 'no error detail'}`,
      );
    }
    log(`prediction ${id} succeeded after ${elapsed()}s`);

    // 3. Download the resulting image. Replicate model outputs vary between
    //    a single URL string and an array; accept both shapes defensively.
    const outputUrl = Array.isArray(pred.output)
      ? pred.output[0]
      : typeof pred.output === 'string'
        ? pred.output
        : undefined;
    if (!outputUrl) {
      throw new Error(`Replicate prediction ${id} succeeded but returned no image URL`);
    }
    log('downloading generated image from Replicate CDN...');
    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) {
      throw new Error(
        `Failed to download ${NANO_BANANA_MODEL} output from ${outputUrl}: ${imgRes.status}`,
      );
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    log(`downloaded ${(buf.length / 1024).toFixed(0)} KB`);
    return { image: buf, providerId: `${NANO_BANANA_MODEL}:${id}` };
  }
}

async function createPredictionWithRetry(input: {
  apiToken: string;
  body: string;
  log: (msg: string) => void;
}): Promise<Response> {
  let lastBody = '';
  for (let attempt = 1; attempt <= CREATE_RETRY_LIMIT; attempt += 1) {
    const createRes = await fetch(NANO_BANANA_PREDICTIONS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiToken}`,
        'content-type': 'application/json',
        prefer: 'wait=60',
      },
      body: input.body,
    });

    if (createRes.ok) return createRes;

    lastBody = await safeText(createRes);
    if (createRes.status !== 429 || attempt === CREATE_RETRY_LIMIT) {
      throw new Error(
        `Replicate ${NANO_BANANA_MODEL} create failed: ${createRes.status} ${lastBody.slice(0, 240)}`,
      );
    }

    const waitMs = retryDelayMs(createRes, lastBody);
    input.log(
      `Replicate throttled prediction create; retrying in ${(waitMs / 1000).toFixed(0)}s (attempt ${attempt + 1}/${CREATE_RETRY_LIMIT})`,
    );
    await sleep(waitMs);
  }

  throw new Error(
    `Replicate ${NANO_BANANA_MODEL} create failed: 429 ${lastBody.slice(0, 240)}`,
  );
}

function retryDelayMs(res: Response, body: string): number {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return header * 1000 + 1_500;
  const match = body.match(/"retry_after"\s*:\s*(\d+)/);
  if (match?.[1]) return Number(match[1]) * 1000 + 1_500;
  return CREATE_RETRY_FALLBACK_MS;
}

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

export function getTryonProvider(cfg: ImageWorkerConfig): TryonProvider {
  if (cfg.mode === 'real' && cfg.replicateApiToken) {
    return new RealTryonProvider(cfg.replicateApiToken);
  }
  return new MockTryonProvider();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ReplicatePrediction {
  id?: string;
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

function toDataUri(buf: Buffer): string {
  // Nano Banana accepts JPEG/PNG/WebP data URIs. We normalize upstream, so
  // image/jpeg is a safe transport label here.
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

function buildTryonPrompt(input: TryonInput): string {
  const garmentLines = input.garments
    .map((garment, index) => {
      const label = garment.description.trim() || `closet item ${index + 1}`;
      return `Reference image ${index + 2}: "${label}" (${categoryLabelFor(garment.category)}).`;
    })
    .join('\n');
  const hasMultipleGarments = input.garments.length > 1;
  return [
    'Edit the first image only. The first image is the person/model reference. The remaining images are clothing and accessory references from one selected outfit combination.',
    garmentLines,
    hasMultipleGarments
      ? 'Dress the person/model in a coherent complete outfit using all compatible reference garments. If two garments occupy the same body area, choose the more visually dominant one and layer the other only if it looks natural.'
      : 'Dress the person/model in the garment from the second image.',
    'The final image must clearly show the selected closet garment references being worn or styled on the person/model from the first image. Do not return the original first image unchanged.',
    'Preserve the same face identity, skin tone, hairstyle, body shape, pose, proportions, camera angle, and overall framing from the first image.',
    'Make the body slightly lean, flattering, natural, and photogenic, but do not make a different person.',
    'Preserve the real garment colors, patterns, fabric textures, necklines, sleeves, lengths, silhouettes, buttons, hardware, and distinctive details from the reference images.',
    'For a dress, replace the full outfit with the dress. For tops, outerwear, and bottoms, replace the matching body-area garments. Include shoes, bags, and accessories only when they are present and can look natural.',
    'Make the result look like a clean fashion try-on photo with realistic fit, fabric drape, shadows, and body contact.',
    'No extra people, no duplicate bodies, no mannequins, no hangers, no text, no logo, no messy background, no distorted hands or face.',
  ].join(' ');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(r: Response): Promise<string> {
  try {
    return await r.text();
  } catch {
    return '';
  }
}
