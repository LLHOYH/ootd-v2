// Map a `ChatThreadView` (from useChatThreads) → `ChatThreadRow` (consumed
// by ThreadRow + the section components). Keeps the section components
// agnostic of how the data is sourced.

import type { ChatThreadView } from '@/lib/hooks/useChatThreads';
import type { ChatThreadRow } from './types';

const PALETTES = ['cream', 'mauve', 'sage', 'blue', 'tan'] as const;

export function adaptThreadRow(view: ChatThreadView): ChatThreadRow {
  const out: ChatThreadRow = {
    id: view.thread.threadId,
    type: view.thread.type,
    name: view.title,
    preview: view.preview,
    timeLabel: view.timeLabel,
    unread: view.unread,
  };
  if (view.thread.type === 'STELLA') {
    out.avatarRing = 'pink';
  }
  if (view.avatarInitials) out.avatarInitials = view.avatarInitials;
  if (view.avatarUrl) out.avatarUrl = view.avatarUrl;
  if (view.subtitle) out.subtitle = view.subtitle;
  if (view.memberInitials && view.memberInitials.length > 0) {
    out.memberAvatars = view.memberInitials.map((initials, i) => ({
      initials,
      palette: PALETTES[i % PALETTES.length] ?? 'cream',
    }));
  }
  return out;
}
