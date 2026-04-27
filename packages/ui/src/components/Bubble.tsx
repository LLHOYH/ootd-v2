import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type BubbleFrom = 'user' | 'ai' | 'friend';

export interface BubbleProps {
  from: BubbleFrom;
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Chat bubble. SPEC §10.5/§10.7 + mockup `.bubble-ai` / `.bubble-u`.
 *  - user : filled brand pink, white text, right-aligned, tail-bottom-right
 *  - ai   : bg.secondary, primary text, left-aligned, tail-bottom-left
 *  - friend: bg.tertiary, primary text, left-aligned, tail-bottom-left
 */
export function Bubble({ from, children, style }: BubbleProps) {
  const theme = useTheme();

  const isUser = from === 'user';
  const bg =
    from === 'user'
      ? theme.color.brand
      : from === 'ai'
      ? theme.color.bg.secondary
      : theme.color.bg.tertiary;
  const fg = isUser ? '#FFFFFF' : theme.color.text.primary;

  // Soft 14px corners with a 4px tail on the speaker's side.
  const radii: ViewStyle = isUser
    ? {
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 14,
        borderBottomRightRadius: 4,
      }
    : {
        borderTopLeftRadius: 14,
        borderTopRightRadius: 14,
        borderBottomLeftRadius: 4,
        borderBottomRightRadius: 14,
      };

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: bg,
          alignSelf: isUser ? 'flex-end' : 'flex-start',
          paddingHorizontal: theme.space.md,
          paddingVertical: theme.space.sm,
        },
        radii,
        style,
      ]}
    >
      {typeof children === 'string' ? (
        <Text
          style={{
            color: fg,
            fontSize: theme.type.size.body,
            lineHeight: theme.type.size.body * theme.type.lineHeight.body,
            fontWeight: theme.type.weight.regular as '400',
          }}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    maxWidth: '78%',
  },
});
