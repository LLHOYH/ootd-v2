// Stella composer — pill input + send button.
//
// Was decorative-only in the mock build; now wired through `onSend`. The
// mic + camera buttons stay decorative until voice + photo capture land.

import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Camera, Send } from 'lucide-react-native';
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
          paddingHorizontal: theme.space.sm,
          paddingVertical: theme.space.sm,
          gap: theme.space.sm,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add a photo"
        hitSlop={8}
        style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
      >
        <Camera size={16} color={theme.color.text.secondary} strokeWidth={1.6} />
      </Pressable>

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="Ask Stella anything…"
        placeholderTextColor={theme.color.text.tertiary}
        editable={!disabled}
        onSubmitEditing={handleSend}
        returnKeyType="send"
        blurOnSubmit={false}
        style={[
          styles.input,
          {
            color: theme.color.text.primary,
            fontSize: theme.type.size.caption,
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
        <Send size={14} color={canSend ? '#FFFFFF' : theme.color.text.tertiary} strokeWidth={1.6} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    padding: 0,
    margin: 0,
    includeFontPadding: false,
  },
  sendBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
