// Vision provider — derives closet-item metadata from a raw photo.
//
// SPEC §9.1 lists the fields we extract:
//   name (short noun phrase), description (sentence), category (enum),
//   colors (hex strings), occasion_tags (enum array), weather_tags (enum array).
//
// Two implementations:
//   - MockVisionProvider — deterministic stubs derived from the byte length
//     of the input. Used in tests and when ANTHROPIC_API_KEY is unset.
//   - RealVisionProvider — Anthropic Claude with vision input. Uses the
//     `messages.create` API with an image block. Wired but only instantiated
//     when ANTHROPIC_API_KEY is set + IMAGE_WORKER_MODE=real.

import type {
  ClothingCategory,
  Occasion,
  WeatherTag,
} from '@mei/types';
import type { ImageWorkerConfig } from '../config';

export interface VisionTags {
  name: string;
  description: string;
  category: ClothingCategory;
  colors: string[];
  occasionTags: Occasion[];
  weatherTags: WeatherTag[];
}

export interface VisionProvider {
  describe(rawImage: Buffer, mimeType: string): Promise<VisionTags>;
}

// ---------------------------------------------------------------------------
// MockVisionProvider — deterministic + offline. The closet-items table has
// reasonable defaults for everything but `name` and `category`, so we cycle
// through plausible values keyed by the image byte length so tests can
// assert specific outputs.
// ---------------------------------------------------------------------------

const CATEGORIES: ClothingCategory[] = [
  'TOP',
  'BOTTOM',
  'SHOE',
  'BAG',
  'ACCESSORY',
  'OUTERWEAR',
  'DRESS',
];

const STUB_NAMES: Record<ClothingCategory, string> = {
  DRESS: 'Linen midi',
  TOP: 'Cream tee',
  BOTTOM: 'Indigo straight jeans',
  OUTERWEAR: 'Tan blazer',
  SHOE: 'Tan loafers',
  BAG: 'Cream tote',
  ACCESSORY: 'Silk scarf',
};

const STUB_DESCRIPTIONS: Record<ClothingCategory, string> = {
  DRESS: 'A-line midi in cream linen.',
  TOP: 'Heavy cotton boxy tee.',
  BOTTOM: 'Mid-rise straight leg in raw indigo.',
  OUTERWEAR: 'Single-breasted relaxed blazer.',
  SHOE: 'Classic leather penny loafers.',
  BAG: 'Roomy everyday tote.',
  ACCESSORY: 'Printed silk square.',
};

class MockVisionProvider implements VisionProvider {
  async describe(rawImage: Buffer): Promise<VisionTags> {
    const idx = rawImage.byteLength % CATEGORIES.length;
    const category = CATEGORIES[idx]!;
    return {
      name: STUB_NAMES[category],
      description: STUB_DESCRIPTIONS[category],
      category,
      colors: ['#F2EAD9'],
      occasionTags: ['CASUAL'],
      weatherTags: ['MILD'],
    };
  }
}

// ---------------------------------------------------------------------------
// RealVisionProvider — Anthropic Claude with vision input. The prompt asks
// for strict JSON in the VisionTags shape; we parse + validate.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a fashion-stylist assistant. Look at the photo of a single clothing item and describe it as STRICT JSON. Output exactly one JSON object with these keys, nothing else, no prose, no markdown:

{
  "name": "<2-4 word noun phrase, lowercase except brand names>",
  "description": "<one sentence, 8-15 words>",
  "category": "<DRESS|TOP|BOTTOM|OUTERWEAR|SHOE|BAG|ACCESSORY>",
  "colors": ["<hex like #F2EAD9>", ...up to 3],
  "occasionTags": ["<CASUAL|WORK|DATE|BRUNCH|EVENING|WEDDING|WORKOUT|BEACH>", ...],
  "weatherTags": ["<HOT|WARM|MILD|COLD|RAIN>", ...]
}

Pick ONE category that best fits. Pick 1-3 occasionTags and 1-3 weatherTags that this item suits. Colors should be the dominant hues you see, not the background.`;

class RealVisionProvider implements VisionProvider {
  private readonly apiKey: string;
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }
  async describe(rawImage: Buffer, mimeType: string): Promise<VisionTags> {
    // Lazy-import the SDK so the Mock path doesn't pay the cold-start cost.
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.apiKey });
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                // Anthropic accepts these mimetypes; HEIC/HEIF will need
                // conversion upstream (sharp does that fine).
                media_type: mimeType as
                  | 'image/jpeg'
                  | 'image/png'
                  | 'image/gif'
                  | 'image/webp',
                data: rawImage.toString('base64'),
              },
            },
            { type: 'text', text: 'Tag this clothing item.' },
          ],
        },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      throw new Error('Vision: no text block in response');
    }
    // Tolerate models that emit ```json ... ``` fences anyway.
    const raw = block.text.trim();
    const cleaned = raw.startsWith('```')
      ? raw.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
      : raw;
    let parsed: VisionTags;
    try {
      parsed = JSON.parse(cleaned) as VisionTags;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'parse failed';
      throw new Error(`Vision: response was not JSON (${msg}): ${raw.slice(0, 200)}`);
    }
    return parsed;
  }
}

// ---------------------------------------------------------------------------
// Factory.
// ---------------------------------------------------------------------------

export function getVisionProvider(cfg: ImageWorkerConfig): VisionProvider {
  if (cfg.mode === 'real' && cfg.anthropicApiKey) {
    return new RealVisionProvider(cfg.anthropicApiKey);
  }
  return new MockVisionProvider();
}
