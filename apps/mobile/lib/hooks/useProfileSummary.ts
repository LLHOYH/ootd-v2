// useProfileSummary — small reads the Today screen needs that aren't in the
// /today aggregate: the user's display name (greeting) and selfie count
// (setup-banner gate).
//
// Both go straight via the supabase client (RLS scopes to the caller).
// We could fold these into /today server-side later, but keeping them on
// the client for now avoids bloating that contract.

import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../supabase';
import { useSession } from '../auth/SessionProvider';

export interface ProfileSummary {
  /** First name for the header greeting. Falls back through metadata → email. */
  firstName: string;
  /** Number of selfies the caller owns. Used to gate the setup banner. */
  selfieCount: number;
}

function deriveFirstName(opts: {
  metaDisplayName?: string;
  rowDisplayName?: string;
  email?: string;
}): string {
  const candidate = opts.rowDisplayName ?? opts.metaDisplayName ?? opts.email ?? 'there';
  // Take the first whitespace-separated token. Email local-part already lacks
  // whitespace so this collapses cleanly.
  const first = candidate.split(/\s+/)[0] ?? candidate;
  // Strip the email domain if present.
  return first.split('@')[0] ?? first;
}

export function useProfileSummary(): ProfileSummary | null {
  const { session } = useSession();
  const [summary, setSummary] = useState<ProfileSummary | null>(null);

  const load = useCallback(async () => {
    if (!session) {
      setSummary(null);
      return;
    }
    const userId = session.user.id;
    try {
      const [profile, selfies] = await Promise.all([
        supabase
          .from('users')
          .select('display_name')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('selfies')
          .select('selfie_id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);
      const firstName = deriveFirstName({
        metaDisplayName:
          (session.user.user_metadata?.display_name as string | undefined) ?? undefined,
        rowDisplayName: profile.data?.display_name ?? undefined,
        email: session.user.email ?? undefined,
      });
      setSummary({
        firstName,
        selfieCount: selfies.count ?? 0,
      });
    } catch {
      // Soft-fail — the screen still renders with a generic greeting.
      setSummary({
        firstName: deriveFirstName({
          metaDisplayName:
            (session.user.user_metadata?.display_name as string | undefined) ?? undefined,
          email: session.user.email ?? undefined,
        }),
        selfieCount: 0,
      });
    }
  }, [session]);

  // Initial fetch + refetch whenever the session changes.
  useEffect(() => {
    void load();
  }, [load]);

  // Re-pull on screen focus so returning from /selfies (after adding or
  // removing photos) immediately updates the setup banner's gate, instead
  // of waiting for the next app-cold-start.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return summary;
}
