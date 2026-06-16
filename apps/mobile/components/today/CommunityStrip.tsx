import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SectionHeader, useTheme } from '@mei/ui';
import type { TodayCommunityLook } from './types';

export interface CommunityStripProps {
  looks: TodayCommunityLook[];
  subtitle: string; // e.g. "Singapore · 25–30 · today"
  onLookPress?: (look: TodayCommunityLook) => void;
  onSeeAll?: () => void;
}

const CARD_COLORS = ['mauve', 'sage', 'tan', 'blue'] as const;

export function CommunityStrip({
  looks,
  subtitle,
  onLookPress,
  onSeeAll,
}: CommunityStripProps) {
  const theme = useTheme();

  if (looks.length === 0) return null;

  return (
    <View>
      <SectionHeader
        title="Community"
        action={onSeeAll ? { label: 'See all', onPress: onSeeAll } : undefined}
      />
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.regular as '400',
          marginTop: -theme.space.sm,
          marginBottom: theme.space.sm,
        }}
        numberOfLines={1}
      >
        {subtitle}
      </Text>

      <View style={styles.grid}>
        {looks.slice(0, 2).map((look, index) => {
          const colorKey = CARD_COLORS[index % CARD_COLORS.length] ?? 'mauve';
          return (
          <Pressable
            key={look.id}
            onPress={() => onLookPress?.(look)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${look.username}'s look`}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: theme.color.palette[colorKey],
                borderRadius: 18,
                marginRight: index % 2 === 0 ? '3%' : 0,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.h2,
                fontWeight: theme.type.weight.medium as '500',
              }}
            >
              {look.initials}
            </Text>
            <Text
              style={{
                color: theme.color.text.secondary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
                marginTop: theme.space.xs,
              }}
              numberOfLines={1}
            >
              {look.username}
            </Text>
          </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
  },
  card: {
    width: '48.5%',
    aspectRatio: 1 / 1.08,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
