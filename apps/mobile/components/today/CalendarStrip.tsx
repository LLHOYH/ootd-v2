import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarDays } from 'lucide-react-native';
import { Card, useTheme } from '@mei/ui';
import type { TodayEventCard } from './types';

export interface CalendarStripProps {
  events: TodayEventCard[];
  onEventPress?: (event: TodayEventCard) => void;
}

const OCCASION_LABEL: Record<TodayEventCard['occasion'], string> = {
  CASUAL: 'casual',
  WORK: 'work',
  DATE: 'date night',
  BRUNCH: 'casual chic',
  EVENING: 'evening',
  WEDDING: 'wedding',
  WORKOUT: 'workout',
  BEACH: 'beach',
};

export function CalendarStrip({ events, onEventPress }: CalendarStripProps) {
  const theme = useTheme();

  if (events.length === 0) return null;

  return (
    <View style={{ gap: theme.space.xs }}>
      {events.map((event) => (
        <Pressable
          key={event.id}
          onPress={() => onEventPress?.(event)}
          accessibilityRole="button"
          accessibilityLabel={`${event.startLabel} ${event.title}`}
        >
          <Card>
            <View style={[styles.row, { gap: theme.space.md }]}>
              <View
                style={[
                  styles.icon,
                  {
                    backgroundColor: theme.color.brandBg,
                    borderRadius: theme.radius.sm,
                  },
                ]}
              >
                <CalendarDays
                  size={20}
                  strokeWidth={1.6}
                  color={theme.color.brandOn}
                />
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
                  {`${event.startLabel} · ${event.title}`}
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
                  {`${event.locationName} · ${OCCASION_LABEL[event.occasion]}`}
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ))}
    </View>
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
