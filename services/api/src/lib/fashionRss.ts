// Fashion-now editorial cards, sourced from real RSS feeds.
//
// SPEC §10.1 + §13.3: the "Fashion now" strip on the Today screen pulls
// from external RSS in P2 (until now we shipped 4 placehold.co stubs).
// This module is the P2 implementation.
//
// Design notes:
//
// - Multiple feeds are tried in parallel and merged. A single feed
//   timing out or returning broken XML doesn't break the strip — we
//   just lose those entries and surface whatever the others returned.
// - Cards are cached in module-memory for FASHION_NOW_TTL_MS (1 hour)
//   so warm Lambda invocations skip the network entirely. Cold starts
//   pay the fetch (parallelized across feeds, ~1s).
// - Hard ceiling on time: any single feed that hasn't responded inside
//   FETCH_TIMEOUT_MS is abandoned. The Today payload is user-facing —
//   we never want it gated on a slow third-party.
// - If after all that the merged result is empty, callers fall back to
//   the FALLBACK_CARDS array (the old placeholder set, modernized to
//   stable image hosts).
//
// Adding a new feed: append to FEEDS. The parser handles RSS 2.0 +
// Atom, picks images from media:content / media:thumbnail / enclosure
// / first <img> in description (in that priority order). If a new
// publisher exposes images differently, extend extractImageUrl.

import { XMLParser } from 'fast-xml-parser';
import type { FashionNowCard } from '@mei/types';

interface FeedConfig {
  /** Stable id used as a prefix on the FashionNowCard.id so cards from
   * different feeds don't collide and the client can dedupe by id. */
  source: string;
  url: string;
  /** User-friendly source name for the card's `sourceUrl` link target.
   * The card link itself is the per-item link from the feed. */
  publisherUrl: string;
}

const FEEDS: FeedConfig[] = [
  {
    source: 'elle-fashion',
    url: 'https://www.elle.com/rss/fashion.xml/',
    publisherUrl: 'https://www.elle.com/fashion/',
  },
  {
    source: 'r29-fashion',
    url: 'https://www.refinery29.com/en-us/fashion/rss.xml',
    publisherUrl: 'https://www.refinery29.com/en-us/fashion',
  },
];

/** How long a cached merged result stays valid before we re-fetch. */
const FASHION_NOW_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Per-feed network timeout. Kept tight — Today is user-facing. */
const FETCH_TIMEOUT_MS = 4_000;

/** Strip count we hand back to /today (mockup shows 6, give some buffer). */
const MAX_CARDS = 8;

const USER_AGENT = 'Mei-RSS/1.0 (+https://github.com/LLHOYH/ootd-v2)';

// Parser: keep attributes on tags (we need media:content[@url]) and let
// CDATA pass through unchanged.
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  parseTagValue: false,
  trimValues: true,
});

interface CacheEntry {
  cards: FashionNowCard[];
  expiresAt: number;
}

let cache: CacheEntry | null = null;
let inflight: Promise<FashionNowCard[]> | null = null;

/**
 * Cards used when every feed fails (network down, all blocked, etc.).
 * Same shape as the old hardcoded placeholders, but pointing at stable
 * Unsplash CDN URLs so the strip still shows real photos rather than
 * coloured rectangles. Update the curated set once a quarter or so.
 */
const FALLBACK_CARDS: FashionNowCard[] = [
  {
    id: 'fn-fallback-1',
    title: 'Slip dresses, layered',
    imageUrl:
      'https://images.unsplash.com/photo-1485518882345-15568b007407?w=600&q=70',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-20T09:00:00.000Z',
  },
  {
    id: 'fn-fallback-2',
    title: 'Tan leather, head to toe',
    imageUrl:
      'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=70',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-22T09:00:00.000Z',
  },
  {
    id: 'fn-fallback-3',
    title: 'Sheer knits over cotton',
    imageUrl:
      'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=70',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-24T09:00:00.000Z',
  },
  {
    id: 'fn-fallback-4',
    title: 'Ballet flats are back',
    imageUrl:
      'https://images.unsplash.com/photo-1551803091-e20673f15770?w=600&q=70',
    sourceUrl: 'https://www.vogue.com/fashion-shows',
    publishedAt: '2026-04-25T09:00:00.000Z',
  },
];

/**
 * Public entry point. Returns ≤MAX_CARDS cards, freshest first. Always
 * returns at least the fallback set — never empty, never throws.
 */
export async function getFashionNowCards(): Promise<FashionNowCard[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now && cache.cards.length > 0) {
    return cache.cards;
  }
  // Single in-flight refresh — if two /today requests race, they share.
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const merged = await fetchAllFeeds();
      if (merged.length === 0) {
        // Don't cache an empty result — try again on the next call.
        return FALLBACK_CARDS;
      }
      cache = { cards: merged, expiresAt: now + FASHION_NOW_TTL_MS };
      return merged;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Test seam — reset the module cache between tests / for forced refresh. */
export function clearFashionNowCache(): void {
  cache = null;
  inflight = null;
}

async function fetchAllFeeds(): Promise<FashionNowCard[]> {
  const settled = await Promise.allSettled(FEEDS.map((f) => fetchOneFeed(f)));
  const cards: FashionNowCard[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled') cards.push(...result.value);
  }
  // Newest first, then cap.
  cards.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return cards.slice(0, MAX_CARDS);
}

