import { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button, Screen, useTheme } from '@mei/ui';
import type { ClosetItem, Combination } from '@mei/types';

import { Header } from '@/components/closet/Header';
import { ProcessingBanner } from '@/components/closet/ProcessingBanner';
import {
  FilterChips,
  type FilterKey,
} from '@/components/closet/FilterChips';
import { ItemGrid } from '@/components/closet/ItemGrid';
import { CombinationsGrid } from '@/components/closet/CombinationsGrid';
import { Fab } from '@/components/closet/Fab';
import { useCloset } from '@/lib/hooks/useCloset';

/**
 * Closet — SPEC §10.2.
 *
 * Read-only against the live api Lambda. Filter chips narrow what the
 * grid renders client-side; the FAB stays decorative until
 * feat/wire-closet-upload (Wave 2d) wires camera → storage → image-worker.
 */
export default function ClosetScreen() {
  const theme = useTheme();
  const { state, refetch } = useCloset();
  const [filter, setFilter] = useState<FilterKey>('ALL');

  // ---- Loading: first paint -------------------------------------------------
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <Screen padded={false}>
        <View style={[styles.center, { padding: theme.space.xxxl }]}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      </Screen>
    );
  }

  // ---- Hard error -----------------------------------------------------------
  if (state.status === 'error' && !state.lastData) {
    return (
      <Screen padded={false}>
        <View style={[styles.center, { padding: theme.space.xxxl, gap: theme.space.md }]}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
              textAlign: 'center',
            }}
          >
            Couldn’t load closet
          </Text>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              textAlign: 'center',
            }}
            numberOfLines={2}
          >
            {state.error.message}
          </Text>
          <Button variant="primary" onPress={() => void refetch()}>
            Try again
          </Button>
        </View>
      </Screen>
    );
  }

  // ---- Success -------------------------------------------------------------
  const data = state.status === 'success' ? state.data : state.lastData;
  if (!data) return null;

  const { items, combinations } = data;
  const processingItems = items.filter((it) => it.status === 'PROCESSING');
  const visibleItems =
    filter === 'ALL' || filter === 'COMBINATIONS'
      ? items
      : items.filter((it) => it.category === filter);

  const handlePressItem = (_item: ClosetItem) => {
    // Item detail not in scope for this PR.
  };
  const handlePressCombination = (_combo: Combination) => {
    // Opens Craft a look — wired in feat/wire-closet-edit.
  };
  const handleFabPress = () => {
    // Bulk upload picker — wired in feat/wire-closet-upload.
  };

  return (
    <Screen padded={false}>
      <View style={[styles.body, { paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg }]}>
        <Header
          itemCount={items.length}
          combinationCount={combinations.length}
          mode={filter === 'COMBINATIONS' ? 'combinations' : 'items'}
          onSearch={() => {
            /* search not wired here */
          }}
        />

        {processingItems.length > 0 ? (
          <ProcessingBanner count={processingItems.length} etaMinutes={2} />
        ) : null}

        <FilterChips active={filter} onChange={setFilter} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingBottom: theme.space.huge + theme.space.xxxl,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={state.status === 'success' && state.refetching}
              onRefresh={() => void refetch()}
              tintColor={theme.color.brand}
            />
          }
        >
          {filter === 'COMBINATIONS' ? (
            <CombinationsGrid
              combinations={combinations}
              onPressCombination={handlePressCombination}
            />
          ) : (
            <ItemGrid items={visibleItems} onPressItem={handlePressItem} />
          )}
        </ScrollView>
      </View>

      <Fab onPress={handleFabPress} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
