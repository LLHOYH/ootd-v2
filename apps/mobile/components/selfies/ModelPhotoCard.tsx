import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { RefreshCcw, Sparkles } from 'lucide-react-native';
import { Button, useTheme } from '@mei/ui';
import type { ModelPhoto } from '@mei/types';
import type { UseModelPhotoState } from '@/lib/hooks/useModelPhoto';

interface ModelPhotoCardProps {
  state: UseModelPhotoState;
  generating: boolean;
  selfieCount: number;
  onGenerate: () => void;
  onOpenPreview?: (imageUrl: string) => void;
}

export function ModelPhotoCard({
  state,
  generating,
  selfieCount,
  onGenerate,
  onOpenPreview,
}: ModelPhotoCardProps) {
  const theme = useTheme();
  const latest = state.status === 'ready' || state.status === 'error' ? state.latest : undefined;
  const readyUrl = latest?.status === 'READY' ? latest.imageUrl : undefined;
  const ready = Boolean(readyUrl);
  const failed = latest?.status === 'FAILED';
  const pending = latest?.status === 'PENDING';
  const working = generating || pending;
  const errorMessage =
    state.status === 'error'
      ? state.error.message
      : failed
        ? latest.errorDetail
        : undefined;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.color.bg.secondary,
          borderRadius: theme.radius.md,
          padding: theme.space.md,
          gap: theme.space.md,
        },
      ]}
    >
      <View style={[styles.titleRow, { gap: theme.space.sm }]}>
        <Sparkles size={20} strokeWidth={1.6} color={theme.color.brand} />
        <Text
          style={{
            flex: 1,
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.medium as '500',
          }}
        >
          Model photo
        </Text>
        {state.status === 'loading' ? (
          <ActivityIndicator size="small" color={theme.color.brand} />
        ) : null}
      </View>

      {readyUrl ? (
        <Pressable
          onPress={() => onOpenPreview?.(readyUrl)}
          accessibilityRole="imagebutton"
          accessibilityLabel="Open model photo preview"
          style={({ pressed }) => [
            styles.heroPreview,
            {
              backgroundColor: theme.color.bg.primary,
              borderRadius: theme.radius.md,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <Image
            source={{ uri: readyUrl }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </Pressable>
      ) : null}

      <View style={[styles.bodyRow, { gap: theme.space.md }]}>
        {!readyUrl ? (
          <View
            style={[
              styles.preview,
              {
                backgroundColor: theme.color.bg.primary,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            {working ? (
              <ActivityIndicator color={theme.color.brand} />
            ) : (
              <Sparkles size={26} strokeWidth={1.6} color={theme.color.text.tertiary} />
            )}
          </View>
        ) : null}
        <View style={[styles.copy, { gap: theme.space.sm }]}>
          <ModelPhotoStatusText
            latest={latest}
            selfieCount={selfieCount}
            generating={generating}
            pending={pending}
            errorMessage={errorMessage}
          />
          <Button
            variant={ready ? 'ghost' : 'primary'}
            icon={ready || failed ? RefreshCcw : Sparkles}
            onPress={onGenerate}
            disabled={working || state.status === 'loading' || selfieCount === 0}
          >
            {generating
              ? 'Queueing...'
              : pending
                ? 'Working...'
              : ready
                ? 'Regenerate'
                : failed
                  ? 'Try again'
                  : 'Generate'}
          </Button>
        </View>
      </View>
    </View>
  );
}

function ModelPhotoStatusText({
  latest,
  selfieCount,
  generating,
  pending,
  errorMessage,
}: {
  latest?: ModelPhoto;
  selfieCount: number;
  generating: boolean;
  pending: boolean;
  errorMessage?: string;
}) {
  const theme = useTheme();
  const text = generating
    ? 'Queueing your model photo...'
    : pending
      ? 'Generating in the background. You can leave this screen.'
      : latest?.status === 'READY'
        ? 'Ready for try-ons.'
        : errorMessage
          ? `Couldn't generate: ${errorMessage}`
          : `${selfieCount} selfie${selfieCount === 1 ? '' : 's'} ready.`;

  return (
    <Text
      style={{
        color: errorMessage ? theme.color.brand : theme.color.text.tertiary,
        fontSize: theme.type.size.tiny,
        fontWeight: theme.type.weight.regular as '400',
      }}
      numberOfLines={3}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  preview: {
    width: 92,
    aspectRatio: 3 / 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroPreview: {
    width: '100%',
    aspectRatio: 3 / 4,
    overflow: 'hidden',
  },
  copy: {
    flex: 1,
    alignItems: 'stretch',
  },
});
