import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

export interface SettingRowProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Grouped iOS settings row:
 *  - rounded square icon chip on primary surface, system-blue icon stroke
 *  - title (medium) + optional subtitle (tiny, tertiary)
 *  - optional `value` text on the right
 *  - chevron when interactive
 *  - subtle hairline outline
 */
export function SettingRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onPress,
  style,
}: SettingRowProps) {
  const theme = useTheme();

  const Container: React.ComponentType<any> = onPress ? Pressable : View;
  const containerProps = onPress
    ? {
        onPress,
        accessibilityRole: 'button' as const,
        accessibilityLabel: title,
      }
    : {};

  return (
    <Container
      {...containerProps}
      style={[
        styles.row,
        {
          gap: theme.space.md,
          backgroundColor: theme.color.bg.secondary,
          borderColor: theme.color.border.default,
          borderRadius: theme.radius.lg,
          paddingVertical: theme.space.sm,
          paddingHorizontal: theme.space.md,
          marginBottom: theme.space.sm,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor: theme.color.bg.primary,
            borderRadius: theme.radius.md,
          },
        ]}
      >
        <Icon size={18} strokeWidth={1.7} color={theme.color.brand} />
      </View>

      <View style={styles.body}>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.medium as '500',
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {value ? (
        <Text
          style={{
            color: theme.color.text.secondary,
            fontSize: theme.type.size.caption,
            fontWeight: theme.type.weight.regular as '400',
          }}
          numberOfLines={1}
        >
          {value}
        </Text>
      ) : null}

      {onPress ? (
        <ChevronRight
          size={14}
          strokeWidth={1.6}
          color={theme.color.text.tertiary}
        />
      ) : null}
    </Container>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    borderWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
});
