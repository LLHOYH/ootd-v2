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
 * "Title / action" pair above a section. Baseline-aligned, with the action
 * label in system blue.
 */
export function SectionHeader({ title, action, style }: SectionHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          marginTop: theme.space.lg,
          marginBottom: theme.space.sm,
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
          hitSlop={10}
          style={styles.action}
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
  action: {
    minHeight: 36,
    justifyContent: 'center',
  },
});
