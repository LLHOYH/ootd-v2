import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Avatar, useTheme } from '@mei/ui';
import type { ChatThreadMemberAvatar, ChatThreadRow } from './types';

export interface ThreadRowProps {
  thread: ChatThreadRow;
  isLast?: boolean;
  onPress?: () => void;
}

const ROW_AVATAR = 38;
const STACK_AVATAR = 26;

/**
 * Single chat-thread row. Layout:
 *   [avatar | stacked avatars | sparkle chip] · name + preview · time + unread dot
 *
 * Mirrors `08 · CHATS INBOX` rows in mockup.html. Group/hangout threads use
 * stacked member avatars; Stella uses a brand-tinted sparkle chip.
 */
export function ThreadRow({ thread, isLast, onPress }: ThreadRowProps) {
  const theme = useTheme();
  const showUnread = thread.unread > 0;
  const isHangoutUnread = thread.type === 'HANGOUT' && showUnread;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open chat with ${thread.name}`}
      style={[
        styles.row,
        {
          gap: 11,
          paddingVertical: 9,
          paddingHorizontal: theme.space.xs,
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: theme.color.border.default,
        },
      ]}
    >
      <ThreadLeading thread={thread} />

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.caption,
              fontWeight: theme.type.weight.medium as '500',
            }}
            numberOfLines={1}
          >
            {thread.name}
          </Text>
          <Text
            style={{
              color: isHangoutUnread
                ? theme.color.brand
                : theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: isHangoutUnread
                ? (theme.type.weight.medium as '500')
                : (theme.type.weight.regular as '400'),
              marginLeft: theme.space.sm,
            }}
            numberOfLines={1}
          >
            {thread.timeLabel}
          </Text>
        </View>

        {thread.subtitle ? (
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {thread.subtitle}
          </Text>
        ) : null}

        <Text
          style={{
            color: theme.color.text.secondary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {thread.preview}
        </Text>
      </View>

      {showUnread ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: theme.color.brand },
          ]}
          accessibilityLabel={`${thread.unread} unread`}
        />
      ) : null}
    </Pressable>
  );
}

function ThreadLeading({ thread }: { thread: ChatThreadRow }) {
  const theme = useTheme();

  if (thread.type === 'STELLA') {
    return (
      <View
        style={[
          styles.sparkle,
          {
            width: ROW_AVATAR,
            height: ROW_AVATAR,
            borderRadius: ROW_AVATAR / 2,
            backgroundColor: theme.color.brandBg,
            borderWidth: thread.avatarRing === 'pink' ? 1.5 : 0,
            borderColor:
              thread.avatarRing === 'pink'
                ? theme.color.brand
                : 'transparent',
          },
        ]}
      >
        <Sparkles size={18} strokeWidth={1.6} color={theme.color.brandOn} />
      </View>
    );
  }

  if (thread.memberAvatars && thread.memberAvatars.length > 0) {
    return <StackedAvatars members={thread.memberAvatars} />;
  }

  return (
    <Avatar
      initials={thread.avatarInitials ?? thread.name.slice(0, 1).toUpperCase()}
      size={ROW_AVATAR}
      ringed={thread.avatarRing}
      src={thread.avatarUrl}
    />
  );
}

function StackedAvatars({ members }: { members: ChatThreadMemberAvatar[] }) {
  const theme = useTheme();
  // Show up to 2 stacked avatars; mockup shows top-left + bottom-right.
  const top = members[0];
  const bot = members[1] ?? members[0];

  return (
    <View
      style={{
        width: ROW_AVATAR,
        height: ROW_AVATAR,
        position: 'relative',
      }}
    >
      <View style={[styles.stackTop]}>
        <Avatar
          initials={top.initials}
          size={STACK_AVATAR}
          style={{ backgroundColor: theme.color.palette[top.palette] }}
        />
      </View>
      <View
        style={[
          styles.stackBot,
          {
            borderRadius: STACK_AVATAR / 2 + 1.5,
            backgroundColor: theme.color.bg.primary,
            padding: 1.5,
          },
        ]}
      >
        <Avatar
          initials={bot.initials}
          size={STACK_AVATAR}
          style={{ backgroundColor: theme.color.palette[bot.palette] }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7 / 2,
  },
  sparkle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackTop: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  stackBot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
});
