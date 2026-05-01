import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Screen, useTheme } from '@mei/ui';

import { OotdPostCard } from '@/components/ootd/OotdPostCard';
import { useOotdFeed } from '@/lib/hooks/useOotdFeed';

/**
 * Friends tab — SPEC §10.8.
 *
 * The OOTD feed lives here. Visibility is enforced by RLS server-side, so
 * we just paginate and render. Hangouts strip + Plan-a-hangout hero card
 * are out of scope for this PR (land with feat/wire-hangouts).
 *
 * Reactions are optimistic — the heart flips immediately, rolls back on
 * error. Tapping Coordinate routes to the pinned Stella thread; a deeper
 * deep-link (with the friend's ootdId pre-filled in the prompt) lands in
 * feat/wire-stella-tools.
 */
export default function FriendsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { state, refetch, toggleReaction } = useOotdFeed();

  // ---- Loading: first paint -------------------------------------------------
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <Screen>
        <View style={[styles.center, { padding: theme.space.xxxl }]}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      </Screen>
    );
  }

  // ---- Hard error -----------------------------------------------------------
  if (state.status === 'error' && !state.lastItems) {
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
            Couldn’t load the feed
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

  const items = state.status === 'success' ? state.items : state.lastItems;
  if (!items) return null;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingBottom: theme.space.xxxl,
          gap: theme.space.md,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={state.status === 'success' && state.refetching}
            onRefresh={() => void refetch()}
            tintColor={theme.color.brand}
          />
        }
      >
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.h1,
            fontWeight: theme.type.weight.medium as '500',
          }}
        >
          Friends
        </Text>

        {items.length === 0 ? (
          <View style={[styles.center, { paddingTop: theme.space.xxxl }]}>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
                textAlign: 'center',
              }}
            >
              No outfits to show yet. {'\n'}When friends post, they’ll appear here.
            </Text>
          </View>
        ) : (
          items.map((it) => (
            <OotdPostCard
              key={it.post.ootdId}
              item={it}
              onToggleReaction={() => void toggleReaction(it.post.ootdId)}
              onCoordinate={() => router.push('/chats/stella')}
            />
          ))
        )}
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
