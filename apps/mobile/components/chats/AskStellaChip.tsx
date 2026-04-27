import { Pressable, StyleSheet, Text } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface AskStellaChipProps {
  onPress: () => void;
}

/**
 * Full-width pink quick-action chip below the Chats header.
 * SPEC §10.6, CHANGES.md changeset 01: hidden when Stella's pinned row
 * already shows an unread indicator (the unread dot is the affordance).
 */
export function AskStellaChip({ onPress }: AskStellaChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Ask Stella"
      style={[
        styles.chip,
        {
          backgroundColor: theme.color.brand,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space.lg,
          gap: theme.space.sm,
        },
      ]}
    >
      <Sparkles size={16} color="#FFFFFF" strokeWidth={1.6} />
      <Text
        style={[
          styles.label,
          {
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.medium as '500',
          },
        ]}
      >
        Ask Stella
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: '#FFFFFF',
  },
});
