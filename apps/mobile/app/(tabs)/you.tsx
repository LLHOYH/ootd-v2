import { useRouter } from 'expo-router';
import { Screen } from '@mei/ui';
import { Header } from '@/components/you/Header';
import { ProfileBlock } from '@/components/you/ProfileBlock';
import { StatsRow } from '@/components/you/StatsRow';
import { SettingsList } from '@/components/you/SettingsList';
import { mockProfile } from '@/components/you/mocks';

/**
 * You / profile — SPEC §10.11.
 * Visual-only with mock data. No PATCH /me wiring; settings rows are decorative.
 */
export default function YouScreen() {
  const router = useRouter();

  return (
    <Screen scroll>
      <Header onSettingsPress={() => {}} />
      <ProfileBlock profile={mockProfile} />
      <StatsRow profile={mockProfile} />
      <SettingsList
        profile={mockProfile}
        onAddFriendsPress={() => router.push('/friends/add')}
        onSelfiesPress={() => router.push('/selfies')}
      />
    </Screen>
  );
}
