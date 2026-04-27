import { View } from 'react-native';
import { SectionHeader } from '@mei/ui';
import { ThreadRow } from './ThreadRow';
import type { MockThread } from './mocks';

export interface GroupsSectionProps {
  threads: MockThread[];
  onSelect: (thread: MockThread) => void;
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
