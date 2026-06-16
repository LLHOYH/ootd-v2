import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface ClosetHeaderProps {
  itemCount: number;
  combinationCount: number;
  mode: 'items' | 'combinations';
  searching?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
  onSearch?: () => void;
  onCancelSearch?: () => void;
}

export function Header({
  itemCount,
  combinationCount,
  mode,
  searching = false,
  query = '',
  onQueryChange,
  onSearch,
  onCancelSearch,
}: ClosetHeaderProps) {
  const theme = useTheme();

  const subtitle =
    mode === 'combinations'
      ? `${combinationCount} saved combinations`
      : `${itemCount} items`;

  const buttonSize = 48;

  if (searching) {
    return (
      <View
        style={[
          styles.searchRow,
          {
            gap: theme.space.sm,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.bg.secondary,
            paddingHorizontal: theme.space.lg,
          },
        ]}
      >
        <Search size={20} strokeWidth={1.6} color={theme.color.text.tertiary} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search closet"
          placeholderTextColor={theme.color.text.tertiary}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[
            styles.searchInput,
            {
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.regular as '400',
            },
          ]}
        />
        <Pressable
          onPress={onCancelSearch}
          accessibilityRole="button"
          accessibilityLabel="Close search"
          hitSlop={8}
          style={styles.closeBtn}
        >
          <X size={22} strokeWidth={1.6} color={theme.color.text.tertiary} />
        </Pressable>
      </View>
    );
  }

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
        <Search size={22} strokeWidth={1.6} color={theme.color.text.primary} />
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
  searchRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
