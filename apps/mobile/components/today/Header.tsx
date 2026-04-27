import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useTheme } from '@mei/ui';

export interface HeaderProps {
  firstName: string;
  date: Date;
  unread?: boolean;
  onBellPress?: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function formatDate(d: Date): string {
  // Sentence case: "Sun · 26 April"
  const wd = WEEKDAYS[d.getDay()] ?? '';
  const mo = MONTHS[d.getMonth()] ?? '';
  return `${wd} · ${d.getDate()} ${mo}`;
}

export function Header({ firstName, date, unread = true, onBellPress }: HeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View>
        <Text
          style={{
            color: theme.color.text.tertiary,
            fontSize: theme.type.size.tiny,
            fontWeight: theme.type.weight.regular as '400',
            marginBottom: 2,
          }}
        >
          {formatDate(date)}
        </Text>
        <Text
          style={{
            color: theme.color.text.primary,
            fontSize: theme.type.size.h1,
            fontWeight: theme.type.weight.medium as '500',
          }}
        >
          Hi, {firstName}
        </Text>
      </View>

      <Pressable
        onPress={onBellPress}
        accessibilityRole="button"
        accessibilityLabel="Notifications"
        hitSlop={8}
        style={[
          styles.bell,
          {
            backgroundColor: theme.color.bg.secondary,
            borderRadius: theme.radius.pill,
          },
        ]}
      >
        <Bell size={20} strokeWidth={1.6} color={theme.color.text.primary} />
        {unread ? (
          <View
            style={[
              styles.dot,
              { backgroundColor: theme.color.brand },
            ]}
          />
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  bell: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 999,
  },
});
