import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';
import { CleanupEvent } from '../../types';
import { subscribeToUpcomingEvents, joinEvent, leaveEvent } from '../../services/cleanupEventService';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildCalendar(year: number, month: number): (number | null)[][] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Mon=0
  const flat: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (flat.length % 7 !== 0) flat.push(null);
  return Array.from({ length: flat.length / 7 }, (_, i) => flat.slice(i * 7, i * 7 + 7));
}

export default function BarangayScheduleScreen() {
  const { user } = useAppSelector((s) => s.auth);
  const [events, setEvents] = useState<CleanupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(now.getDate());

  const MONTH_LABEL = new Date(viewYear, viewMonth, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const weeks = useMemo(() => buildCalendar(viewYear, viewMonth), [viewYear, viewMonth]);

  useEffect(() => {
    const unsub = subscribeToUpcomingEvents((incoming) => {
      setEvents(incoming);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Map event dates to dot colors
  const eventDayMap = useMemo(() => {
    const map: Record<number, string> = {};
    events.forEach((e) => {
      try {
        const d = new Date(e.eventDate);
        if (d.getFullYear() === viewYear && d.getMonth() === viewMonth) {
          const day = d.getDate();
          const color = e.barangay === user?.barangay ? Colors.teal : Colors.amber;
          if (!map[day]) map[day] = color;
        }
      } catch { /* skip malformed dates */ }
    });
    return map;
  }, [events, viewYear, viewMonth, user?.barangay]);

  // Events on selected day
  const dayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return events.filter((e) => {
      try {
        const d = new Date(e.eventDate);
        return d.getFullYear() === viewYear && d.getMonth() === viewMonth && d.getDate() === selectedDay;
      } catch { return false; }
    });
  }, [events, selectedDay, viewYear, viewMonth]);

  const handleJoin = async (event: CleanupEvent) => {
    if (!user) return;
    const isJoined = event.participantIds?.includes(user.uid);
    setJoiningId(event.id);
    try {
      if (isJoined) {
        await leaveEvent(event.id, user.uid);
        Alert.alert('Left event', `You have left "${event.title}".`);
      } else {
        await joinEvent(event.id, {
          userId: user.uid,
          userName: `${user.firstName} ${user.lastName}`,
        });
        Alert.alert('Joined!', `You are registered for "${event.title}".`);
      }
    } catch {
      Alert.alert('Error', 'Could not update attendance. Please try again.');
    } finally {
      setJoiningId(null);
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
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
          <View style={styles.calNav}>
            <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
              <Text style={styles.navArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.calMonth}>{MONTH_LABEL}</Text>
            <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
              <Text style={styles.navArrow}>›</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.calDayRow}>
            {DAYS.map((d) => (
              <Text key={d} style={styles.calDayLabel}>{d}</Text>
            ))}
          </View>
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.calWeekRow}>
              {week.map((day, di) => {
                const dotColor = day ? eventDayMap[day] : null;
                const isSelected = day === selectedDay;
                const isToday = day === now.getDate() && viewMonth === now.getMonth() && viewYear === now.getFullYear();
                return (
                  <TouchableOpacity
                    key={di}
                    style={[styles.calCell, isSelected && styles.calCellSelected, isToday && !isSelected && styles.calCellToday]}
                    onPress={() => day && setSelectedDay(day)}
                    disabled={!day}
                  >
                    {day ? (
                      <>
                        <Text style={[styles.calDayNum, isSelected && styles.calDayNumSelected, isToday && !isSelected && styles.calDayNumToday]}>{day}</Text>
                        {dotColor && <View style={[styles.calDot, { backgroundColor: dotColor }]} />}
                      </>
                    ) : <Text style={styles.calDayNum}> </Text>}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={styles.calLegend}>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.teal }]} /><Text style={styles.legendText}>My barangay</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: Colors.amber }]} /><Text style={styles.legendText}>Other area</Text></View>
          </View>
        </View>

        {/* Selected day events */}
        {selectedDay && dayEvents.length > 0 && (
          <>
            <Text style={styles.daySectionTitle}>{MONTH_LABEL.split(' ')[0]} {selectedDay} events</Text>
            {dayEvents.map((ev) => <EventCard key={ev.id} event={ev} user={user} onJoin={handleJoin} joiningId={joiningId} />)}
          </>
        )}
        {selectedDay && dayEvents.length === 0 && (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayText}>No events on this day</Text>
          </View>
        )}

        {/* All upcoming events */}
        <Text style={styles.daySectionTitle}>All upcoming cleanups</Text>
        {loading && <ActivityIndicator size="small" color={Colors.brgy} style={{ alignSelf: 'center', marginVertical: 12 }} />}
        {!loading && events.length === 0 && (
          <View style={styles.emptyDay}>
            <Text style={styles.emptyDayText}>No upcoming events scheduled</Text>
          </View>
        )}
        {events.map((ev) => <EventCard key={ev.id} event={ev} user={user} onJoin={handleJoin} joiningId={joiningId} />)}
      </ScrollView>
    </SafeAreaView>
  );
}

