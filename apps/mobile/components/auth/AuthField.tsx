// Themed text input for the auth screens — pill-bordered, tinted on focus,
// mistake-tolerant by default (autocapitalize off for email, secure entry
// toggle for password). Kept here rather than in @mei/ui because the auth
// screens are the only place this exact look is used; the design-system
// generic `<TextInput>` will land if/when more screens need it.

import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface AuthFieldProps {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder?: string;
  /** 'email' | 'password' | 'name' — picks the right autocapitalize / keyboard. */
  kind: 'email' | 'password' | 'name';
  autoFocus?: boolean;
  errorMessage?: string;
  onSubmitEditing?: () => void;
  returnKeyType?: 'done' | 'next' | 'go';
  editable?: boolean;
}

export function AuthField({
  label,
  value,
  onChangeText,
  placeholder,
  kind,
  autoFocus,
  errorMessage,
  onSubmitEditing,
  returnKeyType = 'next',
  editable = true,
}: AuthFieldProps) {
  const theme = useTheme();
  const [hidden, setHidden] = useState(kind === 'password');
  const [focused, setFocused] = useState(false);

  const borderColor = errorMessage
    ? theme.color.brand
    : focused
      ? theme.color.text.primary
      : theme.color.border.default;

  return (
    <View style={{ gap: 6 }}>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.medium as '500',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
      <View
        style={[
          styles.row,
          {
            backgroundColor: theme.color.bg.secondary,
            borderColor,
            borderRadius: theme.radius.pill,
            paddingHorizontal: theme.space.md,
            paddingVertical: 10,
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.color.text.tertiary}
          autoCapitalize={kind === 'name' ? 'words' : 'none'}
          autoCorrect={kind === 'name'}
          keyboardType={kind === 'email' ? 'email-address' : 'default'}
          secureTextEntry={kind === 'password' && hidden}
          textContentType={
            kind === 'email'
              ? 'emailAddress'
              : kind === 'password'
                ? 'password'
                : 'name'
          }
          autoFocus={autoFocus}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          blurOnSubmit={false}
          style={[
            styles.input,
            {
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.regular as '400',
            },
          ]}
        />
        {kind === 'password' ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            style={styles.eyeBtn}
          >
            {hidden ? (
              <EyeOff size={18} strokeWidth={1.6} color={theme.color.text.tertiary} />
            ) : (
              <Eye size={18} strokeWidth={1.6} color={theme.color.text.tertiary} />
            )}
          </Pressable>
        ) : null}
      </View>
      {errorMessage ? (
        <Text
          style={{
            color: theme.color.brand,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
          }}
          numberOfLines={2}
        >
          {errorMessage}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  input: {
    flex: 1,
    padding: 0,
    margin: 0,
    includeFontPadding: false,
  },
  eyeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
