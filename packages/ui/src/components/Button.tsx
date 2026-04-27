import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'ghost' | 'icon';

export interface ButtonProps {
  variant: ButtonVariant;
  onPress: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  children?: React.ReactNode;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

/**
 * Pill button. SPEC §5.3:
 * - primary: filled brand pink, white text
 * - ghost: transparent + 0.5px (hairline) border, primary text
 * - icon: circular touch target, transparent
 *
 * Pill padding 5×11. Icon size 20, stroke 1.6.
 */
export function Button({
  variant,
  onPress,
  icon: Icon,
  disabled = false,
  children,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();

  const isIcon = variant === 'icon';

  const containerStyle: ViewStyle = (() => {
    if (variant === 'primary') {
      return {
        backgroundColor: theme.color.brand,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 11,
        paddingVertical: 5,
      };
    }
    if (variant === 'ghost') {
      return {
        backgroundColor: 'transparent',
        borderRadius: theme.radius.pill,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: theme.color.border.strong,
        paddingHorizontal: 11,
        paddingVertical: 5,
      };
    }
    // icon
    return {
      backgroundColor: 'transparent',
      borderRadius: theme.radius.pill,
      width: 36,
      height: 36,
    };
  })();

  const textColor =
    variant === 'primary' ? '#FFFFFF' : theme.color.text.primary;
  const iconColor =
    variant === 'primary' ? '#FFFFFF' : theme.color.text.primary;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        isIcon ? styles.iconBase : styles.pillBase,
        containerStyle,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {Icon ? <Icon size={20} strokeWidth={1.6} color={iconColor} /> : null}
      {!isIcon && children !== undefined && children !== null ? (
        <Text
          style={[
            styles.label,
            {
              color: textColor,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
            },
          ]}
        >
          {children}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBase: {
    flexDirection: 'row',
    gap: 6,
  },
  iconBase: {
    flexDirection: 'row',
  },
  label: {
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
});
