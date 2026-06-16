import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Sparkles } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface StellaHeaderProps {
  showBack?: boolean;
  onNewPress?: () => void;
}

/**
 * Stella chat header — SPEC §10.5.
 * Back arrow (closes the modal), "Stella" + sparkle, "Your AI stylist · online" subtitle.
 */
export function StellaHeader({ showBack = true, onNewPress }: StellaHeaderProps) {
  const theme = useTheme();
  const router = useRouter();

  if (!showBack) {
    return (
      <View style={styles.topRow}>
        <View>
          <Text
            style={{
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.medium as '500',
              marginBottom: theme.space.xs,
              textTransform: 'uppercase',
            }}
          >
            Stylist
          </Text>
          <View style={styles.titleRow}>
            <Text
              style={[
                styles.largeTitle,
                {
                  color: theme.color.text.primary,
                  fontSize: theme.type.size.h1,
                  fontWeight: theme.type.weight.medium as '500',
                },
              ]}
            >
              Stella
            </Text>
            <Sparkles size={18} color={theme.color.brand} strokeWidth={1.6} />
          </View>
        </View>
        <Pressable
          onPress={onNewPress}
          accessibilityRole="button"
          accessibilityLabel="Start a new Stella chat"
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconButton,
            {
              backgroundColor: theme.color.bg.secondary,
              borderColor: theme.color.border.default,
              borderRadius: theme.radius.pill,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
        >
          <Plus size={22} color={theme.color.text.primary} strokeWidth={1.6} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.row, { gap: theme.space.md }]}>
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        style={({ pressed }) => [
          styles.backBtn,
          {
            backgroundColor: theme.color.bg.secondary,
            borderRadius: theme.radius.pill,
          },
          pressed && styles.pressed,
        ]}
      >
        <ArrowLeft size={16} color={theme.color.text.primary} strokeWidth={1.6} />
      </Pressable>

      <View style={styles.titleColumn}>
        <View style={styles.titleRow}>
          <Text
            style={[
              styles.title,
              {
                color: theme.color.text.primary,
                fontSize: theme.type.size.h2,
                fontWeight: theme.type.weight.medium as '500',
              },
            ]}
          >
            Stella
          </Text>
          <Sparkles size={14} color={theme.color.brand} strokeWidth={1.6} />
        </View>
        <Text
          style={[
            styles.subtitle,
            {
              color: theme.color.text.tertiary,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
            },
          ]}
        >
          Your AI stylist · online
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleColumn: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  largeTitle: {
    includeFontPadding: false,
  },
  title: {
    includeFontPadding: false,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  subtitle: {
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
