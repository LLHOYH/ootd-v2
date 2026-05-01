import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, useTheme } from '@mei/ui';

import { Header } from '@/components/today/Header';
import { SetupBanner } from '@/components/today/SetupBanner';
import { WeatherStrip } from '@/components/today/WeatherStrip';
import { CalendarStrip } from '@/components/today/CalendarStrip';
import { TodaysPickCard } from '@/components/today/TodaysPickCard';
import { CommunityStrip } from '@/components/today/CommunityStrip';
import { FashionNowStrip } from '@/components/today/FashionNowStrip';
import {
  adaptCommunityLook,
  adaptEvent,
  adaptFashionNow,
  adaptWeather,
} from '@/components/today/adapters';

import { useToday } from '@/lib/hooks/useToday';
import { useProfileSummary } from '@/lib/hooks/useProfileSummary';

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, refetch } = useToday();
  const profile = useProfileSummary();
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Today’s date in the device's local timezone. Re-rendered on each open.
  const today = useMemo(() => new Date(), []);

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
            Couldn’t load today
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
  const data = state.status === 'success' ? state.data : state.lastData;
  if (!data) {
    // Type-narrowing safety; should be unreachable given the branches above.
    return null;
  }

  const firstName = profile?.firstName ?? '';
  const city = data.weather?.city ?? '';
  const selfieCount = profile?.selfieCount ?? 0;
  const showSetupBanner = selfieCount < 5 && !bannerDismissed;

  const events = data.events.map(adaptEvent);
  const looks = data.communityLooks.map(adaptCommunityLook);
  const fashion = data.fashionNow.map(adaptFashionNow);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.space.md,
          paddingBottom: theme.space.xxxl,
        }}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'success' && state.refetching}
            onRefresh={() => void refetch()}
            tintColor={theme.color.brand}
          />
        }
      >
        <Header firstName={firstName} date={today} unread />

        {showSetupBanner ? (
          <SetupBanner onDismiss={() => setBannerDismissed(true)} />
        ) : null}

        {data.weather ? <WeatherStrip weather={adaptWeather(data.weather)} /> : null}

        <CalendarStrip events={events} />

        {data.todaysPick ? (
          <TodaysPickCard
            combination={data.todaysPick}
            onTryAnother={() => router.push('/chats/stella')}
            onWear={() =>
              router.push({
                pathname: '/share',
                params: { comboId: data.todaysPick!.comboId },
              } as never)
            }
          />
        ) : null}

        <CommunityStrip
          looks={looks}
          subtitle={city ? `${city} · 25–30 · today` : '25–30 · today'}
        />

        <FashionNowStrip items={fashion} />
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
