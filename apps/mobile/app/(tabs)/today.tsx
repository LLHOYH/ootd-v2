import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import type { ClosetItem, Combination } from '@mei/types';
import { Button, Screen, useTheme } from '@mei/ui';

import { Header } from '@/components/today/Header';
import { SetupBanner } from '@/components/today/SetupBanner';
import { SelfieStatusCard } from '@/components/today/SelfieStatusCard';
import { WeatherStrip } from '@/components/today/WeatherStrip';
import { CalendarStrip } from '@/components/today/CalendarStrip';
import { TodaysPickCard } from '@/components/today/TodaysPickCard';
import { TodaysPickEmptyCard } from '@/components/today/TodaysPickEmptyCard';
import {
  ClosetStarterCarousel,
  type SuggestedTodayLook,
} from '@/components/today/ClosetStarterCarousel';
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
import { createCombination } from '@/lib/api/closet';
import { ApiError } from '@/lib/api/client';

const TARGET_PICK_CARDS = 4;
const MAX_PICK_CANDIDATES = 8;

function hasItemPhoto(item: ClosetItem | undefined): boolean {
  return Boolean(item?.thumbnailUrl || item?.tunedPhotoUrl || item?.rawPhotoUrl);
}

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, refetch } = useToday();
  const profile = useProfileSummary();
  // Closet items keyed by id. Used to render real photos in Today's Pick.
  // Loads in parallel with the /today payload; Today waits for this resolver
  // before showing a server pick so the hero never paints as empty slots.
  const itemMap = useClosetItemMap();
  const combinationLikes = useCombinationLikes();
  useWeatherLocationSync(() => {
    void refetch();
  });
  useCalendarEventsSync(() => {
    void refetch();
  });
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // ---- Today's pick carousel ----------------------------------------------
  // The backend still returns one pick. Until the planned recommendation
  // service lands, the client builds a small local deck by asking the existing
  // "another pick" endpoint for more options and preserving each card.
  const [extraPicks, setExtraPicks] = useState<Combination[]>([]);
  const [activePickIndex, setActivePickIndex] = useState(0);
  const [loadingMorePicks, setLoadingMorePicks] = useState(false);
  const [pickDeckExhausted, setPickDeckExhausted] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const [creatingSuggestedLookId, setCreatingSuggestedLookId] = useState<string | null>(null);
  const [suggestedLookError, setSuggestedLookError] = useState<string | null>(null);
  const lastFocusItemRefreshAtRef = useRef(0);
  const lastPhotoRepairKeyRef = useRef('');

  // Today’s date in the device's local timezone. Re-rendered on each open.
  const today = useMemo(() => new Date(), []);
  const closetItems = useMemo(() => {
    if (itemMap.state.status !== 'ready' && itemMap.state.status !== 'error') return [];
    return Array.from(itemMap.state.byId.values());
  }, [itemMap.state]);
  const dataForToday =
    state.status === 'success'
      ? state.data
      : state.status === 'error'
        ? state.lastData
        : undefined;
  const basePick = dataForToday?.todaysPick;
  const serverPickId = basePick?.comboId ?? null;
  const itemMapReady = itemMap.state.status === 'ready' || itemMap.state.status === 'error';
  const pickCandidates = useMemo(() => {
    const byId = new Map<string, Combination>();
    if (basePick) byId.set(basePick.comboId, basePick);
    for (const pick of extraPicks) byId.set(pick.comboId, pick);
    return Array.from(byId.values());
  }, [basePick, extraPicks]);
  const pickCards = useMemo(() => {
    if (!itemMapReady) return [];
    return pickCandidates
      .map((combination) => {
        const items = itemMap.resolve(combination.itemIds);
        return { combination, items };
      })
      .filter(
        ({ combination, items }) =>
          combination.itemIds.length >= 2 && items.some(hasItemPhoto),
      );
  }, [itemMap.resolve, itemMapReady, pickCandidates]);
  const activePick = pickCards[activePickIndex] ?? pickCards[0] ?? null;
  const activePickForRepair = activePick?.combination ?? basePick;
  const activePickItemsForRepair = activePick
    ? activePick.items
    : activePickForRepair
      ? itemMap.resolve(activePickForRepair.itemIds)
      : [];
  const closetItemsLoading =
    itemMap.state.status === 'idle' || itemMap.state.status === 'loading';
  const itemMapReadyForRepair = itemMap.state.status === 'ready';
  const photoRepairKey = itemMapReadyForRepair
    ? [
        activePickForRepair &&
        activePickForRepair.itemIds.length > 0 &&
        activePickItemsForRepair.every((item) => !hasItemPhoto(item))
          ? `pick:${activePickForRepair.itemIds.join(',')}`
          : '',
        closetItems.length > 0 && closetItems.every((item) => !hasItemPhoto(item))
          ? `closet:${closetItems.map((item) => item.itemId).join(',')}`
          : '',
      ]
        .filter(Boolean)
        .join('|')
    : '';

  useEffect(() => {
    setExtraPicks([]);
    setActivePickIndex(0);
    setPickError(null);
    setPickDeckExhausted(false);
  }, [serverPickId]);

  useEffect(() => {
    setActivePickIndex((current) =>
      Math.min(current, Math.max(pickCards.length - 1, 0)),
    );
  }, [pickCards.length]);

  const loadMorePickCards = useCallback(async () => {
    if (!basePick || loadingMorePicks || pickDeckExhausted) return;
    if (pickCandidates.length >= MAX_PICK_CANDIDATES) {
      setPickDeckExhausted(true);
      return;
    }

    setLoadingMorePicks(true);
    setPickError(null);
    try {
      const excludeComboIds = Array.from(
        new Set([basePick.comboId, ...extraPicks.map((pick) => pick.comboId)]),
      );
      const res = await postAnotherPick({ excludeComboIds });
      setExtraPicks((prev) => {
        if (
          res.pick.comboId === basePick.comboId ||
          prev.some((pick) => pick.comboId === res.pick.comboId)
        ) {
          return prev;
        }
        return [...prev, res.pick];
      });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NO_PICK') {
        setPickDeckExhausted(true);
        return;
      }
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not load more looks';
      setPickError(msg);
    } finally {
      setLoadingMorePicks(false);
    }
  }, [
    basePick,
    extraPicks,
    loadingMorePicks,
    pickCandidates.length,
    pickDeckExhausted,
  ]);

  useEffect(() => {
    if (!basePick || !itemMapReady || loadingMorePicks || pickDeckExhausted) return;
    if (pickCards.length >= TARGET_PICK_CARDS) return;
    void loadMorePickCards();
  }, [
    basePick,
    itemMapReady,
    loadMorePickCards,
    loadingMorePicks,
    pickCards.length,
    pickDeckExhausted,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (itemMap.state.status === 'idle' || itemMap.state.status === 'loading') return;
      const now = Date.now();
      if (lastFocusItemRefreshAtRef.current === 0) {
        lastFocusItemRefreshAtRef.current = now;
        return;
      }
      if (now - lastFocusItemRefreshAtRef.current < 10_000) return;
      lastFocusItemRefreshAtRef.current = now;
      void itemMap.refetch();
    }, [itemMap.refetch, itemMap.state.status]),
  );

  useEffect(() => {
    if (!photoRepairKey || lastPhotoRepairKeyRef.current === photoRepairKey) return;
    lastPhotoRepairKeyRef.current = photoRepairKey;
    void itemMap.refetch();
  }, [itemMap.refetch, photoRepairKey]);

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
  const data = dataForToday;
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

  const handleToggleSave = async (combination: Combination) => {
    await combinationLikes.toggleLike(combination.comboId);
  };

  const handleWear = (combination: Combination) => {
    // SPEC §10.10 split (PR C.2): "Wear this on me" goes to the try-on
    // preview, NOT directly to the share modal. From the preview the
    // user can opt in to share — the share form is no longer the only
    // path. We pass the serialized combination through the route so the
    // preview can render the combo name without a round-trip.
    router.push({
      pathname: '/tryon',
      params: {
        comboId: combination.comboId,
        comboJson: JSON.stringify(combination),
      },
    } as never);
  };

  const handleWearSuggestedLook = async (look: SuggestedTodayLook) => {
    if (creatingSuggestedLookId) return;
    setCreatingSuggestedLookId(look.id);
    setSuggestedLookError(null);
    try {
      const combo = await createCombination({
        name: look.name,
        itemIds: look.items.map((item) => item.itemId),
        source: 'TODAY_PICK',
      });
      setExtraPicks((prev) =>
        prev.some((pick) => pick.comboId === combo.comboId) ? prev : [...prev, combo],
      );
      router.push({
        pathname: '/tryon',
        params: {
          comboId: combo.comboId,
          comboJson: JSON.stringify(combo),
        },
      } as never);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Could not prepare this look';
      setSuggestedLookError(msg);
    } finally {
      setCreatingSuggestedLookId(null);
    }
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

        {pickCards.length > 0 ? (
          <TodaysPickCard
            picks={pickCards.map((pick) => ({
              ...pick,
              saved: combinationLikes.likedComboIds.has(pick.combination.comboId),
            }))}
            activeIndex={activePickIndex}
            loadingMore={loadingMorePicks}
            errorMessage={pickError ?? combinationLikes.error?.message ?? null}
            onActiveIndexChange={setActivePickIndex}
            onLoadMore={() => void loadMorePickCards()}
            onWear={handleWear}
            onSave={(combination) => void handleToggleSave(combination)}
          />
        ) : closetItems.length > 0 ? (
          <ClosetStarterCarousel
            items={closetItems}
            selfieCount={selfieCount}
            creatingLookId={creatingSuggestedLookId}
            errorMessage={suggestedLookError}
            onAddClothes={() => router.navigate('/closet' as never)}
            onWearSuggestedLook={(look) => void handleWearSuggestedLook(look)}
            onViewSelfies={() => router.push('/selfies')}
          />
        ) : (
          <TodaysPickEmptyCard
            selfieCount={selfieCount}
            checkingCloset={closetItemsLoading}
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
