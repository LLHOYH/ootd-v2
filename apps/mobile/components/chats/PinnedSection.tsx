import { View } from 'react-native';
import { SectionHeader } from '@mei/ui';
import { ThreadRow } from './ThreadRow';
import type { ChatThreadRow } from './types';

export interface PinnedSectionProps {
  threads: ChatThreadRow[];
  onSelect: (thread: ChatThreadRow) => void;
}

/**
 * Pinned section — currently always Stella (SPEC §10.6).
 */
export function PinnedSection({ threads, onSelect }: PinnedSectionProps) {
  if (threads.length === 0) return null;

  return (
    <View>
      <SectionHeader title="Pinned" />
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
