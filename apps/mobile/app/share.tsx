// Wear this · Confirm & share — SPEC §10.10.
//
// Modal route. Receives a `comboId` query param, renders a preview of
// the combination or just-generated try-on image, lets the user pick
// visibility + write a caption + add a location, then POST /ootd.
// The create call still uses the current OOTD contract; if no try-on
// image is supplied, the api creates the fallback OutfitCard composite.
//
// Visibility lanes here cover PUBLIC + FRIENDS (the §10.10 default
// section). GROUP and DIRECT need hangout / friend pickers — they ship
// with feat/wire-share-targets.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, MapPin } from 'lucide-react-native';
import {
  Button,
  Chip,
  OutfitCard,
  Screen,
  useTheme,
} from '@mei/ui';
import type { Combination, OOTDVisibility } from '@mei/types';

import { ApiError } from '@/lib/api/client';
import { createOotd } from '@/lib/api/ootd';
import { fetchClosetCombinations } from '@/lib/api/closet';
import { useClosetItemMap } from '@/lib/hooks/useClosetItemMap';
import { useSession } from '@/lib/auth/SessionProvider';

// Visibility lanes wired in this PR. GROUP / DIRECT live behind a
// "Choose recipients" follow-up that needs a hangout + friend picker.
type SimpleVisibility = Extract<OOTDVisibility, 'PUBLIC' | 'FRIENDS'>;

function suggestedCaptionFor(combo: Combination, hasTryonImage: boolean): string {
  const name = combo.name.trim() || 'this look';
  return hasTryonImage
    ? `Trying on ${name}. What do you think?`
    : `Wearing ${name} today. What do you think?`;
}

function readRouteBool(value: string | string[] | undefined, fallback: boolean): boolean {
  if (typeof value !== 'string') return fallback;
  if (value === '1' || value.toLowerCase() === 'true') return true;
  if (value === '0' || value.toLowerCase() === 'false') return false;
  return fallback;
}

