import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Combination } from '@mei/types';
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
import { useClosetItemMap } from '@/lib/hooks/useClosetItemMap';
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
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // ---- Today's pick: local overrides --------------------------------------
  // The /today payload gives us the server's recommended pick. The user can
  // either re-roll it ("Try another") — handled by POST /today/another-pick —
  // or like it locally. We track those bits here so the UI can swap without
  // a full /today refetch and so we can pass the *current* pick (not the
  // initial one) into the share modal.
  const [overridePick, setOverridePick] = useState<Combination | null>(null);
  const [seenComboIds, setSeenComboIds] = useState<string[]>([]);
  const [savedComboIds, setSavedComboIds] = useState<Set<string>>(() => new Set());
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

  const events = data.events.map(adaptEvent);
  const looks = data.communityLooks.map(adaptCommunityLook);
  const fashion = data.fashionNow.map(adaptFashionNow);

  // Effective pick = local override (from "Try another") if any, else server.
  const currentPick = overridePick ?? data.todaysPick;
  const isSaved = currentPick ? savedComboIds.has(currentPick.comboId) : false;

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

  const handleToggleSave = () => {
    if (!currentPick) return;
    setSavedComboIds((prev) => {
      const next = new Set(prev);
      if (next.has(currentPick.comboId)) {
        next.delete(currentPick.comboId);
      } else {
        next.add(currentPick.comboId);
      }
      return next;
    });
  };

  const handleWear = () => {
    if (!currentPick) return;
    // Pass the combination through the route so the Wear-this modal doesn't
    // need to round-trip /closet/combinations to look it up — that fetch was
    // hanging silently when the network was flaky and showed as an infinite
    // loading spinner. The screen still falls back to a list lookup if the
    // serialized payload is missing or malformed.
    router.push({
      pathname: '/share',
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
          <SetupBanner
            onPress={() => router.push('/selfies')}
            onDismiss={() => setBannerDismissed(true)}
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
            errorMessage={pickError}
            onTryAnother={() => void handleTryAnother()}
            onWear={handleWear}
            onSave={handleToggleSave}
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
