import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../constants/colors';

interface DonutSegment {
  label: string;
  percentage: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  total?: number | string;
  title?: string;
}

export function DonutChart({ segments, total, title }: DonutChartProps) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <View style={styles.card}>
      {title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.row}>
        <Svg width={80} height={80} viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
          <Circle cx="40" cy="40" r={radius} fill="none" stroke={Colors.grayBg} strokeWidth="14" />
          {segments.map((seg, i) => {
            const dash = (seg.percentage / 100) * circumference;
            const element = (
              <Circle
                key={i}
                cx="40"
                cy="40"
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth="14"
                strokeDasharray={`${dash} ${circumference}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 40 40)"
                strokeLinecap="butt"
              />
            );
            offset += dash;
            return element;
          })}
          {total !== undefined && (
            <SvgText x="40" y="44" textAnchor="middle" fontSize="9" fill={Colors.textMuted}>
              {total}
            </SvgText>
          )}
        </Svg>
        <View style={styles.legend}>
          {segments.map((seg, i) => (
            <View key={i} style={styles.legendRow}>
              <View style={[styles.dot, { backgroundColor: seg.color }]} />
              <Text style={styles.legendText}>{seg.label} {seg.percentage}%</Text>
            </View>
          ))}
        </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legend: {
    flex: 1,
    gap: 5,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 10,
    color: Colors.textSecondary,
  },
});
