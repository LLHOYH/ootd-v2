// Craft a look — assemble a combination from selected closet items.
//
// Modal route. Fetches the user's READY closet items, lets the user
// multi-select 2–6 (the contract bounds), takes an optional name, and
// POST /closet/combinations. On success, pops back so the closet
// re-fetches and shows the new combo. Tapping the combo opens the
// /share modal (PR #45).
//
// `source: 'CRAFTED'` is the right enum for hand-assembled combos
// (vs STELLA, TODAY_PICK, COORDINATED).

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { Button, Screen, Thumb, useTheme } from '@mei/ui';
import type { ClosetItem } from '@mei/types';

import { ApiError } from '@/lib/api/client';
import {
  createCombination,
  fetchClosetItems,
} from '@/lib/api/closet';

const MIN_ITEMS = 2;
const MAX_ITEMS = 6;
const COLUMNS = 3;
const CELL_PCT = '31.5%';

export default function CraftALookScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [items, setItems] = useState<ClosetItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load READY items only — selecting an item still PROCESSING would
  // create a combo whose preview is broken until promotion lands.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchClosetItems({ limit: 100 });
        if (cancelled) return;
        const ready = res.items.filter((it) => it.status === 'READY');
        setItems(ready);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not load closet');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_ITEMS) return prev; // hard cap
      return [...prev, id];
    });
  };

  const canSubmit =
    !submitting &&
    selectedIds.length >= MIN_ITEMS &&
    selectedIds.length <= MAX_ITEMS;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const trimmed = name.trim();
      const body: Parameters<typeof createCombination>[0] = {
        itemIds: selectedIds,
        source: 'CRAFTED',
      };
      if (trimmed.length > 0) body.name = trimmed;
      await createCombination(body);
      router.back();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Save failed';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Stable count text so ranges read naturally even when 1/many.
  const countText = useMemo(() => {
    const n = selectedIds.length;
    if (n === 0) return `Pick ${MIN_ITEMS}–${MAX_ITEMS} items`;
    if (n < MIN_ITEMS) return `Pick ${MIN_ITEMS - n} more`;
    if (n === MAX_ITEMS) return `${n} of ${MAX_ITEMS} (max)`;
    return `${n} selected`;
  }, [selectedIds.length]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'modal' }} />
      <Screen>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingBottom: theme.space.xxxl,
              gap: theme.space.lg,
            }}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={[styles.headerRow, { gap: theme.space.sm }]}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.backBtn}
              >
                <ChevronLeft
                  size={24}
                  strokeWidth={1.6}
                  color={theme.color.text.primary}
                />
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    color: theme.color.text.primary,
                    fontSize: theme.type.size.h2,
                    fontWeight: theme.type.weight.medium as '500',
                  }}
                  numberOfLines={1}
                >
                  Craft a look
                </Text>
                <Text
                  style={{
                    color: theme.color.text.tertiary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                    marginTop: 2,
                  }}
                >
                  {countText}
                </Text>
              </View>
            </View>

            {/* Name */}
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  color: theme.color.text.tertiary,
                  fontSize: 11,
                  fontWeight: '500',
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Name (optional)
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Sunday brunch"
                placeholderTextColor={theme.color.text.tertiary}
                maxLength={120}
                style={{
                  backgroundColor: theme.color.bg.secondary,
                  borderRadius: theme.radius.pill,
                  paddingHorizontal: theme.space.md,
                  paddingVertical: 10,
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.body,
                  fontWeight: theme.type.weight.regular as '400',
                }}
              />
            </View>

            {/* Item picker */}
            {items === null && !loadError ? (
              <View style={[styles.center, { paddingVertical: theme.space.xxxl }]}>
                <ActivityIndicator color={theme.color.brand} />
              </View>
            ) : loadError ? (
              <View style={[styles.center, { paddingVertical: theme.space.xxl, gap: theme.space.sm }]}>
                <Text
                  style={{
                    color: theme.color.text.tertiary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                    textAlign: 'center',
                  }}
                >
                  {loadError}
                </Text>
              </View>
            ) : (items?.length ?? 0) === 0 ? (
              <View
                style={[
                  styles.center,
                  { paddingVertical: theme.space.xxl, gap: theme.space.sm },
                ]}
              >
                <Text
                  style={{
                    color: theme.color.text.primary,
                    fontSize: theme.type.size.body,
                    fontWeight: theme.type.weight.medium as '500',
                    textAlign: 'center',
                  }}
                >
                  Add a few items first
                </Text>
                <Text
                  style={{
                    color: theme.color.text.tertiary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                    textAlign: 'center',
                  }}
                >
                  Use the + button on Closet to upload photos.
                </Text>
                <Button variant="ghost" onPress={() => router.back()}>
                  Back to closet
                </Button>
              </View>
            ) : (
              <View style={styles.grid}>
                {(items ?? []).map((item, idx) => {
                  const selected = selectedIds.includes(item.itemId);
                  const order = selected ? selectedIds.indexOf(item.itemId) + 1 : null;
                  const isEndOfRow = (idx + 1) % COLUMNS === 0;
                  return (
                    <Pressable
                      key={item.itemId}
                      onPress={() => toggleSelect(item.itemId)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={item.name}
                      style={({ pressed }) => [
                        styles.cell,
                        {
                          width: CELL_PCT,
                          marginRight: isEndOfRow ? 0 : '2.75%',
                          marginBottom: theme.space.md,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View style={styles.thumbWrap}>
                        <Thumb item={item} size="lg" style={styles.thumb} />
                        {selected ? (
                          <View
                            style={[
                              styles.selectedOverlay,
                              {
                                borderColor: theme.color.brand,
                                borderRadius: theme.radius.sm,
                              },
                            ]}
                          />
                        ) : null}
                        <View
                          style={[
                            styles.checkBubble,
                            {
                              backgroundColor: selected
                                ? theme.color.brand
                                : 'rgba(255,255,255,0.92)',
                              borderColor: selected
                                ? theme.color.brand
                                : theme.color.border.default,
                            },
                          ]}
                        >
                          {selected ? (
                            <Text
                              style={{
                                color: theme.color.brandOn,
                                fontSize: 12,
                                fontWeight: '600',
                              }}
                            >
                              {order}
                            </Text>
                          ) : (
                            <Check
                              size={12}
                              strokeWidth={2}
                              color={theme.color.text.tertiary}
                            />
                          )}
                        </View>
                      </View>
                      <Text
                        style={{
                          marginTop: theme.space.xs,
                          color: theme.color.text.primary,
                          fontSize: theme.type.size.tiny,
                          fontWeight: theme.type.weight.medium as '500',
                        }}
                        numberOfLines={1}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {submitError ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: theme.color.brandBg,
                    borderRadius: theme.radius.sm,
                    padding: theme.space.md,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.color.brandOn,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                  }}
                >
                  {submitError}
                </Text>
              </View>
            ) : null}

            <Button variant="primary" onPress={handleSubmit} disabled={!canSubmit}>
              {submitting
                ? 'Saving…'
                : selectedIds.length < MIN_ITEMS
                  ? `Pick ${MIN_ITEMS - selectedIds.length} more`
                  : 'Save look'}
            </Button>
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    // width + margins applied inline
  },
  thumbWrap: {
    width: '100%',
    aspectRatio: 3 / 4,
    position: 'relative',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2.5,
  },
  checkBubble: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    width: '100%',
  },
});
