// Try-on preview — SPEC §10.10 (Wear-this), PR C.2 of the selfie trilogy.
//
// Modal route reached from Today's "Wear this on me" button. Generates a
// photo of the user's generated model wearing the dominant garment from the combination
// (via the Replicate try-on provider behind the api Lambda + image-worker), shows
// it, and offers three follow-ups:
//
//   - Regenerate — re-runs the model try-on if the user dislikes the output.
//   - Done — closes the screen. Result stays in `tryon_generations`.
//   - Share with friends — hands off to /share with the existing
//     comboId so the user can post this look. (Posting the generated
//     image itself is a v2 polish; v1 shares the outfit composite.)
//
// The POST queues quickly. The image-worker promotes the row later, so this
// screen polls while mounted and the global generation queue keeps watching
// if the user leaves.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
} from 'lucide-react-native';
import { Button, Screen, useTheme } from '@mei/ui';
import type { Combination, TryonGeneration } from '@mei/types';

import { ApiError } from '@/lib/api/client';
import { createTryon, fetchTryon } from '@/lib/api/tryon';
import { useGenerationQueue } from '@/lib/generation/GenerationQueueProvider';

type Phase =
  | { kind: 'idle' }
  | { kind: 'queueing' }
  | { kind: 'pending'; data: TryonGeneration }
  | { kind: 'ready'; data: TryonGeneration }
  | { kind: 'error'; message: string; code?: string };

function displayComboName(name: string | undefined): string | null {
  const trimmed = name?.trim();
  if (!trimmed || /^new combination$/i.test(trimmed)) return null;
  return trimmed;
}

export default function TryonScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    comboId?: string;
    comboJson?: string;
    generationId?: string;
  }>();
  const { trackTryon } = useGenerationQueue();

  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const latestRunIdRef = useRef(0);
  const startedRef = useRef(false);

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
  const comboName = displayComboName(combo?.name);
  const comboId = typeof params.comboId === 'string' ? params.comboId : undefined;
  const comboJson = typeof params.comboJson === 'string' ? params.comboJson : undefined;
  const generationId =
    typeof params.generationId === 'string' ? params.generationId : undefined;
  const pendingGenerationId =
    phase.kind === 'pending' ? phase.data.generationId : undefined;

  const applyGeneration = useCallback(
    (data: TryonGeneration, opts: { track?: boolean } = {}) => {
      if (data.status === 'READY' && data.imageUrl) {
        setPhase({ kind: 'ready', data });
        return;
      }
      if (data.status === 'PENDING') {
        setPhase({ kind: 'pending', data });
        if (opts.track) {
          trackTryon(data, { comboId: comboId ?? data.comboId, comboJson });
        }
        return;
      }
      setPhase({
        kind: 'error',
        message:
          data.errorDetail ??
          'Generation failed. Try again — Replicate sometimes has bad runs.',
      });
    },
    [comboId, comboJson, trackTryon],
  );

  const runGeneration = useCallback(
    async () => {
      if (!comboId) {
        setPhase({
          kind: 'error',
          message: 'Missing combination id.',
          code: 'NO_COMBO',
        });
        return;
      }
      const runId = latestRunIdRef.current + 1;
      latestRunIdRef.current = runId;
      setPhase({ kind: 'queueing' });
      try {
        const data = await createTryon({ comboId });
        if (latestRunIdRef.current !== runId) return;
        applyGeneration(data, { track: true });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Generation failed';
        const code = err instanceof ApiError ? err.code : undefined;
        if (latestRunIdRef.current !== runId) return;
        setPhase({ kind: 'error', message, code });
      }
    },
    [applyGeneration, comboId],
  );

  const loadGeneration = useCallback(
    async (id: string) => {
      const runId = latestRunIdRef.current + 1;
      latestRunIdRef.current = runId;
      if (phase.kind === 'idle') setPhase({ kind: 'queueing' });
      try {
        const data = await fetchTryon(id);
        if (latestRunIdRef.current !== runId) return;
        applyGeneration(data);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not load try-on';
        const code = err instanceof ApiError ? err.code : undefined;
        if (latestRunIdRef.current !== runId) return;
        setPhase({ kind: 'error', message, code });
      }
    },
    [applyGeneration, phase.kind],
  );

  // Kick off the first generation on mount, or load an already-queued job
  // when opened from a "ready" toast.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (generationId) {
      void loadGeneration(generationId);
    } else {
      void runGeneration();
    }
  }, [generationId, loadGeneration, runGeneration]);

  useEffect(() => {
    if (!pendingGenerationId) return undefined;
    const timer = setInterval(() => {
      void loadGeneration(pendingGenerationId);
    }, 4_000);
    return () => clearInterval(timer);
  }, [loadGeneration, pendingGenerationId]);

  const handleShare = () => {
    if (phase.kind !== 'ready') return;
    // Hand off to the existing share modal. We pass through the combo
    // payload to avoid a round-trip and the signed try-on image URL so
    // the confirmation preview matches what the user just generated.
    router.replace({
      pathname: '/share',
      params: {
        comboId: phase.data.comboId,
        ...(phase.data.imageUrl ? { tryonImageUrl: phase.data.imageUrl } : {}),
        ...(comboJson ? { comboJson } : {}),
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
                Model try-on
              </Text>
              <Text
                style={{
                  color: theme.color.text.tertiary,
                  fontSize: theme.type.size.tiny,
                  fontWeight: theme.type.weight.regular as '400',
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {comboName
                  ? `Styling ${comboName} on your model`
                  : 'Styling this look on your model'}
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
            {phase.kind === 'queueing' ? (
              <GeneratingState title="Queueing try-on…" />
            ) : null}
            {phase.kind === 'pending' ? (
              <GeneratingState
                title="Dressing your model…"
                detail="You can leave this screen. I’ll let you know when it finishes."
              />
            ) : null}
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
                  icon={RefreshCcw}
                  onPress={() => void runGeneration()}
                  style={{ flex: 1 }}
                >
                  Regenerate
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
                Generated from your model photo. Up to 250 generations per day.
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
              ) : phase.code === 'NO_MODEL_PHOTO' ? (
                <Button
                  variant="primary"
                  icon={Sparkles}
                  onPress={() => router.replace('/selfies' as never)}
                >
                  Generate model photo
                </Button>
              ) : (
                <Button
                  variant="primary"
                  icon={RefreshCcw}
                  onPress={() => void runGeneration()}
                >
                  Try again
                </Button>
              )}
              <Button variant="ghost" onPress={() => router.back()}>
                Back
              </Button>
            </View>
          ) : null}

          {phase.kind === 'pending' ? (
            <View style={{ gap: theme.space.sm }}>
              <Button variant="primary" onPress={() => router.back()}>
                Back
              </Button>
              <Text
                style={{
                  color: theme.color.text.tertiary,
                  fontSize: theme.type.size.tiny,
                  fontWeight: theme.type.weight.regular as '400',
                  textAlign: 'center',
                }}
              >
                This will keep running in the background.
              </Text>
            </View>
          ) : null}

          {phase.kind === 'queueing' ? (
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
                textAlign: 'center',
              }}
            >
              Starting the background job.
            </Text>
          ) : null}
        </ScrollView>
      </Screen>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function GeneratingState({
  title = 'Dressing your model…',
  detail = 'Stella is fitting the closet item to your generated model.',
}: {
  title?: string;
  detail?: string;
}) {
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
        {title}
      </Text>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.regular as '400',
          textAlign: 'center',
        }}
      >
        {detail}
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
});
