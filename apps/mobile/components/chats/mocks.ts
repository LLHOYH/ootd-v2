/**
 * Mock thread data for the Chats inbox screen (SPEC §10.6).
 *
 * Real data lands later via `GET /chat/threads`. The shape here is a UI-only
 * projection — it omits things the real `ChatThread` carries (participantIds,
 * unreadCounts map, createdAt) and adds presentational hints (avatarInitials,
 * avatarRing, subtitle).
 */

export type MockThreadType = 'STELLA' | 'GROUP' | 'HANGOUT' | 'DIRECT';

export interface MockMemberAvatar {
  initials: string;
  /** Pastel background key from theme.color.palette. */
  palette: 'cream' | 'mauve' | 'sage' | 'blue' | 'tan';
}

export interface MockThread {
  id: string;
  type: MockThreadType;
  name: string;
  preview: string;
  timeLabel: string;
  unread: number;
  /** Single-avatar threads (Stella + Direct). */
  avatarInitials?: string;
  avatarRing?: 'pink' | 'plain';
  /** Hangout subtitle line, e.g. "Today · 11:00 · Tiong Bahru". */
  subtitle?: string;
  /** Group / hangout member avatars (stacked). */
  memberAvatars?: MockMemberAvatar[];
}

export const mockThreads: MockThread[] = [
  // Pinned — Stella
  {
    id: 'stella',
    type: 'STELLA',
    name: 'Stella',
    preview: 'Linen midi + woven mules. Straw bag…',
    timeLabel: '2m',
    unread: 0,
    avatarRing: 'pink',
  },

  // Groups — one hangout (with unread + members), one regular group
  {
    id: 'hangout-brunch',
    type: 'HANGOUT',
    name: 'Brunch crew · 4',
    preview: "Mei: yes I'm wearing the cream linen!",
    timeLabel: '10m',
    unread: 1,
    subtitle: 'Today · 11:00 · Tiong Bahru',
    memberAvatars: [
      { initials: 'M', palette: 'cream' },
      { initials: 'S', palette: 'mauve' },
    ],
  },
  {
    id: 'group-wedding',
    type: 'GROUP',
    name: 'Wedding squad · 6',
    preview: 'Sharing my closet picks for Sat…',
    timeLabel: '1h',
    unread: 0,
    memberAvatars: [
      { initials: 'J', palette: 'sage' },
      { initials: 'A', palette: 'blue' },
    ],
  },

  // Direct
  {
    id: 'dm-meili',
    type: 'DIRECT',
    name: 'meili',
    preview: 'Loved your OOTD ♡',
    timeLabel: '3h',
    unread: 0,
    avatarInitials: 'M',
  },
  {
    id: 'dm-serena',
    type: 'DIRECT',
    name: 'serena_x',
    preview: 'Coffee tmrw?',
    timeLabel: '1d',
    unread: 0,
    avatarInitials: 'S',
  },
  {
    id: 'dm-jia',
    type: 'DIRECT',
    name: 'jia.wen',
    preview: 'Send me that linen co-ord ref?',
    timeLabel: '2d',
    unread: 2,
    avatarInitials: 'J',
  },
  {
    id: 'dm-amelia',
    type: 'DIRECT',
    name: 'amelia',
    preview: 'Tagging you in the lookbook tonight',
    timeLabel: '3d',
    unread: 0,
    avatarInitials: 'A',
  },
];
