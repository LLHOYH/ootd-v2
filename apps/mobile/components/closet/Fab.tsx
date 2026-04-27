import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

// SPEC §10.2 + parent goal: FAB is a 56px circle pinned bottom-right. The
// Screen primitive sits above the tab bar (the BottomNav is its own component
// outside SafeAreaView), so we only need a small visual offset from the
// Screen's bottom edge to keep the FAB clear of the bar.
const FAB_SIZE = 56;

export interface FabProps {
  onPress: () => void;
  accessibilityLabel?: string;
}

export function Fab({
  onPress,
  accessibilityLabel = 'Add closet item',
}: FabProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.fab,
        {
          width: FAB_SIZE,
          height: FAB_SIZE,
          borderRadius: FAB_SIZE / 2,
          backgroundColor: theme.color.brand,
          right: theme.space.lg,
          bottom: theme.space.lg,
          shadowColor: theme.color.brand,
          shadowOpacity: 0.35,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: theme.space.lg,
          elevation: 6,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <Plus size={20} strokeWidth={1.6} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
