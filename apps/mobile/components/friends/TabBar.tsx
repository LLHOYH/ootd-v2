// Three-segment tab strip. Mirrors the SPEC §10.12 add-friends header.
//
// Generic over the tab key — keeps it usable elsewhere (e.g. when we wire
// the chats tabs) without copy-pasting a layout component.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@mei/ui';

export interface TabBarItem<K extends string> {
  key: K;
  label: string;
  /** Optional badge count appended as " · {n}". Hidden when undefined or 0. */
  badge?: number;
}

export interface TabBarProps<K extends string> {
  tabs: ReadonlyArray<TabBarItem<K>>;
  active: K;
  onChange: (key: K) => void;
}

export function TabBar<K extends string>({ tabs, active, onChange }: TabBarProps<K>) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          gap: theme.space.lg,
          borderBottomColor: theme.color.border.default,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        const label = t.badge && t.badge > 0 ? `${t.label} · ${t.badge}` : t.label;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={label}
            style={[styles.item, { paddingVertical: theme.space.sm }]}
          >
            <Text
              style={{
                color: isActive ? theme.color.text.primary : theme.color.text.tertiary,
                fontSize: theme.type.size.body,
                fontWeight: (isActive
                  ? theme.type.weight.medium
                  : theme.type.weight.regular) as '400' | '500',
              }}
              numberOfLines={1}
            >
              {label}
            </Text>
            {isActive ? (
              <View
                style={[
                  styles.underline,
                  { backgroundColor: theme.color.text.primary },
                ]}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  item: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  underline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },
});
