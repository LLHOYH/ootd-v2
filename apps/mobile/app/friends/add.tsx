// Add Friends screen — SPEC §10.12.
//
// Three lanes for managing friends, mapped to nine of the twelve /friends
// endpoints (contactsMatch, getPublicProfile, listUserOotds remain for
// follow-up PRs that depend on phone hashing / OOTD wiring).
//
//   Search input (always visible)
//     → debounced GET /friends/search; results take over the body when a
//       query is active.
//   Tabs:
//     1. Friends   — GET /friends. Each row has Unfriend.
//     2. Suggested — GET /friends/suggested. Each row has Add.
//     3. Pending   — GET /friends/requests. Inbound rows have Accept +
//                    Decline; outbound rows have Cancel.

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeft, Search, X } from 'lucide-react-native';
import { Button, Screen, useTheme } from '@mei/ui';

import { FriendRow } from '@/components/friends/FriendRow';
import { TabBar } from '@/components/friends/TabBar';
import { useFriendsHub } from '@/lib/hooks/useFriendsHub';
import { useFriendSearch } from '@/lib/hooks/useFriendSearch';

type TabKey = 'friends' | 'suggested' | 'pending';

const SUGGESTION_COPY: Record<string, string> = {
  COMMUNITY_LOOK_INTERACTION: 'Saw their look on Today',
  CONTACT_MATCH: 'From your contacts',
  MUTUAL_FRIEND: 'Mutual friend',
};

export default function AddFriendsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const hub = useFriendsHub();
  const [tab, setTab] = useState<TabKey>('suggested');
  const [query, setQuery] = useState('');
  const search = useFriendSearch(query);

  const data =
    hub.state.status === 'success'
      ? hub.state.data
      : hub.state.status === 'error'
        ? hub.state.lastData
        : undefined;

  const pendingCount = data ? data.inbound.length + data.outbound.length : 0;
  const friendsCount = data ? data.friends.length : 0;

  const tabs = useMemo(
    () => [
      { key: 'friends' as const, label: 'Friends', badge: friendsCount },
      { key: 'suggested' as const, label: 'Suggested' },
      { key: 'pending' as const, label: 'Pending', badge: pendingCount },
    ],
    [friendsCount, pendingCount],
  );

  const trimmedQuery = query.trim();
  const showSearchResults = trimmedQuery.length > 0;

  // ---- Loading: first paint, no data yet ------------------------------------
  const initialLoading = hub.state.status === 'idle' || hub.state.status === 'loading';

  // ---- Hard error, no cached data -------------------------------------------
  if (hub.state.status === 'error' && !hub.state.lastData) {
    return (
      <ScreenWithHeader theme={theme} onBack={() => router.back()} title="Add friends">
        <View style={[styles.center, { padding: theme.space.xxxl, gap: theme.space.md }]}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
              textAlign: 'center',
            }}
          >
            Couldn’t load friends
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
            {hub.state.error.message}
          </Text>
          <Button variant="primary" onPress={() => void hub.refetch()}>
            Try again
          </Button>
        </View>
      </ScreenWithHeader>
    );
  }

  return (
    <ScreenWithHeader theme={theme} onBack={() => router.back()} title="Add friends">
      <View style={{ gap: theme.space.md, flex: 1 }}>
        {/* ------ Search input ------ */}
        <View
          style={[
            styles.searchRow,
            {
              gap: theme.space.sm,
              backgroundColor: theme.color.bg.secondary,
              borderRadius: theme.radius.pill,
              paddingHorizontal: theme.space.md,
            },
          ]}
        >
          <Search size={18} strokeWidth={1.6} color={theme.color.text.tertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by @username"
            placeholderTextColor={theme.color.text.tertiary}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={[
              styles.searchInput,
              {
                color: theme.color.text.primary,
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.regular as '400',
              },
            ]}
          />
          {query.length > 0 ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={18} strokeWidth={1.6} color={theme.color.text.tertiary} />
            </Pressable>
          ) : null}
        </View>

        {/* ------ Body: search results OR tabs ------ */}
        {showSearchResults ? (
          <SearchResultsBody
            query={trimmedQuery}
            state={search}
            outbound={data?.outbound ?? []}
            friends={data?.friends ?? []}
            onSendRequest={(uid) => void hub.sendRequest(uid)}
            isPending={hub.isPending}
          />
        ) : (
          <>
            <TabBar tabs={tabs} active={tab} onChange={setTab} />

            {initialLoading ? (
              <View style={[styles.center, { paddingVertical: theme.space.xxxl }]}>
                <ActivityIndicator color={theme.color.brand} />
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: theme.space.xxxl }}>
                {tab === 'friends' ? (
                  <FriendsTab
                    friends={data?.friends ?? []}
                    onUnfriend={(uid) => void hub.unfriend(uid)}
                    isPending={hub.isPending}
                  />
                ) : null}

                {tab === 'suggested' ? (
                  <SuggestedTab
                    suggestions={data?.suggested ?? []}
                    outbound={data?.outbound ?? []}
                    friends={data?.friends ?? []}
                    onSendRequest={(uid) => void hub.sendRequest(uid)}
                    isPending={hub.isPending}
                  />
                ) : null}

                {tab === 'pending' ? (
                  <PendingTab
                    inbound={data?.inbound ?? []}
                    outbound={data?.outbound ?? []}
                    onAccept={(uid) => void hub.acceptRequest(uid)}
                    onDecline={(uid) => void hub.declineRequest(uid)}
                    onCancel={(uid) => void hub.cancelRequest(uid)}
                    isPending={hub.isPending}
                  />
                ) : null}
              </ScrollView>
            )}
          </>
        )}
      </View>
    </ScreenWithHeader>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ScreenWithHeaderProps {
  theme: ReturnType<typeof useTheme>;
  title: string;
  onBack: () => void;
  children: React.ReactNode;
}

