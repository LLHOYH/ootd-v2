// Model-photo provider - creates a reusable studio reference from selfies.
//
// Real mode uses Replicate google/nano-banana-pro because it accepts multiple
// reference images through `image_input` and returns a single edited image.
// Mock mode keeps the pipeline testable with no token by fitting the latest
// selfie onto a neutral 3:4 studio canvas.

import sharp from 'sharp';
import type { ImageWorkerConfig } from '../config';

export interface ModelPhotoInput {
  selfies: Buffer[];
  /** Number of leading `selfies` entries that are face-focused identity crops. */
  identityReferenceCount?: number;
  logTag?: string;
}

export interface ModelPhotoResult {
  image: Buffer;
  providerId?: string;
}

export interface ModelPhotoProvider {
  generate(input: ModelPhotoInput): Promise<ModelPhotoResult>;
}

class MockModelPhotoProvider implements ModelPhotoProvider {
  async generate(input: ModelPhotoInput): Promise<ModelPhotoResult> {
    const selfie = input.selfies[input.identityReferenceCount ?? 0] ?? input.selfies[0];
    if (!selfie) throw new Error('No selfies provided');

    const image = await sharp(selfie)
      .rotate()
      .resize({
        width: 900,
        height: 1200,
        fit: 'contain',
        background: { r: 247, g: 244, b: 240, alpha: 1 },
        withoutEnlargement: false,
      })
      .jpeg({ quality: 90 })
      .toBuffer();

    return { image, providerId: 'mock-model-photo' };
  }
}

const NANO_BANANA_PREDICTIONS_URL =
  'https://api.replicate.com/v1/models/google/nano-banana-pro/predictions';

const MODEL_PHOTO_PROMPT = [
  'Create one realistic, full-body studio fashion model photo of the same adult person shown across the reference images.',
  'Reference order matters: the first reference images are close-up face identity anchors, and the later reference images show full-person context.',
  'Face identity is the highest priority: keep the same face geometry, eyes, eyelids, eyebrows, nose, mouth, smile shape, jawline, chin, cheek shape, skin tone, hair color, hair style, and age range.',
  'Make the person recognizably the same, not a generic fashion model. Do not change ethnicity, facial proportions, nose shape, eye shape, lip shape, jaw shape, or hairstyle.',
  'Use a slightly leaner, toned, photogenic version of their body with flattering posture and natural proportions. Do not make the body heavier, wider, bulky, or exaggerated.',
  'Make the person look a little prettier or more handsome, polished, confident, and healthy, while still looking like the same person.',
  'The outfit must be a plain fitted white t-shirt and plain white shorts, modest and opaque.',
  'Use a neutral standing pose, front-facing, arms relaxed, full body visible from head to feet.',
  'Use clean light gray studio background, natural soft lighting, no text, no logos, no extra people, no accessories, no clutter.',
].join(' ');

const FACE_REFINEMENT_PROMPT = [
  'Edit the first image only. Keep the full-body pose, body size, outfit, white t-shirt, white shorts, background, lighting, and framing unchanged.',
  'Use the following close-up face references as the identity source.',
  'Refine only the face, hairline, hair, skin tone, and facial details so the person strongly resembles the reference identity.',
  'Match the eyes, eyelids, eyebrows, nose, mouth, lip shape, jawline, chin, cheeks, face width, skin tone, and hairstyle from the references.',
  'Do not change the body. Do not make a new person. Subtle beautifying is allowed, but resemblance is more important than attractiveness.',
].join(' ');

const POLL_INTERVAL_MS = 1_500;
const MAX_WAIT_MS = 120_000;

class RealModelPhotoProvider implements ModelPhotoProvider {
  constructor(private readonly apiToken: string) {}

  async generate(input: ModelPhotoInput): Promise<ModelPhotoResult> {
    if (input.selfies.length === 0) throw new Error('No selfies provided');

    const tag = input.logTag ?? 'replicate';
    const t0 = Date.now();
    const log = (msg: string) => console.log(`[model-photo ${tag}] ${msg}`);
    const elapsed = () => ((Date.now() - t0) / 1000).toFixed(1);

    const identityCount = input.identityReferenceCount ?? 0;
    const identityRefs = input.selfies.slice(0, identityCount);
    const allRefs = input.selfies.slice(0, 10);

    log(
      `encoding ${identityRefs.length} identity crop(s) + ${Math.max(0, allRefs.length - identityRefs.length)} full reference(s) as data URIs`,
    );
    const base = await this.runPrediction({
      prompt: MODEL_PHOTO_PROMPT,
      imageInput: allRefs.map((buf) => toDataUri(buf)),
      stage: 'base',
      log,
      elapsed,
    });

    if (identityRefs.length === 0) {
      return { image: base.image, providerId: base.id };
    }

    log('running face identity refinement pass...');
    const refined = await this.runPrediction({
      prompt: FACE_REFINEMENT_PROMPT,
      imageInput: [toDataUri(base.image), ...identityRefs.slice(0, 5).map((buf) => toDataUri(buf))],
      stage: 'face-refine',
      log,
      elapsed,
    });
    return { image: refined.image, providerId: `${base.id}+${refined.id}` };
  }

  private async runPrediction(input: {
    prompt: string;
    imageInput: string[];
    stage: string;
    log: (msg: string) => void;
    elapsed: () => string;
  }): Promise<{ image: Buffer; id: string }> {
    input.log(`POST Replicate google/nano-banana-pro (${input.stage})`);
    const createRes = await fetch(NANO_BANANA_PREDICTIONS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiToken}`,
        'content-type': 'application/json',
        prefer: 'wait=60',
      },
      body: JSON.stringify({
        input: {
          prompt: input.prompt,
          image_input: input.imageInput,
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
        `Replicate ${input.stage} create failed: ${createRes.status} ${body.slice(0, 240)}`,
      );
    }

    const created = (await createRes.json()) as ReplicatePrediction;
    const id = created.id;
    if (!id) {
      throw new Error(`Replicate ${input.stage} create returned no id`);
    }
    input.log(`prediction ${id} created (stage=${input.stage}, status=${created.status ?? 'unknown'})`);

    let pred = created;
    let lastStatus = pred.status;
    const started = Date.now();
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
        input.log(`prediction ${id}: ${lastStatus} -> ${pred.status} (${input.elapsed()}s)`);
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
      throw new Error(`Replicate prediction ${id} succeeded but returned no image URL`);
    }

    input.log(`downloading generated image for ${input.stage}...`);
    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) {
      throw new Error(`Failed to download model-photo output: ${imgRes.status}`);
    }
    const image = Buffer.from(await imgRes.arrayBuffer());
    input.log(`downloaded ${(image.length / 1024).toFixed(0)} KB after ${input.elapsed()}s`);
    return { image, id };
  }
}

export function getModelPhotoProvider(cfg: ImageWorkerConfig): ModelPhotoProvider {
  if (cfg.mode === 'real' && cfg.replicateApiToken) {
    return new RealModelPhotoProvider(cfg.replicateApiToken);
  }
  return new MockModelPhotoProvider();
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
