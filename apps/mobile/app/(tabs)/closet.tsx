import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Screen, useTheme } from '@mei/ui';
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
import {
  mockItems,
  mockCombinations,
  mockProcessingEtaMin,
} from '@/components/closet/mocks';

export default function ClosetScreen() {
  const theme = useTheme();
  const [filter, setFilter] = useState<FilterKey>('ALL');

  const processingItems = useMemo<ClosetItem[]>(
    () => mockItems.filter((it) => it.status === 'PROCESSING'),
    [],
  );

  const visibleItems = useMemo<ClosetItem[]>(() => {
    if (filter === 'ALL' || filter === 'COMBINATIONS') return mockItems;
    return mockItems.filter((it) => it.category === filter);
  }, [filter]);

  const handlePressItem = (_item: ClosetItem) => {
    // P0: item detail not in scope for this screen.
  };

  const handlePressCombination = (_combo: Combination) => {
    // P0: opens Craft a look — not wired here.
  };

  const handleFabPress = () => {
    // P0: bulk upload picker — not wired here.
  };

  return (
    <Screen padded={false}>
      <View style={[styles.body, { paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg }]}>
        <Header
          itemCount={mockItems.length}
          combinationCount={mockCombinations.length}
          mode={filter === 'COMBINATIONS' ? 'combinations' : 'items'}
          onSearch={() => {
            /* P0: search not wired here. */
          }}
        />

        {processingItems.length > 0 ? (
          <ProcessingBanner
            count={processingItems.length}
            etaMinutes={mockProcessingEtaMin}
          />
        ) : null}

        <FilterChips active={filter} onChange={setFilter} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            // Keep grid clear of the absolute-positioned FAB.
            paddingBottom: theme.space.huge + theme.space.xxxl,
          }}
          showsVerticalScrollIndicator={false}
        >
          {filter === 'COMBINATIONS' ? (
            <CombinationsGrid
              combinations={mockCombinations}
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
});
