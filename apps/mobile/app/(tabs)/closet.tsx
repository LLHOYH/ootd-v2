import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
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
import { UploadSheet } from '@/components/closet/UploadSheet';
import {
  pickFromCamera,
  pickFromLibrary,
  uploadClosetItem,
} from '@/lib/api/closetUpload';
import { useCloset } from '@/lib/hooks/useCloset';

/**
 * Closet — SPEC §10.2.
 *
 * Read-only against the live api Lambda. Filter chips narrow what the
 * grid renders client-side; the FAB opens the upload sheet (camera /
 * gallery) and routes the result through the api Lambda + image-worker
 * pipeline (Wave 2d).
 */
export default function ClosetScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, refetch } = useCloset();
  const [filter, setFilter] = useState<FilterKey>('ALL');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Common path for camera + gallery: pick → upload → close sheet → refetch.
  const handlePick = useCallback(
    async (source: 'camera' | 'library') => {
      setSheetOpen(false);
      try {
        setUploading(true);
        const photo =
          source === 'camera'
            ? await pickFromCamera()
            : await pickFromLibrary();
        if (!photo) return; // user cancelled
        await uploadClosetItem(photo);
        // Re-fetch — the row will be visible (PROCESSING) immediately, and
        // (locally) flips to READY almost instantly when the dev-mode
        // worker fire succeeds. Production: the row stays PROCESSING
        // until the storage trigger / pg_net hits the worker.
        await refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        Alert.alert('Upload failed', msg);
      } finally {
        setUploading(false);
      }
    },
    [refetch],
  );

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
  const handlePressCombination = (combo: Combination) => {
    // Tap → Wear this · Confirm & share modal (SPEC §10.10).
    // expo-router: relative push so query params survive cleanly.
    router.push({ pathname: '/share', params: { comboId: combo.comboId } } as never);
  };
  const handleFabPress = () => {
    if (uploading) return;
    setSheetOpen(true);
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

      {uploading ? (
        <View
          style={[
            styles.uploadingBanner,
            {
              backgroundColor: theme.color.bg.secondary,
              borderRadius: theme.radius.pill,
              paddingHorizontal: theme.space.md,
              paddingVertical: 10,
              gap: theme.space.sm,
              right: theme.space.lg,
              bottom: theme.space.lg + 56 + theme.space.sm,
            },
          ]}
        >
          <ActivityIndicator color={theme.color.brand} />
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
            }}
          >
            Uploading…
          </Text>
        </View>
      ) : null}

      <UploadSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onPickCamera={() => void handlePick('camera')}
        onPickLibrary={() => void handlePick('library')}
      />
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
  uploadingBanner: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
  },
});