function ScreenWithHeader({ theme, title, onBack, children }: ScreenWithHeaderProps) {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <Screen>
        <View style={[styles.headerRow, { gap: theme.space.sm, marginBottom: theme.space.md }]}>
          <Pressable
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
          >
            <ChevronLeft size={24} strokeWidth={1.6} color={theme.color.text.primary} />
          </Pressable>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.h2,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            {title}
          </Text>
        </View>
        {children}
      </Screen>
    </>
  );
}

function EmptyState({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { paddingVertical: theme.space.xxxl }]}>
      <Text
        style={{
          color: theme.color.text.tertiary,
          fontSize: theme.type.size.tiny,
          fontWeight: theme.type.weight.regular as '400',
          textAlign: 'center',
        }}
      >
        {message}
      </Text>
    </View>
  );
}

function PendingChip() {
  const theme = useTheme();
  return (
    <Text
      style={{
        color: theme.color.text.tertiary,
        fontSize: theme.type.size.tiny,
        fontWeight: theme.type.weight.regular as '400',
        paddingHorizontal: theme.space.sm,
      }}
    >
      Pending
    </Text>
  );
}

// ---- Tab bodies -----------------------------------------------------------

interface FriendsTabProps {
  friends: ReadonlyArray<{ userId: string; username: string; displayName: string; avatarUrl?: string; city?: string }>;
  onUnfriend: (userId: string) => void;
  isPending: (userId: string) => boolean;
}

function FriendsTab({ friends, onUnfriend, isPending }: FriendsTabProps) {
  if (friends.length === 0) {
    return <EmptyState message="No friends yet. Search for someone or accept a request." />;
  }
  return (
    <View>
      {friends.map((f) => (
        <FriendRow
          key={f.userId}
          user={f}
          subtitle={f.city ? `@${f.username} · ${f.city}` : `@${f.username}`}
          trailing={
            <Button
              variant="ghost"
              onPress={() => onUnfriend(f.userId)}
              disabled={isPending(f.userId)}
            >
              Unfriend
            </Button>
          }
        />
      ))}
    </View>
  );
}

interface SuggestedTabProps {
  suggestions: ReadonlyArray<{
    userId: string;
    username: string;
    displayName: string;
    avatarUrl?: string;
    city?: string;
    reason: string;
    mutualCount?: number;
  }>;
  outbound: ReadonlyArray<{ toUserId: string }>;
  friends: ReadonlyArray<{ userId: string }>;
  onSendRequest: (userId: string) => void;
  isPending: (userId: string) => boolean;
}

function SuggestedTab({
  suggestions,
  outbound,
  friends,
  onSendRequest,
  isPending,
}: SuggestedTabProps) {
  if (suggestions.length === 0) {
    return <EmptyState message="No suggestions yet. We’ll surface people as you use Mei." />;
  }
  const outboundIds = new Set(outbound.map((r) => r.toUserId));
  const friendIds = new Set(friends.map((f) => f.userId));
  return (
    <View>
      {suggestions.map((s) => {
        const isFriend = friendIds.has(s.userId);
        const hasPendingRequest = outboundIds.has(s.userId);
        const subtitleSource = SUGGESTION_COPY[s.reason] ?? `@${s.username}`;
        const subtitle = s.mutualCount
          ? `${s.mutualCount} mutual · ${subtitleSource}`
          : subtitleSource;
        return (
          <FriendRow
            key={s.userId}
            user={s}
            subtitle={subtitle}
            trailing={
              isFriend ? (
                <PendingChip />
              ) : hasPendingRequest ? (
                <PendingChip />
              ) : (
                <Button
                  variant="ghost"
                  onPress={() => onSendRequest(s.userId)}
                  disabled={isPending(s.userId)}
                >
                  Add
                </Button>
              )
            }
          />
        );
      })}
    </View>
  );
}

