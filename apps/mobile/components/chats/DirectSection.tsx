import { View } from 'react-native';
import { SectionHeader } from '@mei/ui';
import { ThreadRow } from './ThreadRow';
import type { MockThread } from './mocks';

export interface DirectSectionProps {
  threads: MockThread[];
  onSelect: (thread: MockThread) => void;
}

/**
 * Direct messages section — 1:1 threads.
 */
export function DirectSection({ threads, onSelect }: DirectSectionProps) {
  if (threads.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Direct" />
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
