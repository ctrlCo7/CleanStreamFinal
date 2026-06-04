import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';
import { SeverityLevel, ReportStatus } from '../../types';

type BadgeVariant = SeverityLevel | ReportStatus | 'ai' | 'dispatch' | 'specialist';

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
}

const BADGE_STYLES: Record<string, { bg: string; color: string }> = {
  critical: { bg: Colors.criticalBg, color: Colors.criticalText },
  high: { bg: Colors.redBg, color: Colors.redText },
  moderate: { bg: Colors.amberBg, color: Colors.amberText },
  low: { bg: Colors.tealLight, color: Colors.tealDark },
  pending: { bg: Colors.blueBg, color: Colors.blueText },
  in_progress: { bg: Colors.amberBg, color: Colors.amberText },
  resolved: { bg: Colors.tealLight, color: Colors.tealDark },
  cancelled: { bg: Colors.grayBg, color: Colors.grayMuted },
  ai: { bg: Colors.purpleBg, color: Colors.purpleText },
  dispatch: { bg: Colors.redBg, color: Colors.redText },
  specialist: { bg: Colors.criticalBg, color: Colors.criticalText },
};

const BADGE_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  pending: 'Pending',
  in_progress: 'In progress',
  resolved: 'Resolved',
  cancelled: 'Cancelled',
  ai: 'AI Verified',
  dispatch: 'Dispatch team',
  specialist: 'Specialist needed',
};

export function Badge({ variant, label }: BadgeProps) {
  const style = BADGE_STYLES[variant] || BADGE_STYLES.low;
  const text = label || BADGE_LABELS[variant] || variant;

  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]}>
      <Text style={[styles.text, { color: style.color }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 10,
    fontWeight: '500',
  },
});
