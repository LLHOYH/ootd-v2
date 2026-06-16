import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { Button, Card, Screen, useTheme } from '@mei/ui';
import type { FriendRequestWithUser } from '@mei/types';

import { FriendRow } from '@/components/friends/FriendRow';
import { OotdPostCard } from '@/components/ootd/OotdPostCard';
import { useFriendsHub } from '@/lib/hooks/useFriendsHub';
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
  const friendHub = useFriendsHub();

  const friendsData =
    friendHub.state.status === 'success'
      ? friendHub.state.data
      : friendHub.state.status === 'error'
        ? friendHub.state.lastData
        : undefined;
  const inboundRequests = friendsData?.inbound ?? [];

  const openPendingRequests = () => {
    router.push({
      pathname: '/friends/add',
      params: { tab: 'pending' },
    } as never);
  };

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

        {inboundRequests.length > 0 ? (
          <IncomingRequestsCard
            requests={inboundRequests}
            isPending={friendHub.isPending}
            onAccept={(fromUserId) => {
              void friendHub.acceptRequest(fromUserId).then(() => refetch());
            }}
            onViewAll={openPendingRequests}
          />
        ) : null}

        {items.length === 0 ? (
          <View style={[styles.center, { paddingTop: theme.space.xxxl, gap: theme.space.md }]}>
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
            <Button
              variant="primary"
              icon={UserPlus}
              onPress={() => router.push('/friends/add' as never)}
            >
              Find friends
            </Button>
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

interface IncomingRequestsCardProps {
  requests: FriendRequestWithUser[];
  isPending: (userId: string) => boolean;
  onAccept: (fromUserId: string) => void;
  onViewAll: () => void;
}

function IncomingRequestsCard({
  requests,
  isPending,
  onAccept,
  onViewAll,
}: IncomingRequestsCardProps) {
  const theme = useTheme();
  const visible = requests.slice(0, 2);
  const extraCount = Math.max(0, requests.length - visible.length);

  return (
    <Card tone="accent" padding={theme.space.md}>
      <View style={[styles.requestHeader, { gap: theme.space.md }]}>
        <View style={styles.requestTitleBlock}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.h2,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            Friend requests
          </Text>
          <Text
            style={{
              color: theme.color.text.secondary,
              fontSize: theme.type.size.caption,
              fontWeight: theme.type.weight.regular as '400',
              marginTop: 2,
            }}
          >
            {requests.length === 1 ? '1 incoming request' : `${requests.length} incoming requests`}
          </Text>
        </View>
        <Button variant="ghost" onPress={onViewAll}>
          View all
        </Button>
      </View>

      <View style={{ marginTop: theme.space.sm }}>
        {visible.map((request) => (
          <FriendRow
            key={request.fromUserId}
            user={request.user}
            subtitle={`@${request.user.username}`}
            trailing={
              <Button
                variant="primary"
                onPress={() => onAccept(request.fromUserId)}
                disabled={isPending(request.fromUserId)}
              >
                Accept
              </Button>
            }
          />
        ))}
      </View>

      {extraCount > 0 ? (
        <Text
          style={{
            color: theme.color.text.secondary,
            fontSize: theme.type.size.caption,
            fontWeight: theme.type.weight.regular as '400',
            marginTop: theme.space.xs,
          }}
        >
          {extraCount} more pending
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
});
