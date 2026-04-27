import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Home, Shirt, Sparkles, MessageCircle, User } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';

export type BottomNavTab = 'today' | 'closet' | 'stella' | 'chats' | 'you';

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
  { key: 'stella', label: 'Stella', Icon: Sparkles },
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
        const isCenter = key === 'stella';
        const isActive = key === active;
        const tint = isCenter
          ? '#FFFFFF'
          : isActive
          ? theme.color.brand
          : theme.color.text.tertiary;

        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: isActive }}
            style={styles.item}
          >
            {isCenter ? (
              <View style={[styles.center, { backgroundColor: theme.color.brand }]}>
                <Icon size={20} color={tint} strokeWidth={1.6} />
              </View>
            ) : (
              <>
                <Icon size={22} color={tint} strokeWidth={1.6} />
                <Text style={[styles.label, { color: tint }]}>{label}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
  },
  center: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
    shadowColor: '#D4537E',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 6,
  },
});
