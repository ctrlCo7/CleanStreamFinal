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
    <View style={[styles.card, { backgroundColor: colors.white, shadowColor: colors.shadow }]}>
      <Text style={[styles.value, { color: valueColor ?? colors.textPrimary }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 15,
  },
});
