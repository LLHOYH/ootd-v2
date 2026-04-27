import { StyleSheet, View } from 'react-native';
import { MetricCell, useTheme } from '@mei/ui';
import type { MockProfile } from './mocks';

export interface StatsRowProps {
  profile: MockProfile;
}

/**
 * Three MetricCells: Items · OOTDs · Friends. SPEC §10.11 step 3.
 */
export function StatsRow({ profile }: StatsRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { gap: theme.space.sm, marginTop: theme.space.md + 2 }]}>
      <MetricCell value={profile.itemCount} label="Items" style={styles.cell} />
      <MetricCell value={profile.ootdCount} label="OOTDs" style={styles.cell} />
      <MetricCell value={profile.friendCount} label="Friends" style={styles.cell} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
  },
});
