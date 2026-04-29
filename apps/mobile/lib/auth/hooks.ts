// Convenience hooks around `supabase.auth.*`.
//
// Thin wrappers — they only exist so screens can `useSignInWithEmail()`
// without re-importing the supabase client every time, and so a future
// onboarding branch can swap in toast/error UI in one place. They keep
// the supabase result shape (`{ data, error }`) so callers see the same
// types they'd get from the SDK.

import { useCallback, useState } from 'react';
import type { AuthResponse, AuthTokenResponsePassword } from '@supabase/supabase-js';
import { supabase } from '../supabase';

interface SignInArgs {
  email: string;
  password: string;
}

interface SignUpArgs extends SignInArgs {
  /** Stored on the auth user; the trigger seeds public.users.display_name from it. */
  displayName?: string;
}

export function useSignInWithEmail() {
  const [loading, setLoading] = useState(false);

  const signIn = useCallback(
    async ({ email, password }: SignInArgs): Promise<AuthTokenResponsePassword> => {
      setLoading(true);
      try {
        return await supabase.auth.signInWithPassword({ email, password });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { signIn, loading };
}

export function useSignUpWithEmail() {
  const [loading, setLoading] = useState(false);

  const signUp = useCallback(
    async ({ email, password, displayName }: SignUpArgs): Promise<AuthResponse> => {
      setLoading(true);
      try {
        return await supabase.auth.signUp({
          email,
          password,
          options: {
            data: displayName ? { display_name: displayName } : undefined,
          },
        });
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { signUp, loading };
}

export function useSignOut() {
  const [loading, setLoading] = useState(false);

  const signOut = useCallback(async () => {
    setLoading(true);
    try {
      return await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  }, []);

  return { signOut, loading };
}
