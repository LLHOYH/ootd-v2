// Shape interfaces consumed by the chats inbox sections + ThreadRow.
//
// The hook `useChatThreads` produces these by adapting `ChatThread` from the
// api response (counterparty lookup for DM titles, member-initials derivation
// for group/hangout stacked avatars, relative time labels). Keeping the
// component prop type local means we can swap implementations behind it
// without touching every section component.

export type ChatThreadType = 'STELLA' | 'GROUP' | 'HANGOUT' | 'DIRECT';

export interface ChatThreadMemberAvatar {
  initials: string;
  /** Pastel background key from theme.color.palette. */
  palette: 'cream' | 'mauve' | 'sage' | 'blue' | 'tan';
}

/**
 * Inbox row payload — UI-only projection of `ChatThread` plus the
 * counterparty enrichment the screen needs.
 */
export interface ChatThreadRow {
  id: string;
  type: ChatThreadType;
  /** Display title — counterparty name for DMs, thread.name otherwise. */
  name: string;
  /** Last message preview text. Empty when the thread is brand-new. */
  preview: string;
  /** Compact relative time, e.g. "2m", "3h", "1d". */
  timeLabel: string;
  /** Caller's unread_count for this thread. */
  unread: number;
  /** Single-avatar threads (Stella + Direct). */
  avatarInitials?: string;
  avatarUrl?: string;
  avatarRing?: 'pink' | 'plain';
  /** Optional second line, e.g. hangout time + place. */
  subtitle?: string;
  /** Group / hangout member avatars (stacked). */
  memberAvatars?: ChatThreadMemberAvatar[];
}
