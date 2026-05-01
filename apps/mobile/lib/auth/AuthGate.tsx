// AuthGate — top-level redirect on session changes.
//
// Wraps the route stack and reacts to two transitions:
//
//   - Signed in → currently inside (auth)        → push to /today.
//     (e.g. user just submitted sign-in / sign-up.)
//
//   - Signed out → currently outside (auth)      → push to /(auth)/sign-in.
//     (e.g. user tapped Sign out, or token expired and the SDK cleared
//     the session.)
//
// On cold start, app/index.tsx is the canonical entry and handles the
// initial redirect — this gate just keeps things in sync as the session
// flips while the app is running.

import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { useSession } from './SessionProvider';

interface AuthGateProps {
  children: React.ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // segments() is typed against the *current* typed-routes union which
    // doesn't include `(auth)` until expo-router regenerates types
    // post-startup. Compare via a string cast — the runtime value is
    // exactly what the file system says, "(auth)" included.
    const first = segments[0] as string | undefined;
    const inAuthGroup = first === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in' as never);
      return;
    }
    if (session && inAuthGroup) {
      router.replace('/today');
    }
  }, [session, loading, segments, router]);

  return <>{children}</>;
}
