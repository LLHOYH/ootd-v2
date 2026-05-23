// Try-on preview — SPEC §10.10 (Wear-this), PR C.2 of the selfie trilogy.
//
// Modal route reached from Today's "Wear this on me" button. Generates a
// photo of the user wearing the dominant garment from the combination
// (via Replicate IDM-VTON behind the api Lambda + image-worker), shows
// it, and offers three follow-ups:
//
//   - Try a different selfie — re-runs generation with another of the
//     user's uploaded selfies. Each (selfie, combo, item) tuple is
//     cached on the backend so swapping back is instant.
//   - Done — closes the screen. Result stays in `tryon_generations`.
//   - Share with friends — hands off to /share with the existing
//     comboId so the user can post this look. (Posting the generated
//     image itself is a v2 polish; v1 shares the outfit composite.)
//
// The POST blocks for 15-30s. We show a progress UI with a clear "this
// is going to take a moment" cue.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ChevronLeft,
  RefreshCcw,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react-native';
import { Button, Screen, useTheme } from '@mei/ui';
import type { Combination, TryonGeneration } from '@mei/types';

import { ApiError } from '@/lib/api/client';
import { createTryon } from '@/lib/api/tryon';
import { useSelfies, type Selfie } from '@/lib/hooks/useSelfies';

type Phase =
  | { kind: 'idle' }
  | { kind: 'generating'; selfieId?: string }
  | { kind: 'ready'; data: TryonGeneration }
  | { kind: 'error'; message: string; code?: string };

export default function TryonScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ comboId?: string; comboJson?: string }>();
  const selfiesHook = useSelfies();

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [pickerOpen, setPickerOpen] = useState(false);
  // Track which selfie produced the current image so we can mark it in
  // the picker. Updated on every successful generation.
  const lastSelfieIdRef = useRef<string | undefined>(undefined);

  // The combination is passed in by Today (serialized) so we can show
  // its name in the loading/result chrome without a refetch.
  const combo: Combination | null = (() => {
    if (!params.comboJson || typeof params.comboJson !== 'string') return null;
    try {
      return JSON.parse(params.comboJson) as Combination;
    } catch {
      return null;
    }
  })();
  const comboName = combo?.name ?? 'this look';

  const runGeneration = useCallback(
    async (selfieId?: string) => {
      if (!params.comboId || typeof params.comboId !== 'string') {
        setPhase({
          kind: 'error',
          message: 'Missing combination id.',
          code: 'NO_COMBO',
        });
        return;
      }
      setPhase({ kind: 'generating', selfieId });
      try {
        const body: { comboId: string; selfieId?: string } = { comboId: params.comboId };
        if (selfieId) body.selfieId = selfieId;
        const data = await createTryon(body);
        lastSelfieIdRef.current = data.selfieId;
        if (data.status === 'READY' && data.imageUrl) {
          setPhase({ kind: 'ready', data });
        } else if (data.status === 'FAILED') {
          setPhase({
            kind: 'error',
            message:
              data.errorDetail ??
              'Generation failed. Try again — Replicate sometimes has bad runs.',
          });
        } else {
          setPhase({
            kind: 'error',
            message:
              'Generation finished but no image came back. Try again, or pick a different selfie.',
          });
        }
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Generation failed';
        const code = err instanceof ApiError ? err.code : undefined;
        setPhase({ kind: 'error', message, code });
      }
    },
    [params.comboId],
  );

  // Kick off the first generation on mount.
  useEffect(() => {
    if (phase.kind === 'idle') void runGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSwapSelfie = (s: Selfie) => {
    setPickerOpen(false);
    void runGeneration(s.selfieId);
  };

  const handleShare = () => {
    if (phase.kind !== 'ready') return;
    // Hand off to the existing share modal. We pass through both the
    // comboId and the original comboJson so the share preview shows the
    // outfit composite without a round-trip. v2 polish: also pass the
    // generated image URL so the share preview shows the try-on photo.
    router.replace({
      pathname: '/share',
      params: {
        comboId: phase.data.comboId,
        ...(params.comboJson ? { comboJson: params.comboJson } : {}),
      },
    } as never);
  };

  // expo-router 6 reconciles `<Stack.Screen options={…} />` by reference; a
  // fresh literal each render reads as "options changed" and triggers a
  // re-render loop. Same fix as PR #71 (share.tsx). Stabilize with useMemo.
  const screenOptions = useMemo(
    () => ({ headerShown: false, presentation: 'modal' as const }),
    [],
  );

  return (
    <>
      <Stack.Screen options={screenOptions} />
      <Screen>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.space.lg,
            paddingBottom: theme.space.xxxl,
            gap: theme.space.lg,
          }}
          showsVerticalScrollIndicator={false}
        >
          {/* ---- Header --------------------------------------------------- */}
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
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.h2,
                  fontWeight: theme.type.weight.medium as '500',
                }}
              >
                Wearing {comboName}
              </Text>
            </View>
          </View>

          {/* ---- Image stage --------------------------------------------- */}
          <View
            style={[
              styles.stage,
              {
                backgroundColor: theme.color.bg.secondary,
                borderRadius: theme.radius.md,
              },
            ]}
          >
            {phase.kind === 'generating' ? <GeneratingState /> : null}
            {phase.kind === 'ready' && phase.data.imageUrl ? (
              <Image
                source={{ uri: phase.data.imageUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
            ) : null}
            {phase.kind === 'error' ? <ErrorState message={phase.message} /> : null}
          </View>

          {/* ---- Action buttons ----------------------------------------- */}
          {phase.kind === 'ready' ? (
            <View style={{ gap: theme.space.sm }}>
              <Button
                variant="primary"
                icon={Share2}
                onPress={handleShare}
              >
                Share with friends
              </Button>
              <View style={[styles.row, { gap: theme.space.sm }]}>
                <Button
                  variant="ghost"
                  icon={Users}
                  onPress={() => setPickerOpen(true)}
                  style={{ flex: 1 }}
                  disabled={selfiesHook.count <= 1}
                >
                  {selfiesHook.count > 1 ? 'Different selfie' : 'Only one selfie'}
                </Button>
                <Button
                  variant="ghost"
                  onPress={() => router.back()}
                  style={{ flex: 1 }}
                >
                  Done
                </Button>
              </View>
              <Text
                style={{
                  color: theme.color.text.tertiary,
                  fontSize: theme.type.size.tiny,
                  fontWeight: theme.type.weight.regular as '400',
                  textAlign: 'center',
                  marginTop: theme.space.xs,
                }}
              >
                Saved to your try-ons. Up to 10 generations per day.
              </Text>
            </View>
          ) : null}

          {phase.kind === 'error' ? (
            <View style={{ gap: theme.space.sm }}>
              {/* Special-case "no selfie" so the CTA actually fixes it. */}
              {phase.code === 'NO_SELFIE' ? (
                <Button
                  variant="primary"
                  icon={Sparkles}
                  onPress={() => router.replace('/selfies' as never)}
                >
                  Add a selfie
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={RefreshCcw}
                  onPress={() => void runGeneration(lastSelfieIdRef.current)}
                >
                  Try again
                </Button>
              )}
              <Button variant="ghost" onPress={() => router.back()}>
                Back
              </Button>
            </View>
          ) : null}

          {phase.kind === 'generating' ? (
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
                textAlign: 'center',
              }}
            >
              Putting this on you usually takes 15–30 seconds.
            </Text>
          ) : null}
        </ScrollView>

        {/* ---- Selfie picker modal ------------------------------------- */}
        <SelfiePicker
          visible={pickerOpen}
          selfies={
            selfiesHook.state.status === 'ready'
              ? selfiesHook.state.selfies
              : []
          }
          activeSelfieId={lastSelfieIdRef.current}
          onPick={handleSwapSelfie}
          onClose={() => setPickerOpen(false)}
        />
      </Screen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GeneratingState() {
  const theme = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { gap: theme.space.md, padding: theme.space.xl },
      ]}
    >
      <ActivityIndicator size="large" color={theme.color.brand} />
      <Text
        style={{
          color: theme.color.text.primary,
          fontSize: theme.type.size.body,
          fontWeight: theme.type.weight.medium as '500',
          textAlign: 'center',
        }}
      >
        Putting this on you…
      </Text>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.regular as '400',
          textAlign: 'center',
        }}
      >
        Stella is dressing your photo.
      </Text>
    </View>
  );
}