export default function ShareScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    comboId?: string;
    comboJson?: string;
    shareDresses?: string;
    shareModel?: string;
    tryonGenerationId?: string;
    tryonImageUrl?: string;
  }>();
  const { session } = useSession();
  const me = session?.user.id;
  const itemMap = useClosetItemMap();

  // expo-router 6 reconciles `<Stack.Screen options={…} />` by reference. The
  // inline literal we used to pass here was rebuilt on every render, which
  // expo-router treated as "options changed" and used as a trigger to
  // re-render the screen — producing a "Maximum update depth exceeded"
  // render loop. Lifting the object out so its identity stays stable
  // breaks the loop.
  const screenOptions = useMemo(
    () => ({ headerShown: false, presentation: 'modal' as const }),
    [],
  );

  // The caller (Today screen) can hand us the combination directly via
  // `comboJson` to skip the network round-trip. The /closet/combinations
  // fallback below was hanging silently when the network was flaky and
  // showed up as an infinite loading spinner — preferring the prefetched
  // payload eliminates that failure mode for the most common entry point.
  const initialCombo = useMemo<Combination | null>(() => {
    if (typeof params.comboJson !== 'string' || params.comboJson.length === 0) return null;
    try {
      return JSON.parse(params.comboJson) as Combination;
    } catch {
      return null;
    }
  }, [params.comboJson]);
  const rawTryonGenerationId =
    typeof params.tryonGenerationId === 'string' && params.tryonGenerationId.length > 0
      ? params.tryonGenerationId
      : undefined;
  const shareDresses = readRouteBool(params.shareDresses, true);
  const shareModel =
    readRouteBool(params.shareModel, rawTryonGenerationId != null) &&
    rawTryonGenerationId != null;
  const tryonImageUrl =
    shareModel &&
    typeof params.tryonImageUrl === 'string' && params.tryonImageUrl.length > 0
      ? params.tryonImageUrl
      : undefined;
  const tryonGenerationId = shareModel ? rawTryonGenerationId : undefined;

  const [combo, setCombo] = useState<Combination | null>(initialCombo);
  const [loading, setLoading] = useState(initialCombo == null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [caption, setCaption] = useState(() =>
    initialCombo ? suggestedCaptionFor(initialCombo, tryonImageUrl != null) : '',
  );
  const [captionEdited, setCaptionEdited] = useState(false);
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<SimpleVisibility>('FRIENDS');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Combos endpoint is the cheapest way to look up one combo by id while
  // staying RLS-scoped to the caller. The api lacks a GET /closet/combinations/:id
  // for non-owner reads — fine here, the caller is always the owner.
  //
  // Skipped entirely when the caller pre-loaded the combo via `comboJson`
  // (the common Today-screen path), and bounded by an 8s abort so a stuck
  // request can't pin the screen on a spinner forever.
  useEffect(() => {
    if (combo != null) return; // already have it (prefetched or set below)
    if (!params.comboId || !me) {
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchClosetCombinations({ limit: 100, signal: ctrl.signal });
        if (cancelled) return;
        const found = list.items.find((c) => c.comboId === params.comboId);
        if (!found) {
          setLoadError('That look isn’t in your closet.');
        } else {
          setCombo(found);
        }
      } catch (err) {
        if (!cancelled) {
          if (ctrl.signal.aborted) {
            setLoadError('Loading took too long. Check your connection and try again.');
          } else {
            setLoadError(err instanceof Error ? err.message : 'Could not load look');
          }
        }
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      ctrl.abort();
    };
  }, [params.comboId, me, combo]);

  useEffect(() => {
    if (captionEdited || !combo || caption.trim().length > 0) return;
    setCaption(suggestedCaptionFor(combo, tryonImageUrl != null));
  }, [caption, captionEdited, combo, tryonImageUrl]);

  const canSubmit = !submitting && combo != null && (shareDresses || shareModel);

  const handleSubmit = async () => {
    if (!canSubmit || !combo) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Parameters<typeof createOotd>[0] = {
        comboId: combo.comboId,
        visibility,
        shareDresses,
        shareModel,
      };
      if (shareModel && tryonGenerationId) body.tryonGenerationId = tryonGenerationId;
      const trimmedCaption = caption.trim();
      const trimmedLocation = location.trim();
      if (trimmedCaption.length > 0) body.caption = trimmedCaption;
      if (trimmedLocation.length > 0) body.locationName = trimmedLocation;
      await createOotd(body);
      // Pop back to where the modal was triggered from. The Friends feed
      // re-fetches on focus (pull-to-refresh in the user's hand), so we
      // don't push there forcibly.
      router.back();
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Share failed';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Helpful body sizing — the modal is a screen, but everything packs vertically.
  const visibilityChips = useMemo<{ value: SimpleVisibility; label: string; subtitle: string }[]>(
    () => [
      { value: 'PUBLIC', label: 'Public', subtitle: 'Anyone in the community feed.' },
      { value: 'FRIENDS', label: 'Friends', subtitle: 'Only your friends see this.' },
    ],
    [],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
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
            <View style={[styles.headerRow, { gap: theme.space.sm }]}>
              <Pressable
                onPress={() => router.back()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={styles.backBtn}
              >
                <ChevronLeft size={24} strokeWidth={1.6} color={theme.color.text.primary} />
              </Pressable>
              <Text
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.h2,
                  fontWeight: theme.type.weight.medium as '500',
                }}
              >
                Wear this look
              </Text>
            </View>

            {/* Preview */}
            {loading ? (
              <View style={[styles.center, { paddingVertical: theme.space.xxxl }]}>
                <ActivityIndicator color={theme.color.brand} />
              </View>
            ) : loadError || !combo ? (
              <View style={[styles.center, { gap: theme.space.md, paddingVertical: theme.space.xxxl }]}>
                <Text
                  style={{
                    color: theme.color.text.tertiary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.regular as '400',
                    textAlign: 'center',
                  }}
                >
                  {loadError ?? 'Pick a look from your closet first.'}
                </Text>
                <Button variant="ghost" onPress={() => router.back()}>
                  Back to closet
                </Button>
              </View>
            ) : (
              <>
                {tryonImageUrl ? (
                  <Image
                    source={{ uri: tryonImageUrl }}
                    style={[
                      styles.tryonPreview,
                      {
                        backgroundColor: theme.color.bg.secondary,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                    accessibilityLabel="Try-on preview"
                  />
                ) : (
                  <ResolvedOutfitCard combination={combo} itemMap={itemMap} />
                )}

                {/* Caption */}
                <View style={{ gap: 6 }}>
                  <Text style={[styles.label, { color: theme.color.text.tertiary }]}>
                    Caption
                  </Text>
                  <TextInput
                    value={caption}
                    onChangeText={(text) => {
                      setCaptionEdited(true);
                      setCaption(text);
                    }}
                    placeholder="Add a caption..."
                    placeholderTextColor={theme.color.text.tertiary}
                    multiline
                    maxLength={280}
                    style={[
                      styles.field,
                      {
                        backgroundColor: theme.color.bg.secondary,
                        borderRadius: theme.radius.md,
                        padding: theme.space.md,
                        color: theme.color.text.primary,
                        fontSize: theme.type.size.body,
                        fontWeight: theme.type.weight.regular as '400',
                        minHeight: 80,
                      },
                    ]}
                  />
                </View>

                {/* Location */}
                <View style={{ gap: 6 }}>
                  <Text style={[styles.label, { color: theme.color.text.tertiary }]}>
                    Where
                  </Text>
                  <View
                    style={[
                      styles.locationRow,
                      {
                        gap: theme.space.sm,
                        backgroundColor: theme.color.bg.secondary,
                        borderRadius: theme.radius.pill,
                        paddingHorizontal: theme.space.md,
                      },
                    ]}
                  >
                    <MapPin size={16} strokeWidth={1.6} color={theme.color.text.tertiary} />
                    <TextInput
                      value={location}
                      onChangeText={setLocation}
                      placeholder="Tiong Bahru…"
                      placeholderTextColor={theme.color.text.tertiary}
                      maxLength={120}
                      style={[
                        styles.field,
                        {
                          flex: 1,
                          color: theme.color.text.primary,
                          fontSize: theme.type.size.body,
                          fontWeight: theme.type.weight.regular as '400',
                          paddingVertical: 10,
                        },
                      ]}
                    />
                  </View>
                </View>

                {/* Visibility */}
                <View style={{ gap: theme.space.sm }}>
                  <Text style={[styles.label, { color: theme.color.text.tertiary }]}>
                    Who can see this
                  </Text>
                  <View style={{ flexDirection: 'row', gap: theme.space.sm, flexWrap: 'wrap' }}>
                    {visibilityChips.map((v) => (
                      <Chip
                        key={v.value}
                        active={visibility === v.value}
                        onPress={() => setVisibility(v.value)}
                      >
                        {v.label}
                      </Chip>
                    ))}
                  </View>
                  <Text
                    style={{
                      color: theme.color.text.tertiary,
                      fontSize: theme.type.size.tiny,
                      fontWeight: theme.type.weight.regular as '400',
                    }}
                  >
                    {visibilityChips.find((v) => v.value === visibility)?.subtitle ?? ''}
                  </Text>
                </View>

                {/* Submit */}
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
                  {submitting ? 'Sharing…' : 'Share look'}
                </Button>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Screen>
    </>
  );
}

// Small wrapper that resolves `combination.itemIds` → `ClosetItem[]` inside a
// useMemo so OutfitCard's `items` prop has stable identity per
// (combination, itemMap.state) pair. Without this the inline
// `itemMap.resolve(...)` returns a brand-new array on every parent render,
// turning every state update into churn for the children below.
function ResolvedOutfitCard({
  combination,
  itemMap,
}: {
  combination: Combination;
  itemMap: ReturnType<typeof useClosetItemMap>;
}) {
  const items = useMemo(
    () => itemMap.resolve(combination.itemIds),
    // The whole point of memoizing is to keep identity stable across
    // unrelated renders. Re-resolve only when the combination's items
    // change or when the underlying closet map flips into a new state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [combination.itemIds.join(','), itemMap.state],
  );
  return <OutfitCard combination={combination} items={items} />;
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
  label: {
    fontSize: 11,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  field: {
    width: '100%',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorBanner: {
    width: '100%',
  },
  tryonPreview: {
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
  },
});
