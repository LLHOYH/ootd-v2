import { useCallback, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { Button, Screen, useTheme } from '@mei/ui';
import type { ClosetItem, Combination } from '@mei/types';

import { ImageLightbox } from '@/components/media/ImageLightbox';
import { Header } from '@/components/closet/Header';
import { ProcessingBanner } from '@/components/closet/ProcessingBanner';
import {
  FilterChips,
  type FilterKey,
} from '@/components/closet/FilterChips';
import { ItemGrid, type ClosetGridSize } from '@/components/closet/ItemGrid';
import { CombinationsGrid } from '@/components/closet/CombinationsGrid';
import { Fab } from '@/components/closet/Fab';
import {
  pickFromCamera,
  pickMultipleFromLibrary,
  uploadClosetItems,
} from '@/lib/api/closetUpload';
import { useCloset } from '@/lib/hooks/useCloset';
import { invalidateClosetItemMap } from '@/lib/hooks/useClosetItemMap';

const GRID_SIZE_OPTIONS: { key: ClosetGridSize; label: string }[] = [
  { key: 'compact', label: 'Compact' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
];

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
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [gridSize, setGridSize] = useState<ClosetGridSize>('compact');
  const [preview, setPreview] = useState<{ imageUrl: string; title?: string } | null>(null);

  // Common path for camera + gallery: pick → upload → close sheet → refetch.
  const handlePick = useCallback(
    async (source: 'camera' | 'library') => {
      if (picking || uploading) return;
      setPicking(true);
      try {
        const photo =
          source === 'camera'
            ? await pickFromCamera()
            : null;
        const photos =
          source === 'camera'
            ? photo
              ? [photo]
              : []
            : await pickMultipleFromLibrary(20);
        if (photos.length === 0) return; // user cancelled
        setUploading(true);
        await uploadClosetItems(photos);
        // Re-fetch — the row will be visible (PROCESSING) immediately, and
        // (locally) flips to READY almost instantly when the dev-mode
        // worker fire succeeds. Production: the row stays PROCESSING
        // until the storage trigger / pg_net hits the worker.
        // Also drop the shared item-map cache so other screens (Today's
        // Pick, Wear-this) pick up the new row on their next render.
        invalidateClosetItemMap();
        await refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        Alert.alert('Upload failed', msg);
      } finally {
        setPicking(false);
        setUploading(false);
      }
    },
    [picking, refetch, uploading],
  );

  const openUploadChooser = useCallback(() => {
    if (picking || uploading) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Take a photo', 'Choose from gallery', 'Cancel'],
          cancelButtonIndex: 2,
          title: 'Add a closet item',
          message: 'Stella will tag and clean it up automatically.',
        },
        (idx) => {
          if (idx === 0) void handlePick('camera');
          else if (idx === 1) void handlePick('library');
        },
      );
      return;
    }

    Alert.alert(
      'Add a closet item',
      'Stella will tag and clean it up automatically.',
      [
        { text: 'Take a photo', onPress: () => void handlePick('camera') },
        { text: 'Choose from gallery', onPress: () => void handlePick('library') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [handlePick, picking, uploading]);

  const openGridSizeChooser = useCallback(() => {
    const setByIndex = (idx: number) => {
      const option = GRID_SIZE_OPTIONS[idx];
      if (option) setGridSize(option.key);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...GRID_SIZE_OPTIONS.map((opt) => opt.label), 'Cancel'],
          cancelButtonIndex: GRID_SIZE_OPTIONS.length,
          title: 'Wardrobe photo size',
        },
        setByIndex,
      );
      return;
    }

    Alert.alert(
      'Wardrobe photo size',
      'Choose how large closet photos should appear.',
      [
        ...GRID_SIZE_OPTIONS.map((opt) => ({
          text: opt.label,
          onPress: () => setGridSize(opt.key),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
      { cancelable: true },
    );
  }, []);

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
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const processingItems = items.filter((it) => it.status === 'PROCESSING');
  const filteredItems =
    filter === 'ALL' || filter === 'COMBINATIONS'
      ? items
      : items.filter((it) => it.category === filter);
  const visibleItems =
    normalizedQuery.length === 0
      ? filteredItems
      : filteredItems.filter((it) =>
          [it.name, it.description, it.category]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedQuery)),
        );
  const visibleCombinations =
    normalizedQuery.length === 0
      ? combinations
      : combinations.filter((combo) =>
          combo.name.toLowerCase().includes(normalizedQuery),
        );

  const handlePressItem = (item: ClosetItem) => {
    const imageUrl = item.tunedPhotoUrl || item.thumbnailUrl || item.rawPhotoUrl;
    if (!imageUrl) return;
    setPreview({ imageUrl, title: item.name });
  };
  const handlePressCombination = (combo: Combination) => {
    router.push({
      pathname: '/tryon',
      params: {
        comboId: combo.comboId,
        comboJson: JSON.stringify(combo),
      },
    } as never);
  };
  const handleFabPress = () => {
    if (uploading || picking) return;
    // FAB is contextual: in the COMBINATIONS view it crafts a look; in
    // every other view it opens the upload sheet for new items. The
    // single-FAB pattern keeps the bottom-right slot legible — no
    // dueling buttons.
    if (filter === 'COMBINATIONS') {
      router.push('/craft-a-look' as never);
      return;
    }
    openUploadChooser();
  };

  return (
    <Screen padded={false}>
      <View style={[styles.body, { paddingHorizontal: theme.space.xl, paddingTop: theme.space.xl }]}>
        <Header
          itemCount={items.length}
          combinationCount={combinations.length}
          mode={filter === 'COMBINATIONS' ? 'combinations' : 'items'}
          searching={searchOpen}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onSearch={() => setSearchOpen(true)}
          onCancelSearch={() => {
            setSearchOpen(false);
            setSearchQuery('');
          }}
        />

        {processingItems.length > 0 ? (
          <ProcessingBanner count={processingItems.length} etaMinutes={2} />
        ) : null}

        <FilterChips active={filter} onChange={setFilter} />

        {filter !== 'COMBINATIONS' ? (
          <View style={[styles.gridToolbar, { marginTop: theme.space.md }]}>
            <Text
              style={{
                color: theme.color.text.secondary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.medium as '500',
              }}
            >
              {GRID_SIZE_OPTIONS.find((opt) => opt.key === gridSize)?.label ?? 'Compact'} grid
            </Text>
            <Pressable
              onPress={openGridSizeChooser}
              accessibilityRole="button"
              accessibilityLabel="Choose wardrobe photo size"
              style={({ pressed }) => [
                styles.sizeButton,
                {
                  backgroundColor: theme.color.bg.secondary,
                  borderColor: theme.color.border.default,
                  borderRadius: theme.radius.pill,
                  paddingLeft: theme.space.md,
                  paddingRight: theme.space.sm,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
            >
              <Text
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.caption,
                  fontWeight: theme.type.weight.medium as '500',
                }}
              >
                Size: {GRID_SIZE_OPTIONS.find((opt) => opt.key === gridSize)?.label ?? 'Compact'}
              </Text>
              <ChevronDown size={16} strokeWidth={1.8} color={theme.color.text.tertiary} />
            </Pressable>
          </View>
        ) : null}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{
            paddingBottom: theme.space.huge + theme.space.huge,
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
              combinations={visibleCombinations}
              items={items}
              onPressCombination={handlePressCombination}
            />
          ) : (
            <ItemGrid items={visibleItems} size={gridSize} onPressItem={handlePressItem} />
          )}
        </ScrollView>
      </View>

      <Fab
        onPress={handleFabPress}
        accessibilityLabel={
          filter === 'COMBINATIONS' ? 'Craft a look' : 'Add closet item'
        }
      />

      {uploading ? (
        <View
          style={[
            styles.uploadingBanner,
            {
              backgroundColor: theme.color.bg.secondary,
              borderRadius: theme.radius.pill,
              paddingHorizontal: theme.space.md,
              paddingVertical: 12,
              gap: theme.space.sm,
              right: theme.space.lg,
              bottom: theme.space.lg + 64 + theme.space.sm,
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

      <ImageLightbox
        visible={preview != null}
        imageUrl={preview?.imageUrl}
        title={preview?.title}
        onClose={() => setPreview(null)}
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
  gridToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sizeButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
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
