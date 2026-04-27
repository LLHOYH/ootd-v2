import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface SectionHeaderAction {
  label: string;
  onPress: () => void;
}

export interface SectionHeaderProps {
  title: string;
  action?: SectionHeaderAction;
  style?: ViewStyle;
}

/**
 * "Title / action" pair above a section. Mockup `.section-h-sc`:
 * baseline-aligned, title at h3 weight, action label in brand-pink medium.
 */
export function SectionHeader({ title, action, style }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          marginVertical: theme.space.sm,
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
        numberOfLines={1}
      >
        {title}
      </Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
        >
          <Text
            style={{
              color: theme.color.brand,
              fontSize: theme.type.size.caption,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
});
