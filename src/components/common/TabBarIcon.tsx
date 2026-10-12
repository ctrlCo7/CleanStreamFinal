import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TabBarIconProps {
  focused: boolean;
  color: string;
  icon: React.ReactNode;
  label: string;
  activeBg: string;
}

/** Pill-shaped active-tab indicator (icon + label highlighted together when
 * focused), shared across all three bottom tab navigators. */
export function TabBarIcon({ focused, color, icon, label, activeBg }: TabBarIconProps) {
  return (
    <View style={[styles.wrap, focused && { backgroundColor: activeBg }]}>
      {icon}
      <Text style={[styles.label, { color }, focused && styles.labelActive]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    minWidth: 56,
  },
  label: { fontSize: 10, fontWeight: '600' },
  labelActive: { fontWeight: '700' },
});
