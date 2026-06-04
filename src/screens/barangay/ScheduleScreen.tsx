import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert } from 'react-native';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH = 'April 2026';

const CALENDAR_WEEKS = [
  [null, null, 1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10, 11, 12],
  [13, 14, 15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24, 25, 26],
  [27, 28, 29, 30, null, null, null],
];

const EVENT_DAYS: Record<number, { color: string; label: string }> = {
  3: { color: Colors.critical, label: 'Critical' },
  5: { color: Colors.teal, label: 'Cleanup' },
  6: { color: Colors.teal, label: 'Cleanup' },
  12: { color: Colors.amber, label: 'Moderate' },
  18: { color: Colors.teal, label: 'Cleanup' },
};

const SCHEDULED = [
  { id: 's1', title: 'Guadalupe hazmat cleanup', date: 'April 5, 2026', time: '6:00 AM – 2:00 PM', team: 'Team B — Hazmat specialists', status: 'confirmed', severity: 'critical' as const },
  { id: 's2', title: 'Punta Princesa plastic sweep', date: 'April 6, 2026', time: '7:00 AM – 12:00 PM', team: 'Team A — General cleanup', status: 'confirmed', severity: 'high' as const },
  { id: 's3', title: 'Kinasang-an waste collection', date: 'April 12, 2026', time: '8:00 AM – 11:00 AM', team: 'Team C — Standard cleanup', status: 'pending', severity: 'moderate' as const },
  { id: 's4', title: 'Labangon River inspection', date: 'April 18, 2026', time: '7:00 AM – 9:00 AM', team: 'Team D — Heavy machinery', status: 'pending', severity: 'high' as const },
];

export default function BarangayScheduleScreen() {
  const { user } = useAppSelector((s) => s.auth);
  const [selectedDay, setSelectedDay] = useState<number | null>(5);

  const todayEvents = selectedDay ? SCHEDULED.filter((s) => {
    const dayMatch = s.date.includes(`April ${selectedDay}`);
    return dayMatch;
  }) : [];

  const handleConfirm = (id: string) => {
    Alert.alert('Confirmed', 'You have confirmed attendance for this cleanup task.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Schedule</Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>BHW Officer</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Calendar */}
        <View style={styles.calCard}>
          <Text style={styles.calMonth}>{MONTH}</Text>
          <View style={styles.calDayRow}>
            {DAYS.map((d) => (
              <Text key={d} style={styles.calDayLabel}>{d}</Text>
            ))}
          </View>
          {CALENDAR_WEEKS.map((week, wi) => (
            <View key={wi} style={styles.calWeekRow}>
              {week.map((day, di) => {
                const event = day ? EVENT_DAYS[day] : null;
                const isSelected = day === selectedDay;
                return (
                  <TouchableOpacity
                    key={di}
                    style={[styles.calCell, isSelected && styles.calCellSelected]}
                    onPress={() => day && setSelectedDay(day)}
                    disabled={!day}
                  >
                    {day ? (
                      <>
                        <Text style={[styles.calDayNum, isSelected && styles.calDayNumSelected]}>{day}</Text>
                        {event && <View style={[styles.calDot, { backgroundColor: event.color }]} />}
                      </>
                    ) : <Text style={styles.calDayNum}> </Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          {/* Legend */}
          <View style={styles.calLegend}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.teal }]} /><Text style={styles.legendText}>Cleanup</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.critical }]} /><Text style={styles.legendText}>Critical</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.amber }]} /><Text style={styles.legendText}>Moderate</Text></View>
          </View>
        </View>

        {/* Day events */}
        {selectedDay && (
          <View style={styles.daySectionHeader}>
            <Text style={styles.daySectionTitle}>April {selectedDay} events</Text>
          </View>
        )}

        {/* All scheduled cleanups */}
        <View style={styles.daySectionHeader}>
          <Text style={styles.daySectionTitle}>All scheduled cleanups</Text>
        </View>

        {SCHEDULED.map((item) => (
          <View key={item.id} style={styles.schedCard}>
            <View style={[styles.schedLeft, { backgroundColor: item.severity === 'critical' ? Colors.criticalBg : item.severity === 'high' ? Colors.redBg : Colors.tealLight }]}>
              <View style={[styles.schedDot, { backgroundColor: item.severity === 'critical' ? Colors.critical : item.severity === 'high' ? Colors.red : Colors.teal }]} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.schedTitle}>{item.title}</Text>
              <Text style={styles.schedDate}>{item.date}</Text>
              <Text style={styles.schedTime}>{item.time}</Text>
              <Text style={styles.schedTeam}>{item.team}</Text>
              <View style={styles.schedBadgeRow}>
                <Badge variant={item.severity} label={item.severity.charAt(0).toUpperCase() + item.severity.slice(1)} />
                <Badge variant={item.status === 'confirmed' ? 'resolved' : 'pending'} label={item.status === 'confirmed' ? 'Confirmed' : 'Pending confirm'} />
              </View>
              {item.status === 'pending' && (
                <TouchableOpacity style={styles.confirmBtn} onPress={() => handleConfirm(item.id)}>
                  <Text style={styles.confirmBtnText}>Confirm attendance</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
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
  rolePill: { backgroundColor: Colors.brgyLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  rolePillText: { fontSize: 10, color: Colors.brgyDark, fontWeight: '500' },
  body: { padding: 14, gap: 10, paddingBottom: 28 },
  calCard: { backgroundColor: Colors.white, borderRadius: 14, padding: 13, borderWidth: 0.5, borderColor: Colors.border },
  calMonth: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary, textAlign: 'center', marginBottom: 10 },
  calDayRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  calDayLabel: { fontSize: 9, color: Colors.textMuted, width: 34, textAlign: 'center', fontWeight: '500' },
  calWeekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 2 },
  calCell: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  calCellSelected: { backgroundColor: Colors.brgy },
  calDayNum: { fontSize: 12, color: Colors.textPrimary },
  calDayNumSelected: { color: '#fff', fontWeight: '500' },
  calDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 1 },
  calLegend: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 10, color: Colors.textMuted },
  daySectionHeader: { marginTop: 4 },
  daySectionTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  schedCard: {
    backgroundColor: Colors.white, borderRadius: 13, borderWidth: 0.5, borderColor: Colors.border,
    flexDirection: 'row', overflow: 'hidden',
  },
  schedLeft: { width: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  schedDot: { width: 0 },
  schedTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, padding: 11, paddingBottom: 2 },
  schedDate: { fontSize: 10, color: Colors.textMuted, paddingHorizontal: 11 },
  schedTime: { fontSize: 10, color: Colors.textPrimary, paddingHorizontal: 11, fontWeight: '500', marginTop: 2 },
  schedTeam: { fontSize: 10, color: Colors.textMuted, paddingHorizontal: 11, marginTop: 2 },
  schedBadgeRow: { flexDirection: 'row', gap: 5, paddingHorizontal: 11, marginTop: 6 },
  confirmBtn: { marginHorizontal: 11, marginTop: 8, marginBottom: 11, backgroundColor: Colors.brgy, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  confirmBtnText: { fontSize: 11, fontWeight: '500', color: '#fff' },
});
