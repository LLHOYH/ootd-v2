// React context for the Supabase auth session.
//
// One subscription to `onAuthStateChange` lives at the root and pushes
// updates into context, so feature screens just call `useSession()` /
// `useUser()` instead of each holding their own subscription. The
// `loading` flag is true on first mount until `getSession()` settles,
// which lets gates (e.g. an onboarding redirect) avoid flashing the
// signed-out UI for a frame on warm starts.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabase';

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

interface SessionProviderProps {
  children: ReactNode;
}

export function SessionProvider({ children }: SessionProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Hydrate from storage first so we don't flicker.
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, next) => {
        if (!mounted) return;
        setSession(next);
        setLoading(false);
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

function useSessionContext(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used inside <SessionProvider>');
  }
  return ctx;
}

/** Full session object, or `null` if signed out. Includes `loading`. */
export function useSession(): SessionContextValue {
  return useSessionContext();
}

/** Convenience accessor for just the user. `null` when signed out. */
export function useUser(): User | null {
  return useSessionContext().user;
}
