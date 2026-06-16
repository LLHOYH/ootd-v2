import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, useTheme } from '@mei/ui';
import { Header } from '@/components/you/Header';
import { ProfileBlock } from '@/components/you/ProfileBlock';
import { SettingsList } from '@/components/you/SettingsList';
import { EditProfileModal } from '@/components/you/EditProfileModal';
import { useMyProfile, type ProfileUpdateInput } from '@/lib/hooks/useMyProfile';

/**
 * You / profile — SPEC §10.11.
 * Profile fields are editable through a focused modal. Secondary account
 * flows route only where the target flow is already wired.
 */
export default function YouScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, refetch, updateProfile } = useMyProfile();
  const [editing, setEditing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  const handleSaveProfile = async (input: ProfileUpdateInput) => {
    if (savingProfile) return;
    setSavingProfile(true);
    setEditError(null);
    try {
      await updateProfile(input);
      setEditing(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.space.huge }}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'success' && state.refetching}
            onRefresh={() => void refetch()}
            tintColor={theme.color.brand}
          />
        }
      >
        <Header
          onSettingsPress={() => {
            setEditError(null);
            setEditing(true);
          }}
        />
        <ProfileBlock profile={profile} />
        <SettingsList
          profile={profile}
          onEditProfilePress={() => {
            setEditError(null);
            setEditing(true);
          }}
          onSelfiesPress={() => router.push('/selfies')}
        />
      </ScrollView>
      <EditProfileModal
        visible={editing}
        profile={profile}
        saving={savingProfile}
        errorMessage={editError}
        onClose={() => {
          if (savingProfile) return;
          setEditing(false);
        }}
        onSave={handleSaveProfile}
      />
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
