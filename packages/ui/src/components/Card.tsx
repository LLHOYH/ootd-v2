import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type CardTone = 'default' | 'accent' | 'pink' | 'plain';

export interface CardProps {
  children: React.ReactNode;
  tone?: CardTone;
  padding?: number;
  style?: ViewStyle;
}

/**
 * Surface block. SPEC §5.3:
 * - default surface: grouped gray
 * - accent: soft system-blue fill for badges and highlight cards
 * - pink: legacy alias for accent
 * - plain: transparent (when sitting on top of another surface)
 * - subtle iOS hairline border
 */
export function Card({ children, tone = 'default', padding, style }: CardProps) {
  const theme = useTheme();
  const resolvedPadding = padding ?? theme.space.lg;

  const toneStyle: ViewStyle = (() => {
    switch (tone) {
      case 'accent':
      case 'pink':
        return {
          backgroundColor: theme.color.brandBg,
          borderColor: theme.color.border.default,
        };
      case 'plain':
        return { backgroundColor: 'transparent', borderColor: 'transparent' };
      case 'default':
      default:
        return {
          backgroundColor: theme.color.bg.secondary,
          borderColor: theme.color.border.default,
        };
    }
  })();

  return (
    <View
      style={[
        styles.base,
        { borderRadius: theme.radius.lg, padding: resolvedPadding },
        toneStyle,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
