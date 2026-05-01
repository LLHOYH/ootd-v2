// useMyProfile — fetch the signed-in user's profile + per-tab counts.
//
// All reads go straight via the supabase client. RLS scopes everything to
// the caller, so there's no IDOR risk and the data lands in a single round
// of parallel queries.
//
// Why direct supabase rather than a /me api route:
//   - This PR doesn't write profile fields (PATCH /me lands in a follow-up
//     once the edit-settings flow needs validation logic).
//   - The /me handler would be a thin pass-through anyway: read public.users
//     + count selfies / items / ootds / friendships. RLS handles all of it.
//   - When PATCH /me arrives, the GET path can move to the api at the same
//     time — no orphaned client logic to migrate.

import { useCallback, useEffect, useState } from 'react';
import type { Tables } from '@mei/types';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';

// Mirrors the public.climate_profile enum (see entities.zClimateProfile).
type ClimateProfile = 'TROPICAL' | 'TEMPERATE' | 'ARID' | 'COLD';

export interface MyProfile {
  userId: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  gender?: string;
  birthYear?: number;
  city?: string;
  countryCode?: string;
  climateProfile?: ClimateProfile;
  stylePreferences: string[];
  discoverable: boolean;
  contributesToCommunityLooks: boolean;
  /** Initials for the avatar fallback. Always 1–2 alpha chars. */
  initials: string;
  counts: {
    selfies: number;
    items: number;
    ootds: number;
    friends: number;
  };
}

export type UseMyProfileState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: MyProfile; refetching: boolean }
  | { status: 'error'; error: Error; lastData?: MyProfile };

export interface UseMyProfileResult {
  state: UseMyProfileState;
  refetch: () => Promise<void>;
}

function deriveInitials(displayName: string, username: string): string {
  const cleaned = displayName.trim().replace(/[^a-zA-Z\s]/g, '');
  if (cleaned.length > 0) {
    const parts = cleaned.split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const second = parts[1]?.[0] ?? '';
    if (first && second) return (first + second).toUpperCase();
    if (first) return first.toUpperCase();
  }
  return (username[0] ?? '?').toUpperCase();
}

type ProfileRow = Tables<'users'>;

export function useMyProfile(): UseMyProfileResult {
  const { session, loading: sessionLoading } = useSession();
  const [state, setState] = useState<UseMyProfileState>({ status: 'idle' });

  const load = useCallback(
    async (signal: AbortSignal, isRefetch: boolean) => {
      if (!session) return;
      setState((prev) => {
        if (isRefetch && prev.status === 'success') return { ...prev, refetching: true };
        return { status: 'loading' };
      });
      try {
        const userId = session.user.id;
        const email = session.user.email ?? '';

        // Five parallel reads — profile row + four counts. RLS scopes all of
        // them to the caller (selfies/closet_items/ootd_posts are owner-only;
        // friendships matches both user_a and user_b membership).
        const [profileRes, selfiesRes, itemsRes, ootdsRes, friendshipsRes] =
          await Promise.all([
            supabase
              .from('users')
              .select(
                'user_id, username, display_name, avatar_url, gender, birth_year, city, country_code, climate_profile, style_preferences, discoverable, contributes_to_community_looks',
              )
              .eq('user_id', userId)
              .maybeSingle(),
            supabase
              .from('selfies')
              .select('selfie_id', { count: 'exact', head: true })
              .eq('user_id', userId),
            supabase
              .from('closet_items')
              .select('item_id', { count: 'exact', head: true })
              .eq('user_id', userId),
            supabase
              .from('ootd_posts')
              .select('ootd_id', { count: 'exact', head: true })
              .eq('user_id', userId),
            // Friendships: canonical (user_a, user_b) ordering. The caller
            // appears on either side, so we OR-match across both columns.
            // RLS already restricts to memberships the caller can see.
            supabase
              .from('friendships')
              .select('user_a', { count: 'exact', head: true })
              .or(`user_a.eq.${userId},user_b.eq.${userId}`),
          ]);

        if (signal.aborted) return;

        if (profileRes.error) throw new Error(profileRes.error.message);
        if (!profileRes.data) {
          // Auth-trigger should always seed the public.users row on signup,
          // but if it didn't fire (or the row was hand-deleted) we surface
          // a clear error instead of mis-rendering with empty fields.
          throw new Error('Profile row missing — re-sign-in or contact support');
        }

        const row = profileRes.data as ProfileRow;
        const profile: MyProfile = {
          userId: row.user_id,
          username: row.username,
          displayName: row.display_name,
          email,
          stylePreferences: row.style_preferences ?? [],
          discoverable: row.discoverable,
          contributesToCommunityLooks: row.contributes_to_community_looks,
          initials: deriveInitials(row.display_name, row.username),
          counts: {
            selfies: selfiesRes.count ?? 0,
            items: itemsRes.count ?? 0,
            ootds: ootdsRes.count ?? 0,
            friends: friendshipsRes.count ?? 0,
          },
        };
        if (row.avatar_url) profile.avatarUrl = row.avatar_url;
        if (row.gender) profile.gender = row.gender;
        if (row.birth_year != null) profile.birthYear = row.birth_year;
        if (row.city) profile.city = row.city;
        if (row.country_code) profile.countryCode = row.country_code;
        if (row.climate_profile) profile.climateProfile = row.climate_profile as ClimateProfile;

        setState({ status: 'success', data: profile, refetching: false });
      } catch (err) {
        if (signal.aborted) return;
        const e = err instanceof Error ? err : new Error('Unknown error');
        setState((prev) =>
          prev.status === 'success'
            ? { status: 'error', error: e, lastData: prev.data }
            : { status: 'error', error: e },
        );
      }
    },
    [session],
  );

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setState({ status: 'idle' });
      return;
    }
    const ctrl = new AbortController();
    void load(ctrl.signal, false);
    return () => ctrl.abort();
  }, [session, sessionLoading, load]);

  const refetch = useCallback(async () => {
    if (!session) return;
    const ctrl = new AbortController();
    await load(ctrl.signal, true);
  }, [session, load]);

  return { state, refetch };
}
