import { useState } from 'react';
import { View } from 'react-native';
import { Screen, useTheme } from '@mei/ui';

import { Header } from '@/components/today/Header';
import { SetupBanner } from '@/components/today/SetupBanner';
import { WeatherStrip } from '@/components/today/WeatherStrip';
import { CalendarStrip } from '@/components/today/CalendarStrip';
import { TodaysPickCard } from '@/components/today/TodaysPickCard';
import { CommunityStrip } from '@/components/today/CommunityStrip';
import { FashionNowStrip } from '@/components/today/FashionNowStrip';
import {
  mockUser,
  mockWeather,
  mockToday,
  mockEvents,
  mockTodaysPick,
  mockCommunityLooks,
  mockFashionNow,
} from '@/components/today/mocks';

export default function TodayScreen() {
  const theme = useTheme();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Setup banner shows only when fewer than 5 selfies AND user hasn't dismissed.
  // SPEC §10.1.2.
  const showSetupBanner = mockUser.selfieCount < 5 && !bannerDismissed;

  return (
    <Screen scroll>
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.xxxl }}>
        <Header firstName={mockUser.firstName} date={mockToday} unread />

        {showSetupBanner ? (
          <SetupBanner onDismiss={() => setBannerDismissed(true)} />
        ) : null}

        <WeatherStrip weather={mockWeather} />

        <CalendarStrip events={mockEvents} />

        <TodaysPickCard combination={mockTodaysPick} />

        <CommunityStrip
          looks={mockCommunityLooks}
          subtitle={`${mockUser.city} · 25–30 · today`}
        />

        <FashionNowStrip items={mockFashionNow} />
      </View>
    </Screen>
  );
}
