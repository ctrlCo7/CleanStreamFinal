import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { SeverityLevel, ReportStatus } from '../../types';

type BadgeVariant = SeverityLevel | ReportStatus | 'ai' | 'dispatch' | 'specialist';

interface BadgeProps {
  variant: BadgeVariant;
  label?: string;
}

const buildBadgeStyles = (Colors: ThemeColors): Record<string, { bg: string; color: string }> => ({
  critical: { bg: Colors.criticalBg, color: Colors.criticalText },
  high: { bg: Colors.redBg, color: Colors.redText },
  moderate: { bg: Colors.amberBg, color: Colors.amberText },
  low: { bg: Colors.tealLight, color: Colors.tealDark },
  pending: { bg: Colors.blueBg, color: Colors.blueText },
  verified: { bg: Colors.purpleBg, color: Colors.purpleText },
  assigned: { bg: Colors.amberBg, color: Colors.amberText },
  in_progress: { bg: Colors.amberBg, color: Colors.amberText },
  completed: { bg: Colors.tealLight, color: Colors.tealDark },
  resolved: { bg: Colors.tealLight, color: Colors.tealDark },
  rejected: { bg: Colors.redBg, color: Colors.redText },
  cancelled: { bg: Colors.grayBg, color: Colors.grayMuted },
  ai: { bg: Colors.purpleBg, color: Colors.purpleText },
  dispatch: { bg: Colors.redBg, color: Colors.redText },
  specialist: { bg: Colors.criticalBg, color: Colors.criticalText },
});

const BADGE_LABELS: Record<string, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  pending: 'Pending',
  verified: 'Verified',
  assigned: 'Assigned',
  in_progress: 'In progress',
  completed: 'Completed',
  resolved: 'Resolved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  ai: 'AI Verified',
  dispatch: 'Dispatch team',
  specialist: 'Specialist needed',
};

export function Badge({ variant, label }: BadgeProps) {
  const { colors } = useTheme();
  const badgeStyles = useMemo(() => buildBadgeStyles(colors), [colors]);
  const style = badgeStyles[variant] || badgeStyles.low;
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
