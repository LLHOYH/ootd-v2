import React from 'react';
import { Image, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type AvatarRing = 'pink' | 'plain';

export interface AvatarProps {
  initials: string;
  size: number;
  src?: string;
  ringed?: AvatarRing;
  style?: ViewStyle;
}

/**
 * Circular avatar. Falls back to monogram initials on `brand.bg` when no src.
 * `ringed` adds a 1.5px outline (pink = brand, plain = border).
 */
export function Avatar({ initials, size, src, ringed, style }: AvatarProps) {
  const theme = useTheme();

  const ringWidth = ringed ? 1.5 : 0;
  const ringColor =
    ringed === 'pink'
      ? theme.color.brand
      : ringed === 'plain'
      ? theme.color.border.strong
      : 'transparent';

  // Initial font is roughly 38% of the avatar — readable across sizes.
  const initialsFontSize = Math.max(theme.type.size.tiny, Math.round(size * 0.38));

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.color.brandBg,
          borderWidth: ringWidth,
          borderColor: ringColor,
        },
        style,
      ]}
      accessibilityRole="image"
      accessibilityLabel={initials}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={{
            color: theme.color.brandOn,
            fontFamily: theme.type.family.serif,
            fontSize: initialsFontSize,
            fontWeight: theme.type.weight.medium as '500',
          }}
        >
          {initials}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
