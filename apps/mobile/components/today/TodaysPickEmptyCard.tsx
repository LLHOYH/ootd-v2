import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Shirt, Sparkles } from 'lucide-react-native';
import { Button, Card, SectionHeader, useTheme } from '@mei/ui';

export interface TodaysPickEmptyCardProps {
  selfieCount: number;
  checkingCloset?: boolean;
  onAddClothes?: () => void;
  onViewSelfies?: () => void;
}

export function TodaysPickEmptyCard({
  selfieCount,
  checkingCloset = false,
  onAddClothes,
  onViewSelfies,
}: TodaysPickEmptyCardProps) {
  const theme = useTheme();
  const hasSelfies = selfieCount >= 5;

  return (
    <View>
      <SectionHeader title="Today's pick" />
      <Card>
        <View style={[styles.headerRow, { gap: theme.space.md }]}>
          <View
            style={[
              styles.icon,
              {
                backgroundColor: theme.color.brandBg,
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            {checkingCloset ? (
              <ActivityIndicator size="small" color={theme.color.brand} />
            ) : hasSelfies ? (
              <Shirt size={20} strokeWidth={1.6} color={theme.color.brand} />
            ) : (
              <Sparkles size={20} strokeWidth={1.6} color={theme.color.brand} />
            )}
          </View>
          <View style={styles.copy}>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.h2,
                fontWeight: theme.type.weight.medium as '500',
              }}
              numberOfLines={1}
            >
              {checkingCloset ? 'Checking closet...' : 'No look yet'}
            </Text>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.regular as '400',
                marginTop: theme.space.xs,
              }}
            >
              {checkingCloset
                ? 'Looking for clothes that can become your first pick.'
                : 'Add dress photos or photos of you wearing them so Stella can build a pick.'}
            </Text>
          </View>
        </View>

        <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.md }]}>
          <Button
            variant="primary"
            onPress={onAddClothes ?? (() => {})}
            style={styles.actionButton}
          >
            Add clothes
          </Button>
          <Button
            variant="ghost"
            onPress={onViewSelfies ?? (() => {})}
            style={styles.actionButton}
          >
            Selfies
          </Button>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
  },
  actionButton: {
    flex: 1,
  },
});