async function fetchOneFeed(feed: FeedConfig): Promise<FashionNowCard[]> {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(feed.url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/rss+xml,application/xml,text/xml' },
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const text = await res.text();
    const parsed = xml.parse(text) as unknown;
    return mapFeedToCards(parsed, feed);
  } catch {
    // Swallow per-feed failures so one bad feed doesn't blank the strip.
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------- Parsing -----------------------------------------------------

interface RssItem {
  title?: string | { '#cdata'?: string };
  link?: string | string[];
  guid?: string | { '#text'?: string; '@_isPermaLink'?: string };
  description?: string | { '#cdata'?: string };
  pubDate?: string;
  // media:content / media:thumbnail land here with the namespace stripped
  // by fast-xml-parser. We always read the @_url attribute.
  'media:content'?: { '@_url'?: string } | { '@_url'?: string }[];
  'media:thumbnail'?: { '@_url'?: string } | { '@_url'?: string }[];
  enclosure?: { '@_url'?: string; '@_type'?: string };
  // Atom variant
  published?: string;
  updated?: string;
  content?: string | { '#text'?: string };
}

function mapFeedToCards(parsed: unknown, feed: FeedConfig): FashionNowCard[] {
  const items = extractItems(parsed);
  const out: FashionNowCard[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const title = stripHtml(readMaybeCdata(item.title));
    const link = readLink(item.link) ?? readGuidAsUrl(item.guid);
    const imageUrl = extractImageUrl(item);
    const publishedAt = toIsoOrNull(item.pubDate ?? item.published ?? item.updated);
    if (!title || !link || !imageUrl || !publishedAt) continue;
    out.push({
      id: `${feed.source}-${i}-${hashString(link)}`,
      title,
      imageUrl,
      sourceUrl: link,
      publishedAt,
    });
  }
  return out;
}

function extractItems(parsed: unknown): RssItem[] {
  // RSS 2.0: rss.channel.item; Atom: feed.entry. Both can be a single
  // object (one item) or an array. fast-xml-parser doesn't normalize.
  const root = parsed as Record<string, unknown> | undefined;
  if (!root || typeof root !== 'object') return [];
  const rss = (root.rss ?? root.RSS) as Record<string, unknown> | undefined;
  if (rss && typeof rss === 'object') {
    const channel = rss.channel as Record<string, unknown> | undefined;
    return asArray(channel?.item) as RssItem[];
  }
  const feed = root.feed as Record<string, unknown> | undefined;
  if (feed && typeof feed === 'object') {
    return asArray(feed.entry) as RssItem[];
  }
  return [];
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** RSS values often arrive as either a plain string, a `{ '#cdata': … }`
 * envelope (when fast-xml-parser unwraps `<![CDATA[…]]>`), or a
 * `{ '#text': … }` envelope (Atom). Normalize all three to a plain
 * string. */
function readMaybeCdata(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const obj = v as { '#cdata'?: unknown; '#text'?: unknown };
    if (typeof obj['#cdata'] === 'string') return obj['#cdata'];
    if (typeof obj['#text'] === 'string') return obj['#text'];
  }
  return '';
}

function readLink(v: RssItem['link']): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    // Atom <link href="..." rel="alternate"/> — fast-xml-parser puts it
    // as an object with @_href. Try to pick the alternate; fall back to
    // the first. This branch covers both string[] and object[].
    for (const entry of v) {
      if (typeof entry === 'string' && entry.length > 0) return entry;
      const obj = entry as { '@_href'?: string; '@_rel'?: string };
      if (obj && obj['@_href'] && (obj['@_rel'] === 'alternate' || !obj['@_rel'])) {
        return obj['@_href'];
      }
    }
  }
  return null;
}

function readGuidAsUrl(guid: RssItem['guid']): string | null {
  if (!guid) return null;
  if (typeof guid === 'string') {
    return /^https?:\/\//.test(guid) ? guid : null;
  }
  const text = guid['#text'];
  if (typeof text === 'string' && /^https?:\/\//.test(text)) return text;
  return null;
}

function extractImageUrl(item: RssItem): string | null {
  // 1. media:content[@url] — Elle, many Hearst feeds.
  const mediaContent = item['media:content'];
  if (mediaContent) {
    const arr = asArray(mediaContent);
    for (const m of arr) {
      const url = m?.['@_url'];
      if (typeof url === 'string' && url.length > 0) return url;
    }
  }
  // 2. media:thumbnail[@url].
  const mediaThumb = item['media:thumbnail'];
  if (mediaThumb) {
    const arr = asArray(mediaThumb);
    for (const m of arr) {
      const url = m?.['@_url'];
      if (typeof url === 'string' && url.length > 0) return url;
    }
  }
  // 3. enclosure[@url] (must be an image type).
  const enclosure = item.enclosure;
  if (enclosure?.['@_url']) {
    const type = enclosure['@_type'] ?? '';
    if (type.startsWith('image/') || type === '') return enclosure['@_url'];
  }
  // 4. First <img src="..."> in description / content. Refinery29-style.
  const html = readMaybeCdata(item.description) || readMaybeCdata(item.content);
  if (html) {
    const m = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
    if (m && m[1]) return m[1];
  }
  return null;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .trim();
}

function toIsoOrNull(input: string | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Tiny non-cryptographic hash so card ids stay stable per (feed,link) pair
 * but don't bloat with the full URL. djb2. */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
