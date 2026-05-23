// Try-on provider — wraps Replicate IDM-VTON (cuuupid/idm-vton).
//
// SPEC §10.10 (Wear-this) generation flow. Given a person photo (selfie)
// and a garment photo (closet item's `tuned` image), returns the bytes
// of a generated photo of the person wearing the garment.
//
// IDM-VTON model docs: https://replicate.com/cuuupid/idm-vton
// Required inputs:
//   human_img    — URL or data: URI of the person photo
//   garm_img     — URL or data: URI of the garment photo
//   garment_des  — short text description of the garment (e.g. "white linen midi dress")
//   category     — "upper_body" | "lower_body" | "dresses"
//
// Two implementations:
//   MockTryonProvider — returns the human image bytes untouched. Lets
//                       the pipeline run end-to-end with no token; the
//                       output is "you, unchanged" instead of "you in
//                       the dress" which is obviously wrong but
//                       diagnostic-friendly.
//   RealTryonProvider — posts to Replicate, polls until done, downloads
//                       the resulting image bytes.

import type { ClothingCategory } from '@mei/types';
import type { ImageWorkerConfig } from '../config';

export interface TryonInput {
  /** Raw bytes of the user's selfie. */
  humanImage: Buffer;
  /** Raw bytes of the garment photo (typically the closet item's tuned/webp). */
  garmentImage: Buffer;
  /** Free-text garment description for the model — usually the item's name. */
  garmentDescription: string;
  /** Mei `clothing_category`. Maps to IDM-VTON's three-bucket scheme. */
  category: ClothingCategory;
  /** Optional short tag used to prefix step-narrator logs so concurrent
   *  generations stay legible in the dev terminal. */
  logTag?: string;
}

export interface TryonResult {
  /** Bytes of the generated image. Format follows the model output —
   *  IDM-VTON returns PNG by default. We re-encode to WebP downstream. */
  image: Buffer;
  /** Replicate prediction id, useful for log forensics. */
  providerId?: string;
}

export interface TryonProvider {
  generate(input: TryonInput): Promise<TryonResult>;
}

/** Map Mei clothing categories to IDM-VTON's `category` argument. The
 *  model only accepts three values; anything else (SHOE, BAG, etc.)
 *  has no meaningful try-on output. Callers should pre-filter — the
 *  provider throws a clear error rather than silently returning the
 *  wrong thing. */
export function idmVtonCategoryFor(c: ClothingCategory): 'upper_body' | 'lower_body' | 'dresses' {
  switch (c) {
    case 'DRESS':
      return 'dresses';
    case 'TOP':
    case 'OUTERWEAR':
      return 'upper_body';
    case 'BOTTOM':
      return 'lower_body';
    case 'SHOE':
    case 'BAG':
    case 'ACCESSORY':
      throw new Error(
        `IDM-VTON cannot try on category=${c}. Pre-filter the combination to a DRESS/TOP/OUTERWEAR/BOTTOM item before generation.`,
      );
  }
}

// ---------------------------------------------------------------------------
// MockTryonProvider — pass-through (returns the selfie unchanged).
// ---------------------------------------------------------------------------

class MockTryonProvider implements TryonProvider {
  async generate(input: TryonInput): Promise<TryonResult> {
    return { image: input.humanImage };
  }
}

// ---------------------------------------------------------------------------
// RealTryonProvider — Replicate IDM-VTON.
// ---------------------------------------------------------------------------

// Resolved model version of `cuuupid/idm-vton`. Pinned so a publisher
// re-release doesn't change our output shape silently. Bump when we
// re-evaluate the model.
const IDM_VTON_VERSION = 'cuuupid/idm-vton:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4';

// Replicate's prediction lifecycle: starting → processing → succeeded |
// failed | canceled. We poll until terminal. Cap total wait — a stuck
// queue shouldn't block /tryon indefinitely.
const POLL_INTERVAL_MS = 1_500;
const MAX_WAIT_MS = 90_000;

class RealTryonProvider implements TryonProvider {
  constructor(private readonly apiToken: string) {}

  async generate(input: TryonInput): Promise<TryonResult> {
    const tag = input.logTag ?? 'replicate';
    const t0 = Date.now();
    const log = (msg: string) => console.log(`[tryon ${tag}] ${msg}`);
    const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);

    // Convert both image buffers to data URIs so we don't need to upload
    // them to a public CDN first. Replicate accepts data: URIs for image
    // inputs. ~3 MB selfies stay well under the request size limit.
    log(
      `encoding image inputs as data URIs (selfie ${(input.humanImage.length / 1024).toFixed(0)} KB, garment ${(input.garmentImage.length / 1024).toFixed(0)} KB)`,
    );
    const humanDataUri = toDataUri(input.humanImage);
    const garmDataUri = toDataUri(input.garmentImage);

    // 1. Create the prediction.
    log('POST https://api.replicate.com/v1/predictions');
    const createRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        version: IDM_VTON_VERSION.split(':')[1],
        input: {
          human_img: humanDataUri,
          garm_img: garmDataUri,
          garment_des: input.garmentDescription,
          category: idmVtonCategoryFor(input.category),
        },
      }),
    });
    if (!createRes.ok) {
      const body = await safeText(createRes);
      throw new Error(
        `Replicate predictions.create failed: ${createRes.status} ${body.slice(0, 240)}`,
      );
    }
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
          `Replicate predictions.get ${id} failed: ${getRes.status} ${body.slice(0, 240)}`,
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

    // 3. Download the resulting image. IDM-VTON returns a single URL
    //    (string) in `output`. Some models return an array; we accept
    //    both shapes defensively.
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
        `Failed to download IDM-VTON output from ${outputUrl}: ${imgRes.status}`,
      );
    }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    log(`downloaded ${(buf.length / 1024).toFixed(0)} KB`);
    return { image: buf, providerId: id };
  }
}

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

export function getTryonProvider(cfg: ImageWorkerConfig): TryonProvider {
  if (cfg.replicateApiToken) {
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
  // IDM-VTON accepts JPEG/PNG/WebP. We don't sniff — pass through as
  // image/jpeg, which the model handles regardless of true format.
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
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
