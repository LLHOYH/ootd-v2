import { View } from 'react-native';
import { SectionHeader } from '@mei/ui';
import { ThreadRow } from './ThreadRow';
import type { ChatThreadRow } from './types';

export interface DirectSectionProps {
  threads: ChatThreadRow[];
  onSelect: (thread: ChatThreadRow) => void;
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
