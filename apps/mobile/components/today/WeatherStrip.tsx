import { StyleSheet, Text, View } from 'react-native';
import { Card, useTheme } from '@mei/ui';
import type { TodayWeather } from './types';

export interface WeatherStripProps {
  weather: TodayWeather;
}

export function WeatherStrip({ weather }: WeatherStripProps) {
  const theme = useTheme();
  const note =
    weather.tempC >= 28
      ? 'Light fabric, easy layers, no heavy outerwear.'
      : weather.tempC >= 22
        ? 'Comfortable layers and breathable pieces should work well.'
        : 'Add a warmer layer and keep the outfit easy to adjust.';

  return (
    <Card padding={18} style={{ borderRadius: 22 }}>
      <View style={[styles.row, { gap: theme.space.md }]}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: theme.color.palette.tan,
              borderRadius: 17,
            },
          ]}
        >
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
            }}
          >
            {Math.round(weather.tempC)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              color: theme.color.text.primary,
              fontSize: theme.type.size.body,
              fontWeight: theme.type.weight.medium as '500',
            }}
            numberOfLines={1}
          >
            {`${weather.condition} in ${weather.city}`}
          </Text>
          <Text
            style={{
              color: theme.color.text.secondary,
              fontSize: theme.type.size.caption,
              fontWeight: theme.type.weight.regular as '400',
              marginTop: 3,
            }}
            numberOfLines={2}
          >
            {note}
          </Text>
        </View>
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
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
