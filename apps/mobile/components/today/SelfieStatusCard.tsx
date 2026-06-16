import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, ChevronRight } from 'lucide-react-native';
import { Card, useTheme } from '@mei/ui';

export interface SelfieStatusCardProps {
  selfieCount: number;
  onPress?: () => void;
}

export function SelfieStatusCard({ selfieCount, onPress }: SelfieStatusCardProps) {
  const theme = useTheme();
  const savedCount = Math.min(selfieCount, 5);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="View saved selfies"
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card>
        <View style={[styles.row, { gap: theme.space.md }]}>
          <View
            style={[
              styles.icon,
              {
                backgroundColor: theme.color.brandBg,
                borderRadius: theme.radius.pill,
              },
            ]}
          >
            <Camera size={18} strokeWidth={1.6} color={theme.color.brand} />
          </View>

          <View style={styles.body}>
            <Text
              style={{
                color: theme.color.text.primary,
                fontSize: theme.type.size.body,
                fontWeight: theme.type.weight.medium as '500',
              }}
              numberOfLines={1}
            >
              Selfies ready
            </Text>
            <Text
              style={{
                color: theme.color.text.tertiary,
                fontSize: theme.type.size.tiny,
                fontWeight: theme.type.weight.regular as '400',
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {savedCount} of 5 saved for try-on photos
            </Text>
          </View>

          <ChevronRight size={18} strokeWidth={1.6} color={theme.color.text.tertiary} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
  },
});
