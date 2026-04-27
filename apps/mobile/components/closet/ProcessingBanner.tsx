import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Sparkles } from 'lucide-react-native';
import { Card, useTheme } from '@mei/ui';

export interface ProcessingBannerProps {
  count: number;
  etaMinutes: number;
  /** 0..1 — how far Stella has progressed. */
  progress?: number;
}

export function ProcessingBanner({
  count,
  etaMinutes,
  progress = 0.6,
}: ProcessingBannerProps) {
  const theme = useTheme();

  const clamped = Math.max(0, Math.min(1, progress));
  // Thin progress bar: ~xs (4) tall, ~xxxl (32) wide. Token-driven.
  const trackHeight = theme.space.xs;
  const trackWidth = theme.space.xxxl;

  return (
    <Card
      tone="pink"
      padding={theme.space.sm}
      style={{ marginTop: theme.space.md }}
    >
      <View style={[styles.row, { gap: theme.space.sm }]}>
        <Sparkles size={14} strokeWidth={1.6} color={theme.color.brand} />
        <Text
          style={[
            styles.copy,
            {
              color: theme.color.brandOn,
              fontSize: theme.type.size.tiny,
              fontWeight: theme.type.weight.regular as '400',
            },
          ]}
          numberOfLines={1}
        >
          {`Stella tuning ${count} photos · ~${etaMinutes} min`}
        </Text>
        <View
          style={{
            width: trackWidth,
            height: trackHeight,
            backgroundColor: theme.color.bg.tertiary,
            borderRadius: theme.radius.sm,
            overflow: 'hidden',
          }}
          accessibilityRole="progressbar"
          accessibilityValue={{ now: Math.round(clamped * 100), min: 0, max: 100 }}
        >
          <View
            style={{
              width: `${clamped * 100}%`,
              height: '100%',
              backgroundColor: theme.color.brand,
            }}
          />
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
  copy: {
    flex: 1,
    includeFontPadding: false,
  },
});
