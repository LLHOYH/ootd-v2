import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface ClosetHeaderProps {
  itemCount: number;
  combinationCount: number;
  mode: 'items' | 'combinations';
  onSearch?: () => void;
}

export function Header({
  itemCount,
  combinationCount,
  mode,
  onSearch,
}: ClosetHeaderProps) {
  const theme = useTheme();

  const subtitle =
    mode === 'combinations'
      ? `${combinationCount} saved combinations`
      : `${itemCount} items`;

  const buttonSize = theme.space.xxxl;

  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.h1,
            fontWeight: theme.type.weight.medium as '500',
          }}
        >
          My closet
        </Text>
        <Text
          style={{
            marginTop: theme.space.xs / 2,
            color: theme.color.text.secondary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
          }}
        >
          {subtitle}
        </Text>
      </View>
      <Pressable
        onPress={onSearch}
        accessibilityRole="button"
        accessibilityLabel="Search closet"
        hitSlop={8}
        style={({ pressed }) => [
          styles.iconBtn,
          {
            width: buttonSize,
            height: buttonSize,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.bg.secondary,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Search size={16} strokeWidth={1.6} color={theme.color.text.primary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  text: {
    flexShrink: 1,
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
