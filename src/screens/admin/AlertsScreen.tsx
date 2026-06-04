import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';

interface AlertItem { id: string; title: string; body: string; level: 'critical' | 'high' | 'moderate' | 'info'; visible: boolean }

export default function AdminAlertsScreen() {
  const { reports } = useAppSelector((s) => s.reports);
  const criticalReports = reports.filter((r) => r.severity === 'critical' && r.status !== 'resolved');
  const highReports = reports.filter((r) => r.severity === 'high' && r.status !== 'resolved');

  const [alerts, setAlerts] = useState<AlertItem[]>([
    { id: 'an0', title: 'CRITICAL — Guadalupe', body: 'Hazardous waste · Specialist needed', level: 'critical', visible: true },
    { id: 'an1', title: 'High — Punta Princesa', body: 'Plastic surge · CNN 97.4% · 2 min ago', level: 'high', visible: true },
    { id: 'an2', title: 'High — Labangon River', body: 'Metal debris · 30 min ago', level: 'high', visible: true },
    { id: 'an3', title: 'Moderate — Kinasang-an', body: '3 reports · 1h ago', level: 'moderate', visible: true },
    { id: 'an4', title: '3 new messages', body: 'Juan, Maria, Rico replied', level: 'info', visible: true },
    ...criticalReports.map((r) => ({
      id: r.id, visible: true, level: 'critical' as const,
      title: `CRITICAL — ${r.location?.barangay || 'Unknown'}`,
      body: `${r.aiAnalysis?.wasteTypes[0]?.label || 'Waste'} · CNN: ${r.aiAnalysis?.confidence || '—'}%`,
    })),
    ...highReports.map((r) => ({
      id: r.id + '_high', visible: true, level: 'high' as const,
      title: `High — ${r.location?.barangay || 'Unknown'}`,
      body: `${r.aiAnalysis?.wasteTypes[0]?.label || 'Waste'} · just now`,
    })),
  ]);

  const dismiss = (id: string) => setAlerts((a) => a.map((x) => x.id === id ? { ...x, visible: false } : x));
  const clearAll = () => setAlerts((a) => a.map((x) => ({ ...x, visible: false })));

  const visible = alerts.filter((a) => a.visible);
  const grouped = {
    critical: visible.filter((a) => a.level === 'critical'),
    high: visible.filter((a) => a.level === 'high'),
    moderate: visible.filter((a) => a.level === 'moderate'),
    info: visible.filter((a) => a.level === 'info'),
  };

  const LEVEL_STYLES: Record<string, { bg: string; border: string; titleColor: string }> = {
    critical: { bg: Colors.criticalBg, border: 'rgba(192,57,43,0.2)', titleColor: Colors.criticalText },
    high: { bg: Colors.redBg, border: 'rgba(226,75,74,0.22)', titleColor: Colors.redText },
    moderate: { bg: Colors.white, border: Colors.border, titleColor: Colors.textPrimary },
    info: { bg: Colors.white, border: Colors.border, titleColor: Colors.textPrimary },
  };

  const DOT_COLORS: Record<string, string> = { critical: Colors.critical, high: Colors.red, moderate: Colors.amber, info: Colors.blue };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
        <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
          <Text style={styles.clearBtnText}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {Object.entries(grouped).map(([level, items]) => {
          if (!items.length) return null;
          const sLabel = level.charAt(0).toUpperCase() + level.slice(1);
          return (
            <View key={level}>
              <Text style={styles.sectionHdr}>{sLabel === 'Info' ? 'Updates' : `${sLabel} priority`}</Text>
              {items.map((alert) => {
                const s = LEVEL_STYLES[alert.level];
                return (
                  <TouchableOpacity
                    key={alert.id}
                    style={[styles.alertItem, { backgroundColor: s.bg, borderColor: s.border }]}
                    onPress={() => dismiss(alert.id)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.dot, { backgroundColor: DOT_COLORS[alert.level] }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.alertTitle, { color: s.titleColor }]}>{alert.title}</Text>
                      <Text style={[styles.alertBody, { color: s.titleColor, opacity: 0.8 }]}>{alert.body}</Text>
                      {alert.level === 'critical' && (
                        <View style={{ marginTop: 5 }}>
                          <Badge variant="critical" label="Immediate" />
                        </View>
                      )}
                      {alert.level === 'high' && (
                        <View style={{ marginTop: 5 }}>
                          <Badge variant="high" label="Dispatch" />
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
        {visible.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No active alerts</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  clearBtnText: { fontSize: 12, color: Colors.teal },
  body: { padding: 14, gap: 6, paddingBottom: 20 },
  sectionHdr: { fontSize: 10, fontWeight: '500', color: Colors.textMuted, letterSpacing: 0.04, textTransform: 'uppercase', marginTop: 4, marginBottom: 4 },
  alertItem: {
    borderRadius: 12, padding: 11, paddingHorizontal: 13,
    borderWidth: 0.5, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 6,
  },
  dot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0, marginTop: 3 },
  alertTitle: { fontSize: 12, fontWeight: '500' },
  alertBody: { fontSize: 11, marginTop: 2 },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 32, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
});
