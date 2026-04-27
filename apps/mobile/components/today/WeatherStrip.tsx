import { StyleSheet, Text, View } from 'react-native';
import { Sun } from 'lucide-react-native';
import { Card, useTheme } from '@mei/ui';
import type { MockWeather } from './mocks';

export interface WeatherStripProps {
  weather: MockWeather;
}

export function WeatherStrip({ weather }: WeatherStripProps) {
  const theme = useTheme();

  return (
    <Card>
      <View style={[styles.row, { gap: theme.space.md }]}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: theme.color.palette.tan,
              borderRadius: theme.radius.sm,
            },
          ]}
        >
          <Sun size={20} strokeWidth={1.6} color={theme.color.text.primary} />
        </View>
        <Text
          style={{
            flex: 1,
            color: theme.color.text.primary,
            fontSize: theme.type.size.body,
            fontWeight: theme.type.weight.medium as '500',
          }}
          numberOfLines={1}
        >
          {`${weather.tempC}° · ${weather.condition} · ${weather.city}`}
        </Text>
      </View>
    </Card>
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
});