function ErrorState({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        styles.center,
        { padding: theme.space.xl, gap: theme.space.sm },
      ]}
    >
      <Text
        style={{
          color: theme.color.brand,
          fontSize: theme.type.size.body,
          fontWeight: theme.type.weight.medium as '500',
          textAlign: 'center',
        }}
      >
        Couldn’t generate this look.
      </Text>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.regular as '400',
          textAlign: 'center',
        }}
        numberOfLines={4}
      >
        {message}
      </Text>
    </View>
  );
}

interface SelfiePickerProps {
  visible: boolean;
  selfies: Selfie[];
  activeSelfieId?: string;
  onPick: (s: Selfie) => void;
  onClose: () => void;
}

function SelfiePicker({
  visible,
  selfies,
  activeSelfieId,
  onPick,
  onClose,
}: SelfiePickerProps) {
  const theme = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[styles.modalScrim, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.color.bg.primary,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              padding: theme.space.lg,
              gap: theme.space.md,
            },
          ]}
        >
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.h2,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            Choose a selfie
          </Text>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
            }}
          >
            We'll re-run the try-on with this selfie. Cached results swap
            back instantly.
          </Text>
          <View style={[styles.pickerGrid, { gap: theme.space.sm }]}>
            {selfies.map((s) => (
              <Pressable
                key={s.selfieId}
                onPress={() => onPick(s)}
                style={({ pressed }) => [
                  styles.pickerTile,
                  {
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.pickerTileInner,
                    {
                      backgroundColor: theme.color.bg.secondary,
                      borderRadius: theme.radius.sm,
                      borderColor:
                        s.selfieId === activeSelfieId
                          ? theme.color.brand
                          : 'transparent',
                    },
                  ]}
                >
                  {s.url ? (
                    <Image
                      source={{ uri: s.url }}
                      style={StyleSheet.absoluteFill}
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_PCT = '31.5%';
const STAGE_ASPECT = 3 / 4;

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: '100%',
    aspectRatio: STAGE_ASPECT,
    overflow: 'hidden',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    width: '100%',
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pickerTile: {
    width: TILE_PCT,
    aspectRatio: 3 / 4,
  },
  pickerTileInner: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 2,
  },
});
