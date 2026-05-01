// One OOTD card in the Friends-tab feed (SPEC §10.8).
//
// Layout:
//   Avatar · name · time
//   Photo (try-on or fallback OutfitCard image; gracefully empty if neither)
//   Caption (one-line)
//   Reaction row: ♡ count · Coordinate ↗ CTA
//
// `Coordinate` opens a Stella prompt; we route to /chats/stella for now and
// trust the user to type the coordination ask. A deeper Stella deep-link
// (with the friend's ootdId pre-filled) lands in feat/wire-stella-tools.

import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Heart, Sparkles } from 'lucide-react-native';
import { Avatar, Card, useTheme } from '@mei/ui';
import type { OotdFeedItem } from '@/lib/hooks/useOotdFeed';

export interface OotdPostCardProps {
  item: OotdFeedItem;
  onToggleReaction: () => void;
  onCoordinate: () => void;
}

function formatRelative(at: string): string {
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return '';
  const diffMs = Date.now() - t;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const d = new Date(at);
  const day = String(d.getDate()).padStart(2, '0');
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${mo}`;
}

export function OotdPostCard({
  item,
  onToggleReaction,
  onCoordinate,
}: OotdPostCardProps) {
  const theme = useTheme();
  const { post, authorName, authorAvatarUrl, authorInitials, reactionCount, iReacted, comboName } = item;
  const photoUrl = post.tryOnPhotoUrl ?? post.fallbackOutfitCardUrl;
  const time = formatRelative(post.createdAt);

  return (
    <Card>
      {/* Author row */}
      <View style={[styles.authorRow, { gap: theme.space.sm }]}>
        <Avatar size={36} initials={authorInitials} src={authorAvatarUrl} ringed="plain" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
            }}
            numberOfLines={1}
          >
            {authorName}
          </Text>
          {post.locationName ? (
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
              }}
              numberOfLines={1}
            >
              {`${post.locationName} · ${time}`}
            </Text>
          ) : (
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
              }}
            >
              {time}
            </Text>
          )}
        </View>
      </View>

      {/* Photo */}
      <View
        style={[
          styles.photo,
          {
            marginTop: theme.space.sm,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.color.bg.secondary,
          },
        ]}
      >
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.photoImg}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <View style={[styles.photoEmpty, { borderRadius: theme.radius.sm }]}>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
              }}
            >
              {comboName ?? 'No photo yet'}
            </Text>
          </View>
        )}
      </View>

      {/* Caption */}
      {post.caption ? (
        <Text
          style={{
            marginTop: theme.space.sm,
            color: theme.color.text.primary,
            fontSize: theme.type.size.caption,
            fontWeight: theme.type.weight.regular as '400',
          }}
          numberOfLines={2}
        >
          {post.caption}
        </Text>
      ) : null}

      {/* Reaction row */}
      <View style={[styles.reactionRow, { gap: theme.space.md, marginTop: theme.space.sm }]}>
        <Pressable
          onPress={onToggleReaction}
          accessibilityRole="button"
          accessibilityLabel={iReacted ? 'Remove reaction' : 'Add reaction'}
          hitSlop={6}
          style={({ pressed }) => [styles.reactionBtn, pressed && { opacity: 0.6 }]}
        >
          <Heart
            size={18}
            strokeWidth={1.6}
            color={iReacted ? theme.color.brand : theme.color.text.tertiary}
            fill={iReacted ? theme.color.brand : 'transparent'}
          />
          <Text
            style={{
              color: iReacted ? theme.color.brand : theme.color.text.secondary,
              fontSize: theme.type.size.caption,
              fontWeight: theme.type.weight.regular as '400',
            }}
          >
            {reactionCount}
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={onCoordinate}
          accessibilityRole="button"
          accessibilityLabel="Coordinate with Stella"
          hitSlop={6}
          style={({ pressed }) => [
            styles.coordinateBtn,
            { gap: 4 },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Sparkles size={16} strokeWidth={1.6} color={theme.color.brand} />
          <Text
            style={{
              color: theme.color.brand,
              fontSize: theme.type.size.caption,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            Coordinate
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photo: {
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
  },
  photoImg: {
    width: '100%',
    height: '100%',
  },
  photoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coordinateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
