import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { CheckCircle2, ChevronRight, Sparkles, XCircle } from 'lucide-react-native';
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

interface QueueEvent extends ShowToastInput {
  id: number;
  status: 'ready' | 'failed';
  createdAt: number;
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
  const [events, setEvents] = useState<QueueEvent[]>([]);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const showToast = useCallback((input: ShowToastInput) => {
    setToast((prev) => ({
      id: (prev?.id ?? 0) + 1,
      ...input,
    }));
  }, []);

  const notifyResult = useCallback(
    (input: Omit<QueueEvent, 'id' | 'createdAt'>) => {
      showToast(input);
      setEvents((prev) => [
        {
          id: Date.now(),
          createdAt: Date.now(),
          ...input,
        },
        ...prev,
      ].slice(0, 6));
    },
    [showToast],
  );

  const trackModelPhoto = useCallback(
    (modelPhoto: ModelPhoto) => {
      if (modelPhoto.status !== 'PENDING') {
        if (modelPhoto.status === 'READY') {
          notifyResult({
            status: 'ready',
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
    [notifyResult, showToast],
  );

  const trackTryon = useCallback(
    (
      generation: TryonGeneration,
      meta: { comboId?: string; comboJson?: string } = {},
    ) => {
      if (generation.status !== 'PENDING') {
        if (generation.status === 'READY') {
          notifyResult({
            status: 'ready',
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
    [notifyResult, showToast],
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
        const keep = await pollTask(task, notifyResult);
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
  }, [notifyResult, tasks]);

  const value = useMemo(
    () => ({ trackModelPhoto, trackTryon, showToast }),
    [showToast, trackModelPhoto, trackTryon],
  );
  const activeCount = tasks.length;
  const recentCount = events.length;
  const showTaskPill = activeCount > 0 || recentCount > 0;

  return (
    <GenerationQueueContext.Provider value={value}>
      {children}
      {showTaskPill ? (
        <View
          pointerEvents="box-none"
          style={[
            styles.taskPillHost,
            {
              bottom: insets.bottom + 84,
              paddingHorizontal: theme.space.lg,
            },
          ]}
        >
          <Pressable
            onPress={() => setPanelOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Open AI tasks"
            style={({ pressed }) => [
              styles.taskPill,
              {
                backgroundColor: theme.color.bg.primary,
                borderColor: theme.color.border.default,
                borderRadius: theme.radius.pill,
                paddingVertical: theme.space.sm,
                paddingLeft: theme.space.md,
                paddingRight: theme.space.sm,
                shadowColor: theme.color.text.primary,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={[
                styles.taskIcon,
                {
                  backgroundColor: theme.color.brandBg,
                  borderRadius: theme.radius.pill,
                },
              ]}
            >
              {activeCount > 0 ? (
                <ActivityIndicator size="small" color={theme.color.brand} />
              ) : (
                <Sparkles size={16} strokeWidth={1.7} color={theme.color.brand} />
              )}
            </View>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.caption,
                fontWeight: theme.type.weight.medium as '500',
              }}
              numberOfLines={1}
            >
              {activeCount > 0
                ? `${activeCount} AI task${activeCount === 1 ? '' : 's'} running`
                : `${recentCount} result${recentCount === 1 ? '' : 's'} ready`}
            </Text>
            <ChevronRight size={16} strokeWidth={1.8} color={theme.color.text.tertiary} />
          </Pressable>
        </View>
      ) : null}

      <TaskQueueSheet
        visible={panelOpen}
        tasks={tasks}
        events={events}
        onClose={() => setPanelOpen(false)}
        onClear={() => setEvents([])}
      />

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

function TaskQueueSheet({
  visible,
  tasks,
  events,
  onClose,
  onClear,
}: {
  visible: boolean;
  tasks: TrackedTask[];
  events: QueueEvent[];
  onClose: () => void;
  onClear: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[styles.modalScrim, { backgroundColor: 'rgba(0,0,0,0.28)' }]}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.color.bg.primary,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              paddingHorizontal: theme.space.lg,
              paddingTop: theme.space.md,
              paddingBottom: theme.space.xxl,
            },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: theme.color.bg.tertiary }]} />
          <View style={[styles.sheetHeader, { marginTop: theme.space.md }]}>
            <View>
              <Text
                style={{
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.h2,
                  fontWeight: theme.type.weight.medium as '500',
                }}
              >
                AI tasks
              </Text>
              <Text
                style={{
                  color: theme.color.text.tertiary,
                  fontSize: theme.type.size.tiny,
                  fontWeight: theme.type.weight.regular as '400',
                  marginTop: 2,
                }}
              >
                Background image generation
              </Text>
            </View>
            {events.length > 0 ? (
              <Pressable
                onPress={onClear}
                accessibilityRole="button"
                style={({ pressed }) => [{ opacity: pressed ? 0.65 : 1 }]}
              >
                <Text
                  style={{
                    color: theme.color.brand,
                    fontSize: theme.type.size.caption,
                    fontWeight: theme.type.weight.medium as '500',
                  }}
                >
                  Clear
                </Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView
            style={{ maxHeight: 420, marginTop: theme.space.lg }}
            contentContainerStyle={{ gap: theme.space.sm }}
            showsVerticalScrollIndicator={false}
          >
            {tasks.length > 0 ? (
              <View style={{ gap: theme.space.sm }}>
                <Text
                  style={{
                    color: theme.color.text.secondary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.medium as '500',
                  }}
                >
                  Running
                </Text>
                {tasks.map((task) => (
                  <TaskRow
                    key={taskKey(task)}
                    title={taskTitle(task)}
                    message={taskMessage(task)}
                    status="running"
                    actionLabel="Open"
                    onAction={() => {
                      onClose();
                      openTask(task);
                    }}
                  />
                ))}
              </View>
            ) : null}

            {events.length > 0 ? (
              <View style={{ gap: theme.space.sm, marginTop: tasks.length > 0 ? theme.space.md : 0 }}>
                <Text
                  style={{
                    color: theme.color.text.secondary,
                    fontSize: theme.type.size.tiny,
                    fontWeight: theme.type.weight.medium as '500',
                  }}
                >
                  Recent
                </Text>
                {events.map((event) => (
                  <TaskRow
                    key={event.id}
                    title={event.title}
                    message={event.message}
                    status={event.status}
                    actionLabel={event.actionLabel}
                    onAction={
                      event.onAction
                        ? () => {
                            onClose();
                            event.onAction?.();
                          }
                        : undefined
                    }
                  />
                ))}
              </View>
            ) : null}

            {tasks.length === 0 && events.length === 0 ? (
              <View
                style={[
                  styles.emptyState,
                  {
                    backgroundColor: theme.color.bg.secondary,
                    borderRadius: theme.radius.md,
                    padding: theme.space.lg,
                  },
                ]}
              >
                <Sparkles size={22} strokeWidth={1.6} color={theme.color.text.tertiary} />
                <Text
                  style={{
                    color: theme.color.text.tertiary,
                    fontSize: theme.type.size.caption,
                    fontWeight: theme.type.weight.regular as '400',
                    textAlign: 'center',
                    marginTop: theme.space.sm,
                  }}
                >
                  No AI tasks right now.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TaskRow({
  title,
  message,
  status,
  actionLabel,
  onAction,
}: {
  title: string;
  message: string;
  status: 'running' | 'ready' | 'failed';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.taskRow,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
          gap: theme.space.sm,
        },
      ]}
    >
      <View style={styles.taskStatusIcon}>
        {status === 'running' ? (
          <ActivityIndicator size="small" color={theme.color.brand} />
        ) : status === 'ready' ? (
          <CheckCircle2 size={20} strokeWidth={1.7} color={theme.color.success} />
        ) : (
          <XCircle size={20} strokeWidth={1.7} color={theme.color.danger} />
        )}
      </View>
      <View style={styles.taskCopy}>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.caption,
            fontWeight: theme.type.weight.medium as '500',
          }}
          numberOfLines={1}
        >
          {title}
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
          {message}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.rowAction,
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
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
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

function taskTitle(task: TrackedTask): string {
  return task.kind === 'model-photo' ? 'Model photo' : 'Model try-on';
}

function taskMessage(task: TrackedTask): string {
  return task.kind === 'model-photo'
    ? 'Generating your reusable model photo.'
    : 'Fitting this closet item to your model.';
}

function openTask(task: TrackedTask) {
  if (task.kind === 'model-photo') {
    router.push('/selfies' as never);
    return;
  }
  openTryon(task.generationId, task);
}

function sameTasks(a: TrackedTask[], b: TrackedTask[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((task, index) => taskKey(task) === taskKey(b[index]));
}

async function pollTask(
  task: TrackedTask,
  notifyResult: (event: Omit<QueueEvent, 'id' | 'createdAt'>) => void,
): Promise<TrackedTask | null> {
  try {
    if (task.kind === 'model-photo') {
      const data = await fetchLatestModelPhoto();
      const latest = data.latest;
      if (!latest || latest.modelPhotoId !== task.modelPhotoId) return task;
      if (latest.status === 'PENDING') return task;
      if (latest.status === 'READY') {
        notifyResult({
          status: 'ready',
          title: 'Model photo ready',
          message: 'Your generated model is ready for try-ons.',
          actionLabel: 'View',
          onAction: () => router.push('/selfies' as never),
        });
        return null;
      }
      notifyResult({
        status: 'failed',
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
      notifyResult({
        status: 'ready',
        title: 'Try-on ready',
        message: 'Your generated look is ready.',
        actionLabel: 'View',
        onAction: () => openTryon(task.generationId, task),
      });
      return null;
    }
    notifyResult({
      status: 'failed',
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
  taskPillHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 40,
    alignItems: 'center',
  },
  taskPill: {
    minHeight: 48,
    maxWidth: '92%',
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  taskIcon: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  modalScrim: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskStatusIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCopy: {
    flex: 1,
  },
  rowAction: {
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    minHeight: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
