import { StyleSheet, View } from 'react-native';
import { MetricCell, useTheme } from '@mei/ui';
import type { MyProfile } from '@/lib/hooks/useMyProfile';

export interface StatsRowProps {
  profile: MyProfile;
}

/**
 * Three MetricCells: Items · OOTDs · Friends. SPEC §10.11 step 3.
 */
export function StatsRow({ profile }: StatsRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { gap: theme.space.sm, marginTop: theme.space.md + 2 }]}>
      <MetricCell value={profile.counts.items} label="Items" style={styles.cell} />
      <MetricCell value={profile.counts.ootds} label="OOTDs" style={styles.cell} />
      <MetricCell value={profile.counts.friends} label="Friends" style={styles.cell} />
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
