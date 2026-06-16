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

  return (
    <View>
      <View style={styles.row}>
        <View style={styles.text}>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.medium as '500',
              marginBottom: theme.space.xs,
              textTransform: 'uppercase',
            }}
          >
            {subtitle}
          </Text>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.h1,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            My closet
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
              borderColor: theme.color.border.default,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Search size={22} strokeWidth={1.6} color={theme.color.text.primary} />
        </Pressable>
      </View>

      <View
        style={[
          styles.searchRow,
          {
            borderRadius: theme.radius.pill,
            backgroundColor: theme.color.bg.secondary,
            marginTop: theme.space.lg,
            paddingHorizontal: theme.space.lg,
          },
        ]}
      >
        <Search size={20} strokeWidth={1.6} color={theme.color.text.tertiary} />
        <TextInput
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search dresses, colors, occasions"
          placeholderTextColor={theme.color.text.tertiary}
          autoFocus={searching}
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
        {query.length > 0 ? (
          <Pressable
            onPress={onCancelSearch}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
            style={styles.closeBtn}
          >
            <X size={22} strokeWidth={1.6} color={theme.color.text.tertiary} />
          </Pressable>
        ) : null}
      </View>
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
