import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Home, Shirt, Users, MessageCircle, User } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

export type BottomNavTab = 'today' | 'closet' | 'friends' | 'chats' | 'you';

export interface BottomNavProps {
  active: BottomNavTab;
  onSelect: (tab: BottomNavTab) => void;
  style?: ViewStyle;
}

interface ItemConfig {
  key: BottomNavTab;
  label: string;
  Icon: typeof Home;
}

const ITEMS: ItemConfig[] = [
  { key: 'today', label: 'Today', Icon: Home },
  { key: 'closet', label: 'Closet', Icon: Shirt },
  { key: 'friends', label: 'Friends', Icon: Users },
  { key: 'chats', label: 'Chats', Icon: MessageCircle },
  { key: 'you', label: 'You', Icon: User },
];

export function BottomNav({ active, onSelect, style }: BottomNavProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.color.bg.primary,
          borderTopColor: theme.color.border.default,
        },
        style,
      ]}
    >
      {ITEMS.map(({ key, label, Icon }) => {
        const isActive = key === active;
        const tint = isActive ? theme.color.brand : theme.color.text.tertiary;

        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            style={styles.item}
          >
            <Icon size={24} color={tint} strokeWidth={1.7} />
            <Text style={[styles.label, { color: tint }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    gap: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});
