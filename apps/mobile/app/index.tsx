// Entry point — the gate that decides where to send the caller.
//
// Three possible states:
//   - session loading  → show a spinner so we don't flash the auth flow
//                        on warm starts where the MMKV-cached session is
//                        about to hydrate.
//   - signed in        → redirect to /today (the daily-loop landing).
//   - signed out       → redirect to /(auth)/sign-in.
//
// All session changes flow through SessionProvider's onAuthStateChange
// listener, so signing in / signing out unmounts the unrelated stack and
// re-runs this gate.

import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTheme } from '@mei/ui';
import { useSession } from '@/lib/auth/SessionProvider';

export default function Index() {
  const theme = useTheme();
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.color.bg.primary,
        }}
      >
        <ActivityIndicator color={theme.color.brand} />
      </View>
    );
  }

  if (session) {
    return <Redirect href="/today" />;
  }
  // The (auth) group route isn't in the generated typed-routes union
  // until expo-router regenerates types post-startup. Cast through never
  // to keep typecheck happy without bypassing strict mode globally.
  return <Redirect href={'/(auth)/sign-in' as never} />;
}
