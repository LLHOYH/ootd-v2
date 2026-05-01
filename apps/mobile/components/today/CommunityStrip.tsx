import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, SectionHeader, useTheme } from '@mei/ui';
import type { TodayCommunityLook } from './types';

export interface CommunityStripProps {
  looks: TodayCommunityLook[];
  subtitle: string; // e.g. "Singapore · 25–30 · today"
  onLookPress?: (look: TodayCommunityLook) => void;
}

export function CommunityStrip({ looks, subtitle, onLookPress }: CommunityStripProps) {
  const theme = useTheme();

  if (looks.length === 0) return null;

  return (
    <View>
      <SectionHeader title="What others are wearing" />
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // flexGrow: 0 — keeps the strip content-sized even when nested
        // in a flex-column parent (e.g. on web where ScrollView would
        // otherwise inflate vertically).
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: theme.space.sm, paddingRight: theme.space.lg }}
      >
        {looks.map((look) => (
          <Pressable
            key={look.id}
            onPress={() => onLookPress?.(look)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${look.username}'s look`}
            style={styles.tap}
          >
            <Avatar initials={look.initials} size={70} ringed="plain" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
