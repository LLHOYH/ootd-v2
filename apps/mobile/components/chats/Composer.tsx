// Text composer for chat threads. Pinned to the bottom of the thread screen.
//
// Single-line for now (multiline can land alongside the closet-drawer affordance
// in a follow-up). Send button disables on empty input or in-flight send.

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
      // Restore the unsent text so the user can retry.
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
          gap: theme.space.sm,
          paddingHorizontal: theme.space.lg,
          paddingTop: theme.space.sm,
          paddingBottom: theme.space.md,
          borderTopColor: theme.color.border.default,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: theme.color.bg.primary,
        },
      ]}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.space.md,
          paddingVertical: 8,
        }}
      >
        <TextInput
          value={value}
          onChangeText={setValue}
          placeholder="Message"
          placeholderTextColor={theme.color.text.tertiary}
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.regular as '400',
            padding: 0,
            margin: 0,
          }}
          editable={!disabled}
          onSubmitEditing={handleSend}
          returnKeyType="send"
          blurOnSubmit={false}
        />
      </View>
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        accessibilityRole="button"
        accessibilityLabel="Send message"
        hitSlop={6}
        style={[
          styles.sendBtn,
          {
            backgroundColor: canSend ? theme.color.brand : theme.color.bg.secondary,
          },
        ]}
      >
        <Send
          size={18}
          strokeWidth={1.6}
          color={canSend ? theme.color.brandOn : theme.color.text.tertiary}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
