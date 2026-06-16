/**
 * Mei — design tokens
 *
 * Single source of truth for color, type, spacing, radius, and motion.
 * Consumed by the theme provider in `packages/ui`.
 *
 * Notes
 * - Brand accent is classic iOS system blue (#007AFF).
 * - Light surfaces follow grouped iOS: white, grouped light gray, graphite text.
 * - Two type weights only: 400 and 500. Never 600+.
 */

export const tokens = {
  color: {
    // Classic iOS action blue.
    blue: {
      50:  '#EAF3FF',
      100: '#D6E8FF',
      300: '#66B2FF',
      400: '#007AFF',
      600: '#0051D5',
      800: '#0A315F',
    },

    // Neutral surfaces - iOS grouped light/dark.
    light: {
      bgPrimary:    '#FFFFFF',
      bgSecondary:  '#F2F2F7',
      bgTertiary:   '#E5E5EA',
      textPrimary:  '#1C1C1E',
      textSecondary:'#636366',
      textTertiary: '#8E8E93',
      borderDefault:'rgba(60,60,67,0.16)',
      borderStrong: 'rgba(60,60,67,0.28)',
    },
    dark: {
      bgPrimary:    '#000000',
      bgSecondary:  '#1C1C1E',
      bgTertiary:   '#2C2C2E',
      textPrimary:  '#FFFFFF',
      textSecondary:'#AEAEB2',
      textTertiary: '#8E8E93',
      borderDefault:'rgba(84,84,88,0.48)',
      borderStrong: 'rgba(99,99,102,0.72)',
    },

    // Restrained wardrobe neutrals for placeholders and category accents.
    palette: {
      cream: '#F7F7F8',
      mauve: '#E5E5EA',
      sage:  '#D9E5DF',
      blue:  '#DBEAFE',
      tan:   '#DED6CC',
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
      h1:      30,
      h2:      20,
      body:    16,
      caption: 14,
      tiny:    12,
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
    md:   14,
    lg:   18,
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
    fab:   '0 8px 22px rgba(0, 122, 255, 0.28)',
    card:  '0 1px 2px rgba(28, 28, 30, 0.05)',
    modal: '0 10px 40px rgba(0, 0, 0, 0.18)',
  },
} as const;

export type Tokens = typeof tokens;
