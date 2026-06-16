// Image-processing provider — produces (tuned, thumb) WebP buffers from a
// raw upload.
//
// SPEC §9.1 calls for:
//   - background removal + studio-light tuning → tuned.webp
//   - sharp resize → thumb.webp
//
// Two implementations:
//   - MockImageProcessProvider — runs sharp locally, no external API. The
//     "tuned" image is just the raw photo re-encoded as WebP — visually
//     identical, but lets the rest of the pipeline (storage upload, row
//     promotion) run end-to-end. Thumbnail is a real 320px-wide WebP.
//   - RealImageProcessProvider - Replicate google/nano-banana-pro cleans up
//     the fashion item into a centered catalog-style image. Wired only when
//     IMAGE_WORKER_MODE=real and REPLICATE_API_TOKEN is set.

import sharp from 'sharp';
import type { ImageWorkerConfig } from '../config';

export interface ProcessedImages {
  tuned: Buffer;
  thumb: Buffer;
}

export interface ImageProcessProvider {
  process(rawImage: Buffer): Promise<ProcessedImages>;
}

const THUMB_WIDTH = 320;

async function makeThumb(raw: Buffer): Promise<Buffer> {
  return sharp(raw)
    .rotate() // honour EXIF orientation
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// MockImageProcessProvider - normalises orientation and size, then produces
// a sharp-resized thumbnail. Deterministic, offline, fast.
// ---------------------------------------------------------------------------

class MockImageProcessProvider implements ImageProcessProvider {
  async process(raw: Buffer): Promise<ProcessedImages> {
    const tuned = await sharp(raw)
      .rotate()
      .resize({ width: 1400, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    const thumb = await makeThumb(tuned);
    return { tuned, thumb };
  }
}

// ---------------------------------------------------------------------------
// RealImageProcessProvider - Replicate-driven cleanup.
// ---------------------------------------------------------------------------

class RealImageProcessProvider implements ImageProcessProvider {
  constructor(private readonly apiToken: string) {}

  async process(raw: Buffer): Promise<ProcessedImages> {
    const normalized = await sharp(raw)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();

    const generated = await runNanoBananaCleanup(this.apiToken, normalized);
    const tuned = await sharp(generated)
      .rotate()
      .resize({ width: 1400, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    const thumb = await makeThumb(tuned);
    return { tuned, thumb };
  }
}

// ---------------------------------------------------------------------------
// Factory. Defaults to mock; the explicit `IMAGE_WORKER_MODE=real` opt-in
// is the only way to spend Replicate credits on cleanup.
// ---------------------------------------------------------------------------

export function getImageProcessProvider(
  cfg: ImageWorkerConfig,
): ImageProcessProvider {
  if (cfg.mode === 'real' && cfg.replicateApiToken) {
    return new RealImageProcessProvider(cfg.replicateApiToken);
  }
  return new MockImageProcessProvider();
}

const NANO_BANANA_PREDICTIONS_URL =
  'https://api.replicate.com/v1/models/google/nano-banana-pro/predictions';

const CLEANUP_PROMPT = [
  'Create a clean e-commerce catalog image of only the fashion item from the reference photo.',
  'If the item is worn by a person, reconstruct the garment or accessory without the person.',
  'Preserve the real color, pattern, fabric texture, silhouette, length, neckline, sleeves, hardware, and visible details.',
  'Center the item, show the full item with no cropping, and place it on a clean light neutral studio background.',
  'No person, no mannequin, no hanger, no hands, no text, no logo, no extra objects, no messy room.',
].join(' ');

const POLL_INTERVAL_MS = 1_500;
const MAX_WAIT_MS = 120_000;

async function runNanoBananaCleanup(
  apiToken: string,
  rawImage: Buffer,
): Promise<Buffer> {
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[image-process] ${msg}`);
  const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);

  log('POST Replicate google/nano-banana-pro cleanup');
  const createRes = await fetch(NANO_BANANA_PREDICTIONS_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiToken}`,
      'content-type': 'application/json',
      prefer: 'wait=60',
    },
    body: JSON.stringify({
      input: {
        prompt: CLEANUP_PROMPT,
        image_input: [toDataUri(rawImage)],
        aspect_ratio: '3:4',
        resolution: '1K',
        output_format: 'jpg',
        safety_filter_level: 'block_medium_and_above',
        allow_fallback_model: false,
      },
    }),
  });
  if (!createRes.ok) {
    const body = await safeText(createRes);
    throw new Error(
      `Replicate cleanup create failed: ${createRes.status} ${body.slice(0, 240)}`,
    );
  }

  const created = (await createRes.json()) as ReplicatePrediction;
  const id = created.id;
  if (!id) {
    throw new Error('Replicate cleanup create returned no id');
  }
  log(`prediction ${id} created (status=${created.status ?? 'unknown'})`);

  let pred = created;
  let lastStatus = pred.status;
  const started = Date.now();
  while (pred.status === 'starting' || pred.status === 'processing') {
    if (Date.now() - started > MAX_WAIT_MS) {
      throw new Error(`Replicate prediction ${id} timed out after ${MAX_WAIT_MS}ms`);
    }
    await sleep(POLL_INTERVAL_MS);
    const getRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { authorization: `Bearer ${apiToken}` },
    });
    if (!getRes.ok) {
      const body = await safeText(getRes);
      throw new Error(
        `Replicate cleanup get failed: ${getRes.status} ${body.slice(0, 240)}`,
      );
    }
    pred = (await getRes.json()) as ReplicatePrediction;
    if (pred.status !== lastStatus) {
      log(`prediction ${id}: ${lastStatus} -> ${pred.status} (${elapsed()}s)`);
      lastStatus = pred.status;
    }
  }

  if (pred.status === 'failed' || pred.status === 'canceled') {
    throw new Error(
      `Replicate prediction ${id} ${pred.status}: ${pred.error ?? 'no error detail'}`,
    );
  }

  const outputUrl = Array.isArray(pred.output)
    ? pred.output[0]
    : typeof pred.output === 'string'
      ? pred.output
      : undefined;
  if (!outputUrl) {
    throw new Error(`Replicate cleanup ${id} succeeded but returned no image URL`);
  }

  log('downloading cleaned fashion item...');
  const imgRes = await fetch(outputUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download cleanup output: ${imgRes.status}`);
  }
  const image = Buffer.from(await imgRes.arrayBuffer());
  log(`downloaded ${(image.length / 1024).toFixed(0)} KB after ${elapsed()}s`);
  return image;
}

interface ReplicatePrediction {
  id?: string;
  status?: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[];
  error?: string;
}

function toDataUri(buf: Buffer): string {
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
