import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type ChipSize = 'sm' | 'md';

export interface ChipProps {
  children: React.ReactNode;
  onPress?: () => void;
  active?: boolean;
  size?: ChipSize;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * Filter / quick-reply pill. SPEC §5.3:
 * - radius 999 (pill)
 * - padding 5×11
 * - active: filled brand pink, white text
 * - inactive: transparent + 0.5px (hairline) border, secondary text
 */
export function Chip({
  children,
  onPress,
  active = false,
  size = 'md',
  style,
  accessibilityLabel,
}: ChipProps) {
  const theme = useTheme();

  const fontSize =
    size === 'sm' ? theme.type.size.tiny : theme.type.size.caption;

  const containerStyle: ViewStyle = active
    ? {
        backgroundColor: theme.color.brand,
        borderColor: theme.color.brand,
      }
    : {
        backgroundColor: 'transparent',
        borderColor: theme.color.border.default,
      };

  const textColor = active ? '#FFFFFF' : theme.color.text.secondary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.base,
        { borderRadius: theme.radius.pill },
        containerStyle,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          {
            fontSize,
            color: textColor,
            fontWeight: theme.type.weight.medium as '500',
          },
        ]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  label: {
    includeFontPadding: false,
  },
  pressed: {
    opacity: 0.7,
  },
});