function EventCard({ event, user, onJoin, joiningId }: {
  event: CleanupEvent;
  user: { uid: string; barangay?: string } | null;
  onJoin: (e: CleanupEvent) => void;
  joiningId: string | null;
}) {
  const isJoined = user ? event.participantIds?.includes(user.uid) : false;
  const isMyBarangay = user?.barangay && event.barangay === user.barangay;
  const isLoading = joiningId === event.id;

  let dateStr = '—';
  try {
    dateStr = new Date(event.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { /* skip */ }

  const accentColor = isMyBarangay ? Colors.brgy : Colors.blue;
  const accentBg = isMyBarangay ? Colors.brgyLight : Colors.blueBg;

  return (
    <View style={[styles.schedCard, { borderLeftColor: accentColor }]}>
      <View style={[styles.schedLeft, { backgroundColor: accentBg }]} />
      <View style={{ flex: 1, padding: 11, paddingLeft: 10 }}>
        <Text style={styles.schedTitle}>{event.title}</Text>
        <Text style={styles.schedBarangay}>{event.barangay}</Text>
        <Text style={styles.schedDate}>{dateStr}</Text>
        <Text style={styles.schedTime}>{event.startTime} – {event.endTime}</Text>
        <View style={styles.schedBadgeRow}>
          <Badge variant={isJoined ? 'low' : 'pending'} label={isJoined ? 'Joined' : 'Open'} />
          <Text style={styles.participantCount}>{event.currentParticipants ?? 0}/{event.maxParticipants ?? '?'} volunteers</Text>
        </View>
        <TouchableOpacity
          style={[styles.joinBtn, { backgroundColor: isJoined ? Colors.grayBg : accentColor }]}
          onPress={() => onJoin(event)}
          disabled={isLoading}
        >
          {isLoading
            ? <ActivityIndicator size="small" color={isJoined ? Colors.textMuted : '#fff'} />
            : <Text style={[styles.joinBtnText, { color: isJoined ? Colors.textMuted : '#fff' }]}>{isJoined ? 'Leave event' : 'Confirm attendance'}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
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
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  navBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontSize: 20, color: Colors.textMuted, fontWeight: '500' },
  calMonth: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  calDayRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  calDayLabel: { fontSize: 9, color: Colors.textMuted, width: 34, textAlign: 'center', fontWeight: '500' },
  calWeekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 2 },
  calCell: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  calCellSelected: { backgroundColor: Colors.brgy },
  calCellToday: { backgroundColor: Colors.brgyLight },
  calDayNum: { fontSize: 12, color: Colors.textPrimary },
  calDayNumSelected: { color: '#fff', fontWeight: '500' },
  calDayNumToday: { color: Colors.brgyDark, fontWeight: '500' },
  calDot: { width: 5, height: 5, borderRadius: 2.5, marginTop: 1 },
  calLegend: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 10, color: Colors.textMuted },
  daySectionTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary, marginTop: 4 },
  emptyDay: { backgroundColor: Colors.white, borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyDayText: { fontSize: 12, color: Colors.textHint },
  schedCard: {
    backgroundColor: Colors.white, borderRadius: 13, borderWidth: 0.5, borderColor: Colors.border,
    borderLeftWidth: 3, flexDirection: 'row', overflow: 'hidden',
  },
  schedLeft: { width: 4 },
  schedTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  schedBarangay: { fontSize: 10, color: Colors.textMuted, marginTop: 1 },
  schedDate: { fontSize: 10, color: Colors.textMuted, marginTop: 3 },
  schedTime: { fontSize: 10, color: Colors.textPrimary, fontWeight: '500', marginTop: 1 },
  schedBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 6 },
  participantCount: { fontSize: 10, color: Colors.textMuted },
  joinBtn: { marginTop: 8, borderRadius: 10, paddingVertical: 8, alignItems: 'center' },
  joinBtnText: { fontSize: 11, fontWeight: '500' },
});
