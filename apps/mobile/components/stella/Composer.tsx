// Stella composer — pill input + send button.
//
// Was decorative-only in the mock build; now wired through `onSend`. The
// mic + camera buttons stay decorative until voice + photo capture land.

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Send } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface ComposerProps {
  onSend: (text: string) => Promise<void> | void;
  disabled?: boolean;
}

export function Composer({ onSend, disabled }: ComposerProps) {
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !disabled && !busy;

  const handleSend = async () => {
    if (!canSend) return;
    const text = trimmed;
    setBusy(true);
    setValue('');
    try {
      await onSend(text);
    } catch {
      setValue(text);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.pill,
          paddingLeft: theme.space.lg,
          paddingRight: 6,
          paddingVertical: 6,
          gap: 10,
        },
      ]}
    >
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Ask Stella..."
        placeholderTextColor={theme.color.text.tertiary}
        editable={!disabled}
        onSubmitEditing={handleSend}
        returnKeyType="send"
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

      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send to Stella"
        hitSlop={8}
        style={({ pressed }) => [
          styles.sendBtn,
          {
            backgroundColor: canSend ? theme.color.brand : theme.color.bg.tertiary,
            borderRadius: theme.radius.pill,
          },
          pressed && styles.pressed,
        ]}
      >
        <Send size={18} color={canSend ? '#FFFFFF' : theme.color.text.tertiary} strokeWidth={1.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: 0,
    margin: 0,
    includeFontPadding: false,
  },
  sendBtn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
