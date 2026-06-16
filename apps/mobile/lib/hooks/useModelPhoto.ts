import { useCallback, useEffect, useState } from 'react';
import type { ModelPhoto } from '@mei/types';
import { ApiError } from '../api/client';
import {
  createModelPhoto,
  fetchLatestModelPhoto,
} from '../api/modelPhoto';
import { useSession } from '../auth/SessionProvider';
import { useGenerationQueue } from '../generation/GenerationQueueProvider';

export type UseModelPhotoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; latest?: ModelPhoto }
  | { status: 'error'; error: ApiError; latest?: ModelPhoto };

export interface UseModelPhotoResult {
  state: UseModelPhotoState;
  generating: boolean;
  refetch: () => Promise<void>;
  generate: (selfieIds?: string[]) => Promise<ModelPhoto>;
}

export function useModelPhoto(): UseModelPhotoResult {
  const { session, loading: sessionLoading } = useSession();
  const { trackModelPhoto } = useGenerationQueue();
  const [state, setState] = useState<UseModelPhotoState>({ status: 'idle' });
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async (
    signal?: AbortSignal,
    opts: { silent?: boolean } = {},
  ) => {
    if (!session) {
      setState({ status: 'idle' });
      return;
    }
    if (!opts.silent) setState({ status: 'loading' });
    try {
      const data = await fetchLatestModelPhoto({ signal });
      if (signal?.aborted) return;
      setState({ status: 'ready', latest: data.latest });
    } catch (err) {
      if (signal?.aborted) return;
      const apiErr =
        err instanceof ApiError
          ? err
          : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown error');
      setState((prev) => ({
        status: 'error',
        error: apiErr,
        latest: prev.status === 'ready' || prev.status === 'error' ? prev.latest : undefined,
      }));
    }
  }, [session]);

  useEffect(() => {
    if (sessionLoading) return;
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [sessionLoading, load]);

  const generate = useCallback(
    async (selfieIds?: string[]) => {
      setGenerating(true);
      try {
        const body = selfieIds && selfieIds.length > 0 ? { selfieIds } : undefined;
        const latest = await createModelPhoto(body);
        setState({ status: 'ready', latest });
        trackModelPhoto(latest);
        return latest;
      } catch (err) {
        const apiErr =
          err instanceof ApiError
            ? err
            : new ApiError(0, 'UNKNOWN', err instanceof Error ? err.message : 'Unknown error');
        setState((prev) => ({
          status: 'error',
          error: apiErr,
          latest: prev.status === 'ready' || prev.status === 'error' ? prev.latest : undefined,
        }));
        throw apiErr;
      } finally {
        setGenerating(false);
      }
    },
    [trackModelPhoto],
  );

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  const latest = state.status === 'ready' || state.status === 'error' ? state.latest : undefined;
  useEffect(() => {
    if (latest?.status !== 'PENDING') return undefined;
    const timer = setInterval(() => {
      void load(undefined, { silent: true });
    }, 4_000);
    return () => clearInterval(timer);
  }, [latest?.status, load]);

  return { state, generating, refetch, generate };
}
