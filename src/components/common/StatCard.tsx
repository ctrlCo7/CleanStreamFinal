import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../hooks/useTheme';

interface StatCardProps {
  value: string | number;
  label: string;
  valueColor?: string;
}

export function StatCard({ value, label, valueColor }: StatCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.white, borderColor: colors.border }]}>
      <Text style={[styles.value, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 12,
    padding: 11,
    alignItems: 'center',
    borderWidth: 0.5,
  },
  value: {
    fontSize: 21,
    fontWeight: '500',
  },
  label: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 14,
  },
});
