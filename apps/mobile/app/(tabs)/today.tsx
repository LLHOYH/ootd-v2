import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Combination } from '@mei/types';
import { Button, Screen, useTheme } from '@mei/ui';

import { Header } from '@/components/today/Header';
import { SetupBanner } from '@/components/today/SetupBanner';
import { SelfieStatusCard } from '@/components/today/SelfieStatusCard';
import { WeatherStrip } from '@/components/today/WeatherStrip';
import { CalendarStrip } from '@/components/today/CalendarStrip';
import { TodaysPickCard } from '@/components/today/TodaysPickCard';
import { TodaysPickEmptyCard } from '@/components/today/TodaysPickEmptyCard';
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
import { useClosetItemMap } from '@/lib/hooks/useClosetItemMap';
import { useCombinationLikes } from '@/lib/hooks/useCombinationLikes';
import { useCalendarEventsSync } from '@/lib/hooks/useCalendarEventsSync';
import { useWeatherLocationSync } from '@/lib/hooks/useWeatherLocationSync';
import { postAnotherPick } from '@/lib/api/today';
import { ApiError } from '@/lib/api/client';

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, refetch } = useToday();
  const profile = useProfileSummary();
  // Closet items keyed by id. Used to render real photos in Today's Pick.
  // Loads in parallel with the /today payload — if it's slow the card
  // gracefully falls back to pastel placeholders.
  const itemMap = useClosetItemMap();
  const combinationLikes = useCombinationLikes();
  useWeatherLocationSync(() => {
    void refetch();
  });
  useCalendarEventsSync(() => {
    void refetch();
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // ---- Today's pick: local overrides --------------------------------------
  // The /today payload gives us the server's recommended pick. The user can
  // either re-roll it ("Try another") — handled by POST /today/another-pick —
  // or like it via /me/likes. The override lets the UI swap without a full
  // /today refetch and lets us pass the *current* pick (not the initial one)
  // into the try-on modal.
  const [overridePick, setOverridePick] = useState<Combination | null>(null);
  const [seenComboIds, setSeenComboIds] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

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
  const showSelfieStatus = selfieCount >= 5;

  const events = data.events.map(adaptEvent);
  const looks = data.communityLooks.map(adaptCommunityLook);
  const fashion = data.fashionNow.map(adaptFashionNow);

  // Effective pick = local override (from "Try another") if any, else server.
  const currentPick = overridePick ?? data.todaysPick;
  const isSaved = currentPick
    ? combinationLikes.likedComboIds.has(currentPick.comboId)
    : false;

  const handleTryAnother = async () => {
    if (picking) return;
    setPicking(true);
    setPickError(null);
    try {
      // Exclude both the current pick and anything we've already shown so
      // the server doesn't hand back the same combo twice in a row.
      const exclude = Array.from(
        new Set(
          [
            ...seenComboIds,
            currentPick?.comboId,
            data.todaysPick?.comboId,
          ].filter((x): x is string => Boolean(x)),
        ),
      );
      const res = await postAnotherPick(
        exclude.length > 0 ? { excludeComboIds: exclude } : undefined,
      );
      setOverridePick(res.pick);
      setSeenComboIds((prev) => {
        const next = new Set(prev);
        next.add(res.pick.comboId);
        return Array.from(next);
      });
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load another look';
      setPickError(msg);
    } finally {
      setPicking(false);
    }
  };

  const handleToggleSave = async () => {
    if (!currentPick) return;
    await combinationLikes.toggleLike(currentPick.comboId);
  };

  const handleWear = () => {
    if (!currentPick) return;
    // SPEC §10.10 split (PR C.2): "Wear this on me" goes to the try-on
    // preview, NOT directly to the share modal. From the preview the
    // user can opt in to share — the share form is no longer the only
    // path. We pass the serialized combination through the route so the
    // preview can render the combo name without a round-trip.
    router.push({
      pathname: '/tryon',
      params: {
        comboId: currentPick.comboId,
        comboJson: JSON.stringify(currentPick),
      },
    } as never);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          gap: theme.space.lg,
          paddingBottom: theme.space.huge,
        }}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'success' && state.refetching}
            onRefresh={() => void refetch()}
            tintColor={theme.color.brand}
          />
        }
      >
        <Header
          firstName={firstName}
          date={today}
          unread
          onBellPress={() => {
            router.push({
              pathname: '/friends/add',
              params: { tab: 'pending' },
            } as never);
          }}
        />

        {showSetupBanner ? (
          <SetupBanner
            onPress={() => router.push('/selfies')}
            onDismiss={() => setBannerDismissed(true)}
          />
        ) : showSelfieStatus ? (
          <SelfieStatusCard
            selfieCount={selfieCount}
            onPress={() => router.push('/selfies')}
          />
        ) : null}

        {data.weather ? <WeatherStrip weather={adaptWeather(data.weather)} /> : null}

        <CalendarStrip events={events} />

        {currentPick ? (
          <TodaysPickCard
            combination={currentPick}
            items={itemMap.resolve(currentPick.itemIds)}
            saved={isSaved}
            picking={picking}
            errorMessage={pickError ?? combinationLikes.error?.message ?? null}
            onTryAnother={() => void handleTryAnother()}
            onWear={handleWear}
            onSave={() => void handleToggleSave()}
          />
        ) : (
          <TodaysPickEmptyCard
            selfieCount={selfieCount}
            onAddClothes={() => router.navigate('/closet' as never)}
            onViewSelfies={() => router.push('/selfies')}
          />
        )}

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
