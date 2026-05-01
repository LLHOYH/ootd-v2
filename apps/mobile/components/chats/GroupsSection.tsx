import { View } from 'react-native';
import { SectionHeader } from '@mei/ui';
import { ThreadRow } from './ThreadRow';
import type { ChatThreadRow } from './types';

export interface GroupsSectionProps {
  threads: ChatThreadRow[];
  onSelect: (thread: ChatThreadRow) => void;
}

/**
 * Groups section — includes hangout-style rows. Hangout rows show the
 * `Today · 11:00 · Tiong Bahru` subtitle and a pink unread dot when relevant.
 */
export function GroupsSection({ threads, onSelect }: GroupsSectionProps) {
  if (threads.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Groups" />
      {threads.map((thread, index) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          isLast={index === threads.length - 1}
          onPress={() => onSelect(thread)}
        />
      ))}
    </View>
  );
}
