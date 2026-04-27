/**
 * Mei — design tokens
 *
 * Single source of truth for color, type, spacing, radius, and motion.
 * Consumed by the theme provider in `packages/ui`.
 *
 * Notes
 * - Brand accent is `pink.400` (#D4537E). Dark-mode brand flips to `pink.300` (#ED93B1).
 * - Light surfaces lean cream-warm (#FFFFFF / #F5F3EE) — never cool grey.
 * - Two type weights only: 400 and 500. Never 600+.
 */

export const tokens = {
  color: {
    // Brand
    pink: {
      50:  '#FBEAF0',
      100: '#F4C0D1',
      300: '#ED93B1',  // dark-mode brand
      400: '#D4537E',  // light-mode brand
      600: '#993556',
      800: '#72243E',
    },

    // Neutral surfaces — warm, never grey
    light: {
      bgPrimary:    '#FFFFFF',
      bgSecondary:  '#F5F3EE',
      bgTertiary:   '#EDEAE3',
      textPrimary:  '#1A1A1A',
      textSecondary:'#5F5E5A',
      textTertiary: '#888780',
      borderDefault:'rgba(0,0,0,0.08)',
      borderStrong: 'rgba(0,0,0,0.15)',
    },
    dark: {
      bgPrimary:    '#1A1714',
      bgSecondary:  '#26221E',
      bgTertiary:   '#332E29',
      textPrimary:  '#F5F3EE',
      textSecondary:'#B8B4AC',
      textTertiary: '#7A7670',
      borderDefault:'rgba(255,255,255,0.10)',
      borderStrong: 'rgba(255,255,255,0.18)',
    },

    // Soft pastels — used for clothing thumbnail placeholders before photo loads,
    // and for category accent backgrounds.
    palette: {
      cream: '#F2EAD9',
      mauve: '#E5D5E0',
      sage:  '#D5DDD0',
      blue:  '#C5CFD9',
      tan:   '#DCC9B6',
    },

    // Semantic
    success: '#5A8A6A',
    warning: '#D4A653',
    danger:  '#C24E4E',
  },

  type: {
    family: {
      // System sans on iOS/Android — no custom font shipping in P0.
      sans:  'System',
      // Used ONLY for the wordmark "Mei" and editorial card titles.
      serif: 'Georgia, "New York", serif',
    },
    weight: {
      regular: '400',
      medium:  '500',
    },
    size: {
      h1:      22,
      h2:      16,
      body:    14,
      caption: 12,
      tiny:    11,
    },
    lineHeight: {
      tight: 1.2,
      body:  1.5,
    },
  },

  space: {
    xs:  4,
    sm:  8,
    md:  12,
    lg:  16,
    xl:  20,
    xxl: 24,
    xxxl:32,
    huge:48,
  },

  radius: {
    sm:   8,
    md:   12,
    lg:   16,
    pill: 999,
  },

  motion: {
    // ms
    fast:   150,
    normal: 220,
    slow:   320,
    // easing
    easeOut: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
    spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },

  shadow: {
    // Used sparingly — Mei prefers borders to shadows.
    fab:   '0 6px 16px rgba(212, 83, 126, 0.35)',
    card:  '0 1px 2px rgba(0, 0, 0, 0.04)',
    modal: '0 10px 40px rgba(0, 0, 0, 0.18)',
  },
} as const;

export type Tokens = typeof tokens;
