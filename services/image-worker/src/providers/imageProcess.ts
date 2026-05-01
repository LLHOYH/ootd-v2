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
//   - RealImageProcessProvider — Replicate `cjwbw/rembg` for bg-removal
//     followed by `bytedance/sdxl-lightning-4step` (or similar) for studio
//     compositing. Wired but only instantiated when REPLICATE_API_TOKEN is
//     set. Falls back gracefully — see the comment at the top of `tune`.

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
// MockImageProcessProvider — re-encodes the raw to WebP for the "tuned"
// output (no real bg-removal) and produces a sharp-resized thumbnail.
// Deterministic, offline, fast.
// ---------------------------------------------------------------------------

class MockImageProcessProvider implements ImageProcessProvider {
  async process(raw: Buffer): Promise<ProcessedImages> {
    const tuned = await sharp(raw).rotate().webp({ quality: 90 }).toBuffer();
    const thumb = await makeThumb(raw);
    return { tuned, thumb };
  }
}

// ---------------------------------------------------------------------------
// RealImageProcessProvider — Replicate-driven. Stays a stub-style class
// here: wires the API surface (predictions.create + poll) but the model
// IDs are placeholders until we settle the §14 OQ-2 decision. Until then
// IMAGE_WORKER_MODE=real with REPLICATE_API_TOKEN set will throw a clear
// error rather than silently degrade — we want a hard failure before
// burning credits on a model that hasn't been chosen yet.
// ---------------------------------------------------------------------------

class RealImageProcessProvider implements ImageProcessProvider {
  constructor(_apiToken: string) {
    // _apiToken intentionally unused until real model wiring lands.
  }
  async process(_raw: Buffer): Promise<ProcessedImages> {
    throw new Error(
      'RealImageProcessProvider is not implemented yet — set IMAGE_WORKER_MODE=mock or leave REPLICATE_API_TOKEN unset. Real wiring lands once §14 OQ-2 (model choice) is settled.',
    );
  }
}

// ---------------------------------------------------------------------------
// Factory. Defaults to mock; the explicit `IMAGE_WORKER_MODE=real` opt-in
// is the only way to swap to real (today: throws). When real lands, this
// can flip to "use real if REPLICATE_API_TOKEN is present" like vision.ts.
// ---------------------------------------------------------------------------

export function getImageProcessProvider(
  cfg: ImageWorkerConfig,
): ImageProcessProvider {
  if (cfg.mode === 'real' && cfg.replicateApiToken) {
    return new RealImageProcessProvider(cfg.replicateApiToken);
  }
  return new MockImageProcessProvider();
}
