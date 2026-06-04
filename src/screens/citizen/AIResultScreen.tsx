import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Svg, { Path, Circle } from 'react-native-svg';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../types';
import { Badge } from '../../components/common/Badge';
import { BackIcon, CheckIcon } from '../../components/common/TabIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'CitizenAIResult'>;

const SEV_COLORS = {
  critical: Colors.critical,
  high: Colors.red,
  moderate: Colors.amber,
  low: Colors.teal,
};

export default function CitizenAIResultScreen({ navigation, route }: Props) {
  const { report } = route.params;
  const ai = report.aiAnalysis;

  if (!ai) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.noAI}>No AI result available.</Text>
      </SafeAreaView>
    );
  }

  const sevColor = SEV_COLORS[ai.severityLevel] || Colors.amber;
  const sevScore = ai.severityScore;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const dashArray = (sevScore / 100) * circumference;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>AI Analysis</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* AI header banner */}
        <View style={styles.aiBanner}>
          <View style={styles.aiIcon}>
            <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
              <Path d="M12 2L2 7l10 5 10-5-10-5z" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <Path d="M2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <View>
            <Text style={styles.aiTitle}>CNN Waste Classifier</Text>
            <Text style={styles.aiSub}>Model {ai.modelVersion} · Real-time detection</Text>
            <View style={styles.confBadge}>
              <Text style={styles.confText}>{ai.confidence}% confidence</Text>
            </View>
          </View>
        </View>

        {/* Severity ring */}
        <View style={styles.sevCard}>
          <Text style={styles.sevCardTitle}>Severity Assessment</Text>
          <View style={styles.sevRow}>
            <Svg width={96} height={96} viewBox="0 0 96 96">
              <Circle cx="48" cy="48" r={radius} fill="none" stroke={Colors.grayBg} strokeWidth="9" />
              <Circle
                cx="48" cy="48" r={radius} fill="none"
                stroke={sevColor} strokeWidth="9"
                strokeDasharray={`${dashArray} ${circumference}`}
                strokeDashoffset={60}
                strokeLinecap="round"
                transform="rotate(-90 48 48)"
              />
            </Svg>
            <View style={styles.sevOverlay}>
              <Text style={[styles.sevScore, { color: sevColor }]}>{sevScore}</Text>
              <Text style={styles.sevMax}>/100</Text>
            </View>
            <View style={styles.sevDesc}>
              <Text style={[styles.sevLevel, { color: sevColor }]}>{ai.severityLevel.toUpperCase()} severity</Text>
              <Text style={styles.sevDescText}>
                {ai.severityLevel === 'critical' || ai.severityLevel === 'high'
                  ? 'Significant waste. Immediate cleanup dispatch recommended.'
                  : 'Moderate waste accumulation. Schedule cleanup within 48 hours.'}
              </Text>
              <Badge variant={ai.severityLevel} label="Cleanup needed" />
            </View>
          </View>
        </View>

        {/* Waste classification */}
        <Text style={styles.sectionTitle}>5-Type Waste Classification</Text>
        <View style={styles.wasteGrid}>
          {ai.wasteTypes.map((wt) => (
            <View key={wt.type} style={[styles.wasteCard, wt.type === 'electronic' && { gridColumn: 'span 2' }]}>
              <Text style={styles.wasteName}>{wt.label}</Text>
              <View style={styles.wasteBar}>
                <View style={[styles.wasteFill, { width: `${wt.percentage}%` as never, backgroundColor: wt.color }]} />
              </View>
              <Text style={styles.wastePct}>{wt.percentage}%</Text>
            </View>
          ))}
        </View>

        {/* Volume card */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>Estimated Volume & Priority</Text>
          {[
            { k: 'Volume', v: `~${ai.estimatedVolume} cubic meters` },
            { k: 'Spread area', v: `~${ai.spreadArea} m²` },
            { k: 'Hazardous detected', v: ai.hazardousDetected ? 'Yes — Hazardous material' : 'No', red: ai.hazardousDetected },
            { k: 'Team needed', v: ai.teamNeeded },
          ].map((row) => (
            <View key={row.k} style={styles.infoRow}>
              <Text style={styles.infoKey}>{row.k}</Text>
              <Text style={[styles.infoVal, row.red && { color: Colors.red }]}>{row.v}</Text>
            </View>
          ))}
        </View>

        {/* Priority card */}
        <View style={[styles.priorityCard, { backgroundColor: `${sevColor}18`, borderColor: `${sevColor}40` }]}>
          <View style={[styles.priorityIcon, { backgroundColor: `${sevColor}25` }]}>
            <Svg width={18} height={18} viewBox="0 0 16 16" fill="none">
              <Path d="M8 2v6M8 12v1" stroke={sevColor} strokeWidth="2" strokeLinecap="round" />
              <Circle cx="8" cy="8" r="6" stroke={sevColor} strokeWidth="2" />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.priorityTitle, { color: sevColor }]}>
              {ai.severityLevel.charAt(0).toUpperCase() + ai.severityLevel.slice(1)} Priority Cleanup
            </Text>
            <Text style={[styles.priorityDesc, { color: sevColor, opacity: 0.8 }]}>
              {ai.cleanupPriority}
            </Text>
          </View>
        </View>

        {/* Validated */}
        <View style={styles.validatedCard}>
          <CheckIcon color={Colors.tealDark} size={16} />
          <View>
            <Text style={styles.validatedTitle}>Report validated & submitted</Text>
            <Text style={styles.validatedSub}>GPS verified · Camera watermark applied</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => navigation.navigate('CitizenTabs', {} as never)}
        >
          <Text style={styles.historyBtnText}>View in history</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  noAI: { textAlign: 'center', marginTop: 40, color: Colors.textMuted },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 14, gap: 10, paddingBottom: 24 },
  aiBanner: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    borderRadius: 14, padding: 14,
    backgroundColor: Colors.tealDeep,
    backgroundImage: 'linear-gradient(135deg, #085041, #1D9E75)' as never,
  },
  aiIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  aiTitle: { fontSize: 15, fontWeight: '500', color: '#fff' },
  aiSub: { fontSize: 11, color: 'rgba(255,255,255,0.72)', marginTop: 2 },
  confBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, marginTop: 4, alignSelf: 'flex-start' },
  confText: { fontSize: 10, fontWeight: '500', color: '#fff' },
  sevCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 12, borderWidth: 0.5, borderColor: Colors.border },
  sevCardTitle: { fontSize: 12, fontWeight: '500', marginBottom: 10, color: Colors.textPrimary },
  sevRow: { flexDirection: 'row', alignItems: 'center' },
  sevOverlay: { position: 'absolute', left: 0, width: 96, alignItems: 'center' },
  sevScore: { fontSize: 20, fontWeight: '600' },
  sevMax: { fontSize: 9, color: Colors.textMuted },
  sevDesc: { flex: 1, marginLeft: 14, gap: 4 },
  sevLevel: { fontSize: 14, fontWeight: '500' },
  sevDescText: { fontSize: 11, color: Colors.textMuted, lineHeight: 15 },
  sectionTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  wasteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  wasteCard: {
    width: '47%', backgroundColor: Colors.white, borderRadius: 12,
    padding: 10, borderWidth: 0.5, borderColor: Colors.border, gap: 4,
  },
  wasteName: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  wasteBar: { height: 5, backgroundColor: Colors.grayBg, borderRadius: 3, overflow: 'hidden' },
  wasteFill: { height: '100%', borderRadius: 3 },
  wastePct: { fontSize: 10, color: Colors.textMuted },
  infoCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 11, borderWidth: 0.5, borderColor: Colors.border },
  infoCardTitle: { fontSize: 12, fontWeight: '500', marginBottom: 8, color: Colors.textPrimary },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  infoKey: { fontSize: 11, color: Colors.textMuted },
  infoVal: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  priorityCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 11, borderWidth: 0.5 },
  priorityIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  priorityTitle: { fontSize: 12, fontWeight: '500' },
  priorityDesc: { fontSize: 11, marginTop: 2 },
  validatedCard: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: Colors.tealLight, borderRadius: 11, padding: 9,
  },
  validatedTitle: { fontSize: 12, fontWeight: '500', color: Colors.tealDark },
  validatedSub: { fontSize: 10, color: Colors.tealDark, opacity: 0.8 },
  historyBtn: {
    borderWidth: 1, borderColor: Colors.teal, borderRadius: 12,
    paddingVertical: 11, alignItems: 'center', backgroundColor: Colors.white,
  },
  historyBtnText: { fontSize: 12, fontWeight: '500', color: Colors.teal },
});
