import type { Combination } from '@mei/types';

/**
 * Static mock conversation for the Stella chat modal.
 * SPEC §10.5 + §8.2 voice: short, warm, lowercase-leaning, occasional ☼/♡/✦.
 *
 * Backend wiring (SSE streaming, conversation persistence) lands later; this
 * powers the visual layout only.
 */

export interface StellaTextMessage {
  id: string;
  from: 'user' | 'ai';
  kind: 'text';
  text: string;
}

export interface StellaOutfitMessage {
  id: string;
  from: 'ai';
  kind: 'outfit';
  caption: string;
  combination: Combination;
}

export type StellaMessage = StellaTextMessage | StellaOutfitMessage;

export const mockBrunchCombination: Combination = {
  comboId: 'combo_mock_brunch',
  userId: 'user_mock_sophia',
  name: 'Linen midi · brunch',
  itemIds: ['item_linen_midi', 'item_woven_mules', 'item_straw_bag'],
  occasionTags: ['BRUNCH'],
  source: 'STELLA',
  createdAt: '2026-04-27T09:41:00.000Z',
};

export const mockConversation: StellaMessage[] = [
  {
    id: 'msg_1',
    from: 'ai',
    kind: 'text',
    text: 'morning, sophia ☼ brunch at 11 in tiong bahru — want me to put together a look?',
  },
  {
    id: 'msg_2',
    from: 'user',
    kind: 'text',
    text: 'Yes! Casual but cute. It\u2019s hot today.',
  },
  {
    id: 'msg_3',
    from: 'ai',
    kind: 'outfit',
    caption: 'pulling from your closet:',
    combination: mockBrunchCombination,
  },
  {
    id: 'msg_4',
    from: 'ai',
    kind: 'text',
    text: 'linen midi + woven mules. straw bag for the heat.',
  },
  {
    id: 'msg_5',
    from: 'user',
    kind: 'text',
    text: 'Love it. What if it rains?',
  },
  {
    id: 'msg_6',
    from: 'ai',
    kind: 'text',
    text: 'easy — swap the mules for your white sneakers and grab the olive trench. still cute, still you ♡',
  },
];

export const mockQuickReplies: string[] = [
  'Show alternatives',
  'Different vibe',
  'Wear this',
];
