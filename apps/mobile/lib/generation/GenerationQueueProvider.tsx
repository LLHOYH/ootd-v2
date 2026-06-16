import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@mei/ui';
import type { ModelPhoto, TryonGeneration } from '@mei/types';
import { fetchLatestModelPhoto } from '../api/modelPhoto';
import { fetchTryon } from '../api/tryon';

const POLL_MS = 4_000;
const TOAST_MS = 5_500;

type TrackedTask =
  | {
      kind: 'model-photo';
      modelPhotoId: string;
    }
  | {
      kind: 'tryon';
      generationId: string;
      comboId: string;
      comboJson?: string;
    };

interface ToastState {
  id: number;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ShowToastInput {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface GenerationQueueContextValue {
  trackModelPhoto: (modelPhoto: ModelPhoto) => void;
  trackTryon: (
    generation: TryonGeneration,
    meta?: { comboId?: string; comboJson?: string },
  ) => void;
  showToast: (toast: ShowToastInput) => void;
}

const GenerationQueueContext = createContext<GenerationQueueContextValue | null>(null);

export function GenerationQueueProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [tasks, setTasks] = useState<TrackedTask[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((input: ShowToastInput) => {
    setToast((prev) => ({
      id: (prev?.id ?? 0) + 1,
      ...input,
    }));
  }, []);

  const trackModelPhoto = useCallback(
    (modelPhoto: ModelPhoto) => {
      if (modelPhoto.status !== 'PENDING') {
        if (modelPhoto.status === 'READY') {
          showToast({
            title: 'Model photo ready',
            message: 'Your generated model is ready for try-ons.',
            actionLabel: 'View',
            onAction: () => router.push('/selfies' as never),
          });
        }
        return;
      }
      setTasks((prev) => upsertTask(prev, {
        kind: 'model-photo',
        modelPhotoId: modelPhoto.modelPhotoId,
      }));
      showToast({
        title: 'Model photo queued',
        message: 'You can keep using Mei. I’ll let you know when it finishes.',
      });
    },
    [showToast],
  );

  const trackTryon = useCallback(
    (
      generation: TryonGeneration,
      meta: { comboId?: string; comboJson?: string } = {},
    ) => {
      if (generation.status !== 'PENDING') {
        if (generation.status === 'READY') {
          showToast({
            title: 'Try-on ready',
            message: 'Your generated look is ready.',
            actionLabel: 'View',
            onAction: () => openTryon(generation.generationId, meta),
          });
        }
        return;
      }
      setTasks((prev) => upsertTask(prev, {
        kind: 'tryon',
        generationId: generation.generationId,
        comboId: meta.comboId ?? generation.comboId,
        comboJson: meta.comboJson,
      }));
      showToast({
        title: 'Try-on queued',
        message: 'You can leave this screen. I’ll let you know when it finishes.',
      });
    },
    [showToast],
  );

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (tasks.length === 0) return undefined;
    let cancelled = false;

    const poll = async () => {
      const nextTasks: TrackedTask[] = [];
      for (const task of tasks) {
        const keep = await pollTask(task, showToast);
        if (cancelled) return;
        if (keep) nextTasks.push(keep);
      }
      setTasks((prev) => (sameTasks(prev, nextTasks) ? prev : nextTasks));
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [showToast, tasks]);

  const value = useMemo(
    () => ({ trackModelPhoto, trackTryon, showToast }),
    [showToast, trackModelPhoto, trackTryon],
  );

  return (
    <GenerationQueueContext.Provider value={value}>
      {children}
      <View
        pointerEvents="box-none"
        style={[
          styles.toastHost,
          {
            top: insets.top + theme.space.sm,
            paddingHorizontal: theme.space.lg,
          },
        ]}
      >
        {toast ? (
          <View
            style={[
              styles.toast,
              {
                backgroundColor: theme.color.bg.primary,
                borderColor: theme.color.border.default,
                borderRadius: theme.radius.md,
                padding: theme.space.md,
                gap: theme.space.sm,
                shadowColor: theme.color.text.primary,
              },
            ]}
          >
            <View style={styles.toastCopy}>
              <Text
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.caption,
                  fontWeight: theme.type.weight.medium as '500',
                }}
                numberOfLines={1}
              >
                {toast.title}
              </Text>
              <Text
                style={{
                  color: theme.color.text.tertiary,
                  fontSize: theme.type.size.tiny,
                  fontWeight: theme.type.weight.regular as '400',
                  marginTop: 2,
                }}
                numberOfLines={2}
              >
                {toast.message}
              </Text>
            </View>
            {toast.actionLabel && toast.onAction ? (
              <Pressable
                onPress={() => {
                  const action = toast.onAction;
                  setToast(null);
                  action?.();
                }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.toastAction,
                  {
                    opacity: pressed ? 0.65 : 1,
                    paddingHorizontal: theme.space.sm,
                  },
                ]}
              >
                <Text
                  style={{
                    color: theme.color.brand,
                    fontSize: theme.type.size.caption,
                    fontWeight: theme.type.weight.medium as '500',
                  }}
                >
                  {toast.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
    </GenerationQueueContext.Provider>
  );
}

export function useGenerationQueue(): GenerationQueueContextValue {
  const ctx = useContext(GenerationQueueContext);
  if (!ctx) {
    throw new Error('useGenerationQueue must be used within GenerationQueueProvider');
  }
  return ctx;
}

function upsertTask(tasks: TrackedTask[], task: TrackedTask): TrackedTask[] {
  const key = taskKey(task);
  return [...tasks.filter((existing) => taskKey(existing) !== key), task];
}

function taskKey(task: TrackedTask): string {
  return task.kind === 'model-photo'
    ? `model-photo:${task.modelPhotoId}`
    : `tryon:${task.generationId}`;
}

function sameTasks(a: TrackedTask[], b: TrackedTask[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((task, index) => taskKey(task) === taskKey(b[index]));
}

async function pollTask(
  task: TrackedTask,
  showToast: (toast: ShowToastInput) => void,
): Promise<TrackedTask | null> {
  try {
    if (task.kind === 'model-photo') {
      const data = await fetchLatestModelPhoto();
      const latest = data.latest;
      if (!latest || latest.modelPhotoId !== task.modelPhotoId) return task;
      if (latest.status === 'PENDING') return task;
      if (latest.status === 'READY') {
        showToast({
          title: 'Model photo ready',
          message: 'Your generated model is ready for try-ons.',
          actionLabel: 'View',
          onAction: () => router.push('/selfies' as never),
        });
        return null;
      }
      showToast({
        title: 'Model photo failed',
        message: latest.errorDetail ?? 'The generation did not finish.',
        actionLabel: 'View',
        onAction: () => router.push('/selfies' as never),
      });
      return null;
    }

    const generation = await fetchTryon(task.generationId);
    if (generation.status === 'PENDING') return task;
    if (generation.status === 'READY') {
      showToast({
        title: 'Try-on ready',
        message: 'Your generated look is ready.',
        actionLabel: 'View',
        onAction: () => openTryon(task.generationId, task),
      });
      return null;
    }
    showToast({
      title: 'Try-on failed',
      message: generation.errorDetail ?? 'The generation did not finish.',
      actionLabel: 'View',
      onAction: () => openTryon(task.generationId, task),
    });
    return null;
  } catch {
    return task;
  }
}

function openTryon(
  generationId: string,
  meta: { comboId?: string; comboJson?: string },
) {
  router.push({
    pathname: '/tryon',
    params: {
      generationId,
      ...(meta.comboId ? { comboId: meta.comboId } : {}),
      ...(meta.comboJson ? { comboJson: meta.comboJson } : {}),
    },
  } as never);
}

const styles = StyleSheet.create({
  toastHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 50,
  },
  toast: {
    minHeight: 64,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastCopy: {
    flex: 1,
  },
  toastAction: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
