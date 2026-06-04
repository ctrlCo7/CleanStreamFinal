import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../../constants/colors';

interface BarData {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarData[];
  maxValue?: number;
  height?: number;
  title?: string;
}

export function BarChart({ data, maxValue, height = 70, title }: BarChartProps) {
  const max = maxValue || Math.max(...data.map((d) => d.value), 1);

  return (
    <View style={styles.card}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={[styles.chart, { height }]}>
        {data.map((d, i) => {
          const barH = Math.max(3, (d.value / max) * height * 0.9);
          return (
            <View key={i} style={styles.col}>
              <View
                style={[
                  styles.bar,
                  { height: barH, backgroundColor: d.color || Colors.teal },
                ]}
              />
              <Text style={styles.label}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 12,
    borderWidth: 0.5,
    borderColor: Colors.border,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 3,
  },
  label: {
    fontSize: 8,
    color: Colors.textHint,
  },
});