interface PendingTabProps {
  inbound: ReadonlyArray<{
    fromUserId: string;
    user: { userId: string; username: string; displayName: string; avatarUrl?: string; city?: string };
  }>;
  outbound: ReadonlyArray<{
    toUserId: string;
    user: { userId: string; username: string; displayName: string; avatarUrl?: string; city?: string };
  }>;
  onAccept: (fromUserId: string) => void;
  onDecline: (fromUserId: string) => void;
  onCancel: (toUserId: string) => void;
  isPending: (userId: string) => boolean;
}

function PendingTab({
  inbound,
  outbound,
  onAccept,
  onDecline,
  onCancel,
  isPending,
}: PendingTabProps) {
  const theme = useTheme();
  if (inbound.length === 0 && outbound.length === 0) {
    return <EmptyState message="No pending requests." />;
  }
  return (
    <View style={{ gap: theme.space.lg }}>
      {inbound.length > 0 ? (
        <View>
          <SectionLabel theme={theme} label="Incoming" />
          {inbound.map((r) => (
            <FriendRow
              key={r.fromUserId}
              user={r.user}
              trailing={
                <View style={{ flexDirection: 'row', gap: theme.space.xs }}>
                  <Button
                    variant="primary"
                    onPress={() => onAccept(r.fromUserId)}
                    disabled={isPending(r.fromUserId)}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="ghost"
                    onPress={() => onDecline(r.fromUserId)}
                    disabled={isPending(r.fromUserId)}
                  >
                    Decline
                  </Button>
                </View>
              }
            />
          ))}
        </View>
      ) : null}

      {outbound.length > 0 ? (
        <View>
          <SectionLabel theme={theme} label="Sent" />
          {outbound.map((r) => (
            <FriendRow
              key={r.toUserId}
              user={r.user}
              trailing={
                <Button
                  variant="ghost"
                  onPress={() => onCancel(r.toUserId)}
                  disabled={isPending(r.toUserId)}
                >
                  Cancel
                </Button>
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

interface SearchResultsBodyProps {
  query: string;
  state: ReturnType<typeof useFriendSearch>;
  outbound: ReadonlyArray<{ toUserId: string }>;
  friends: ReadonlyArray<{ userId: string }>;
  onSendRequest: (userId: string) => void;
  isPending: (userId: string) => boolean;
}

function SearchResultsBody({
  query,
  state,
  outbound,
  friends,
  onSendRequest,
  isPending,
}: SearchResultsBodyProps) {
  const theme = useTheme();

  if (state.status === 'idle') {
    return <EmptyState message={`Type at least 2 characters to search.`} />;
  }
  if (state.status === 'loading') {
    return (
      <View style={[styles.center, { paddingVertical: theme.space.xxxl }]}>
        <ActivityIndicator color={theme.color.brand} />
      </View>
    );
  }
  if (state.status === 'error') {
    return <EmptyState message={`Search failed: ${state.error.message}`} />;
  }
  if (state.results.length === 0) {
    return <EmptyState message={`No discoverable users for “${query}”.`} />;
  }
  const outboundIds = new Set(outbound.map((r) => r.toUserId));
  const friendIds = new Set(friends.map((f) => f.userId));
  return (
    <ScrollView contentContainerStyle={{ paddingBottom: theme.space.xxxl }}>
      {state.results.map((r) => {
        const isFriend = friendIds.has(r.userId);
        const hasPendingRequest = outboundIds.has(r.userId);
        return (
          <FriendRow
            key={r.userId}
            user={r}
            trailing={
              isFriend ? (
                <PendingChip />
              ) : hasPendingRequest ? (
                <PendingChip />
              ) : (
                <Button
                  variant="ghost"
                  onPress={() => onSendRequest(r.userId)}
                  disabled={isPending(r.userId)}
                >
                  Add
                </Button>
              )
            }
          />
        );
      })}
    </ScrollView>
  );
}

function SectionLabel({ theme, label }: { theme: ReturnType<typeof useTheme>; label: string }) {
  return (
    <Text
      style={{
        color: theme.color.text.tertiary,
        fontSize: theme.type.size.tiny,
        fontWeight: theme.type.weight.medium as '500',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: theme.space.xs,
      }}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
  },
  searchInput: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
