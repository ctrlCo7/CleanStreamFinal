import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

interface StatCardProps {
  value: string | number;
  label: string;
  valueColor?: string;
}

export function StatCard({ value, label, valueColor = Colors.textPrimary }: StatCardProps) {
  return (
    <View style={styles.card}>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 11,
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  value: {
    fontSize: 21,
    fontWeight: '500',
  },
  label: {
    fontSize: 10,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
    lineHeight: 14,
  },
});
