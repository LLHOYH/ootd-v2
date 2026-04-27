import { StyleSheet, View } from 'react-native';
import { Card, OutfitCard, Button, SectionHeader, useTheme } from '@mei/ui';
import type { Combination } from '@mei/types';

export interface TodaysPickCardProps {
  combination: Combination;
  onTryAnother?: () => void;
  onWear?: () => void;
  onSave?: () => void;
}

export function TodaysPickCard({
  combination,
  onTryAnother,
  onWear,
  onSave,
}: TodaysPickCardProps) {
  const theme = useTheme();

  return (
    <View>
      <SectionHeader
        title="Today's pick"
        action={{ label: 'Try another →', onPress: onTryAnother ?? (() => {}) }}
      />
      <Card tone="pink">
        <OutfitCard
          combination={combination}
          style={{ backgroundColor: 'transparent', padding: 0 }}
        />
        <View style={[styles.actions, { gap: theme.space.sm, marginTop: theme.space.sm }]}>
          <Button
            variant="primary"
            onPress={onWear ?? (() => {})}
            style={{ flex: 1 }}
          >
            Wear this on me
          </Button>
          <Button
            variant="ghost"
            onPress={onSave ?? (() => {})}
            accessibilityLabel="Save this look"
          >
            {'♡'}
          </Button>
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
