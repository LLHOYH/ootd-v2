// Wear this · Confirm & share — SPEC §10.10.
//
// Modal route. Receives a `comboId` query param, renders a preview of
// the combination, lets the user pick visibility + write a caption +
// add a location, then POST /ootd. The selfie + try-on photo flow
// (§9.3, P1) lands in feat/wire-tryon — for now we always emit a
// fallback OutfitCard composite, which the api creates server-side.
//
// Visibility lanes here cover PUBLIC + FRIENDS (the §10.10 default
// section). GROUP and DIRECT need hangout / friend pickers — they ship
// with feat/wire-share-targets.

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useSession } from '@/lib/auth/SessionProvider';

// Visibility lanes wired in this PR. GROUP / DIRECT live behind a
// "Choose recipients" follow-up that needs a hangout + friend picker.
type SimpleVisibility = Extract<OOTDVisibility, 'PUBLIC' | 'FRIENDS'>;

export default function ShareScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ comboId?: string; comboJson?: string }>();
  const { session } = useSession();
  const me = session?.user.id;

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

  const [combo, setCombo] = useState<Combination | null>(initialCombo);
  const [loading, setLoading] = useState(initialCombo == null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [caption, setCaption] = useState('');
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

  const canSubmit = !submitting && combo != null;

  const handleSubmit = async () => {
    if (!canSubmit || !combo) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Parameters<typeof createOotd>[0] = {
        comboId: combo.comboId,
        visibility,
      };
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
                <OutfitCard combination={combo} />

                {/* Caption */}
                <View style={{ gap: 6 }}>
                  <Text style={[styles.label, { color: theme.color.text.tertiary }]}>
                    Caption
                  </Text>
                  <TextInput
                    value={caption}
                    onChangeText={setCaption}
                    placeholder="Say something about this look…"
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
});
