import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, useTheme } from '@mei/ui';
import { Header } from '@/components/you/Header';
import { ProfileBlock } from '@/components/you/ProfileBlock';
import { StatsRow } from '@/components/you/StatsRow';
import { SettingsList } from '@/components/you/SettingsList';
import { useMyProfile } from '@/lib/hooks/useMyProfile';
import { supabase } from '@/lib/supabase';

/**
 * You / profile — SPEC §10.11.
 * Read-only against the live profile. Settings rows are still decorative
 * placeholders (no PATCH wiring yet — lands when feat/wire-you-edit picks
 * up the editable settings flow).
 */
export default function YouScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, refetch } = useMyProfile();

  // ---- Loading: first paint, no data yet ------------------------------------
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <Screen>
        <View style={[styles.center, { padding: theme.space.xxxl }]}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      </Screen>
    );
  }

  // ---- Hard error, no cached data to show -----------------------------------
  if (state.status === 'error' && !state.lastData) {
    return (
      <Screen>
        <View style={[styles.center, { padding: theme.space.xxxl, gap: theme.space.md }]}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
              textAlign: 'center',
            }}
          >
            Couldn’t load profile
          </Text>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              textAlign: 'center',
            }}
            numberOfLines={2}
          >
            {state.error.message}
          </Text>
          <Button variant="primary" onPress={() => void refetch()}>
            Try again
          </Button>
        </View>
      </Screen>
    );
  }

  // ---- Success path (or stale-with-error) -----------------------------------
  const profile = state.status === 'success' ? state.data : state.lastData;
  if (!profile) return null; // type-narrowing safety

  return (
    <Screen>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'success' && state.refetching}
            onRefresh={() => void refetch()}
            tintColor={theme.color.brand}
          />
        }
      >
        <Header onSettingsPress={() => {}} />
        <ProfileBlock profile={profile} />
        <StatsRow profile={profile} />
        <SettingsList
          profile={profile}
          onAddFriendsPress={() => router.push('/friends/add')}
          onSelfiesPress={() => router.push('/selfies')}
          onSignOutPress={() => {
            // Don't await — fire-and-forget; SessionProvider's
            // onAuthStateChange listener fires, the gate in
            // app/index.tsx redirects to /(auth)/sign-in, this screen
            // unmounts. Errors here are extremely rare (network-only)
            // and a stale local session resolves on next app launch.
            void supabase.auth.signOut();
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
