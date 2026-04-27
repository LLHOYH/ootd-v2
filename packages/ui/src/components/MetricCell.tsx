import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface MetricCellProps {
  value: string | number;
  label: string;
  style?: ViewStyle;
}

/**
 * Stat block for the You/profile screen. Mockup §10.11:
 * a centered number on `bg.secondary`, with a tiny caption below.
 */
export function MetricCell({ value, label, style }: MetricCellProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.sm,
          paddingVertical: theme.space.md,
          paddingHorizontal: theme.space.sm,
        },
        style,
      ]}
    >
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.type.size.h2,
          fontWeight: theme.type.weight.medium as '500',
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.regular as '400',
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
