// Selfie upload — SPEC §10.14.
//
// Modal-style screen reached from the Today setup-banner. Lets the user
// add up to 5 selfies, view what they already have, and remove any of
// them. Each upload writes to the private `selfies` storage bucket and
// inserts a row in the `selfies` table (RLS owner-only). Once the user
// has 5, the picker tile hides and the setup banner stops showing on
// Today.
//
// Face/body analysis ("Me becomes a model") and try-on synthesis ride on
// top of this in PRs B + C. Both can read from the same `selfies` rows
// without touching this screen.

import { useCallback } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, ChevronLeft, ImagePlus, Sparkles, Trash2 } from 'lucide-react-native';
import { Button, Screen, useTheme } from '@mei/ui';

import { MAX_SELFIES, useSelfies, type Selfie } from '@/lib/hooks/useSelfies';
import { ApiError } from '@/lib/api/client';

export default function SelfiesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    state,
    count,
    atLimit,
    mutating,
    addFromCamera,
    addFromLibrary,
    remove,
  } = useSelfies();

  // ---- Picker chooser -----------------------------------------------------
  //
  // On iOS we use the native action sheet; on Android we fall back to a
  // plain Alert. Same affordance, same outcome — the picker functions
  // request OS permissions themselves.
  const onAddPress = useCallback(() => {
    const run = async (source: 'camera' | 'library') => {
      try {
        if (source === 'camera') await addFromCamera();
        else await addFromLibrary();
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Could not add selfie';
        Alert.alert('Could not add selfie', message);
      }
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Take a photo', 'Choose from library', 'Cancel'],
          cancelButtonIndex: 2,
          title: 'Add a selfie',
        },
        (idx) => {
          if (idx === 0) void run('camera');
          else if (idx === 1) void run('library');
        },
      );
      return;
    }
    Alert.alert(
      'Add a selfie',
      undefined,
      [
        { text: 'Take a photo', onPress: () => void run('camera') },
        { text: 'Choose from library', onPress: () => void run('library') },
        { text: 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  }, [addFromCamera, addFromLibrary]);

  const onRemove = useCallback(
    (selfieId: string) => {
      Alert.alert('Remove selfie?', 'You can add it again later.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(selfieId);
            } catch (err) {
              const message =
                err instanceof Error ? err.message : 'Could not remove selfie';
              Alert.alert('Could not remove selfie', message);
            }
          },
        },
      ]);
    },
    [remove],
  );

  const loading = state.status === 'loading' || state.status === 'idle';
  const selfies: Selfie[] =
    state.status === 'ready' || state.status === 'error' ? state.selfies : [];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.space.lg,
          paddingBottom: theme.space.xxxl,
          gap: theme.space.lg,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Header --------------------------------------------------- */}
        <View style={[styles.headerRow, { gap: theme.space.sm }]}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={styles.backBtn}
          >
            <ChevronLeft size={24} strokeWidth={1.6} color={theme.color.text.primary} />
          </Pressable>
          <Text
            style={{
              flex: 1,
              color: theme.color.text.primary,
              fontSize: theme.type.size.h2,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            Your selfies
          </Text>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.regular as '400',
            }}
          >
            {count} of {MAX_SELFIES}
          </Text>
        </View>

        {/* ---- Why we ask for selfies ---------------------------------- */}
        <View
          style={[
            styles.helpCard,
            {
              backgroundColor: theme.color.brandBg,
              borderRadius: theme.radius.md,
              padding: theme.space.md,
              gap: theme.space.sm,
            },
          ]}
        >
          <View style={[styles.helpRow, { gap: theme.space.sm }]}>
            <Sparkles size={20} strokeWidth={1.6} color={theme.color.brandOn} />
            <Text
              style={{
                flex: 1,
                color: theme.color.brandOn,
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.medium as '500',
              }}
            >
              Add 5 selfies so we can try outfits on you
            </Text>
          </View>
          <Text
            style={{
              color: theme.color.brandOn,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
            }}
          >
            Front-facing, good light, varied angles. They stay private — only
            you can see them, and we only use them to generate your try-on
            photos.
          </Text>
        </View>

        {/* ---- Grid ----------------------------------------------------- */}
        {loading ? (
          <View style={[styles.center, { paddingVertical: theme.space.xxxl }]}>
            <ActivityIndicator color={theme.color.brand} />
          </View>
        ) : (
          <View style={[styles.grid, { gap: theme.space.sm }]}>
            {selfies.map((selfie) => (
              <View key={selfie.selfieId} style={styles.tile}>
                <View
                  style={[
                    styles.tileInner,
                    {
                      backgroundColor: theme.color.bg.secondary,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  {selfie.url ? (
                    <Image
                      source={{ uri: selfie.url }}
                      style={StyleSheet.absoluteFill}
                      accessibilityIgnoresInvertColors
                    />
                  ) : null}
                  <Pressable
                    onPress={() => onRemove(selfie.selfieId)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove selfie"
                    style={({ pressed }) => [
                      styles.removeBtn,
                      {
                        backgroundColor: theme.color.bg.primary,
                        borderRadius: theme.radius.pill,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Trash2
                      size={16}
                      strokeWidth={1.6}
                      color={theme.color.text.primary}
                    />
                  </Pressable>
                </View>
              </View>
            ))}

            {!atLimit ? (
              <Pressable
                onPress={onAddPress}
                disabled={mutating}
                accessibilityRole="button"
                accessibilityLabel="Add a selfie"
                style={({ pressed }) => [
                  styles.tile,
                  {
                    opacity: pressed || mutating ? 0.7 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.tileInner,
                    styles.addTile,
                    {
                      borderColor: theme.color.border.strong,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                >
                  {mutating ? (
                    <ActivityIndicator color={theme.color.brand} />
                  ) : (
                    <>
                      <ImagePlus
                        size={28}
                        strokeWidth={1.6}
                        color={theme.color.text.tertiary}
                      />
                      <Text
                        style={{
                          color: theme.color.text.tertiary,
                          fontSize: theme.type.size.tiny,
                          fontWeight: theme.type.weight.regular as '400',
                          marginTop: theme.space.xs,
                        }}
                      >
                        Add a selfie
                      </Text>
                    </>
                  )}
                </View>
              </Pressable>
            ) : null}
          </View>
        )}

        {/* ---- At-limit footer ---------------------------------------- */}
        {atLimit ? (
          <View style={[styles.atLimit, { gap: theme.space.sm }]}>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.medium as '500',
                textAlign: 'center',
              }}
            >
              You're all set.
            </Text>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
                textAlign: 'center',
              }}
            >
              Remove one above to swap in a different photo.
            </Text>
            <Button variant="primary" onPress={() => router.back()}>
              Done
            </Button>
          </View>
        ) : null}

        {/* ---- Error footer ------------------------------------------- */}
        {state.status === 'error' ? (
          <Text
            style={{
              color: theme.color.brand,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
              textAlign: 'center',
            }}
            numberOfLines={2}
          >
            {state.error.message}
          </Text>
        ) : null}

        {/* ---- Primary CTAs at bottom --------------------------------- */}
        {!atLimit && !loading ? (
          <View style={{ gap: theme.space.sm, marginTop: theme.space.md }}>
            <Button
              variant="primary"
              icon={Camera}
              onPress={() => {
                addFromCamera().catch((err) => {
                  const message =
                    err instanceof Error ? err.message : 'Could not open camera';
                  Alert.alert('Could not open camera', message);
                });
              }}
              disabled={mutating}
            >
              Take a photo
            </Button>
            <Button
              variant="ghost"
              onPress={() => {
                addFromLibrary().catch((err) => {
                  const message =
                    err instanceof Error ? err.message : 'Could not open library';
                  Alert.alert('Could not open library', message);
                });
              }}
              disabled={mutating}
            >
              Choose from library
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const TILE_PCT = '31.5%';

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
  },
  backBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpCard: {
    width: '100%',
  },
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    width: TILE_PCT,
    aspectRatio: 3 / 4,
  },
  tileInner: {
    flex: 1,
    overflow: 'hidden',
  },
  addTile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  atLimit: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
