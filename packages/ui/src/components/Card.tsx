import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type CardTone = 'default' | 'pink' | 'plain';

export interface CardProps {
  children: React.ReactNode;
  tone?: CardTone;
  padding?: number;
  style?: ViewStyle;
}

/**
 * Surface block. SPEC §5.3:
 * - radius 12, padding 12
 * - default surface: bg.secondary
 * - pink: pink fill (badges, highlight cards)
 * - plain: transparent (when sitting on top of another surface)
 * - no border
 */
export function Card({ children, tone = 'default', padding, style }: CardProps) {
  const theme = useTheme();
  const resolvedPadding = padding ?? theme.space.md;

  const toneStyle: ViewStyle = (() => {
    switch (tone) {
      case 'pink':
        return { backgroundColor: theme.color.brandBg };
      case 'plain':
        return { backgroundColor: 'transparent' };
      case 'default':
      default:
        return { backgroundColor: theme.color.bg.secondary };
    }
  })();

  return (
    <View
      style={[
        styles.base,
        { borderRadius: theme.radius.md, padding: resolvedPadding },
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
  },
});
