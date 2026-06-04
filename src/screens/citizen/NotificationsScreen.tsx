import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Colors } from '../../constants/colors';
import { Badge } from '../../components/common/Badge';

interface NotifItem {
  id: string;
  title: string;
  body: string;
  type: 'critical' | 'resolved' | 'update' | 'message' | 'ai';
  section: 'Today' | 'Yesterday';
  read: boolean;
}

const MOCK_NOTIFS: NotifItem[] = [
  { id: '1', title: 'Critical — Guadalupe Waterway', body: 'Hazardous waste. Avoid contact.', type: 'critical', section: 'Today', read: false },
  { id: '2', title: 'Cleanup complete — Labangon', body: 'Report #065 resolved. Area clean! · 2h ago', type: 'resolved', section: 'Today', read: false },
  { id: '3', title: 'Status update — Punta Princesa', body: 'Cleanup team dispatched. ETA: Apr 5, 7 AM', type: 'update', section: 'Today', read: true },
  { id: '4', title: 'Admin replied', body: 'Team A arrives Apr 5 at 7 AM', type: 'message', section: 'Yesterday', read: true },
  { id: '5', title: 'AI analysis complete', body: 'Report #082: Plastic 72% + Hazardous 9%', type: 'ai', section: 'Yesterday', read: true },
];

const NOTIF_COLORS: Record<string, string> = {
  critical: Colors.critical,
  resolved: Colors.teal,
  update: Colors.amber,
  message: Colors.blue,
  ai: Colors.purple,
};

export default function CitizenNotificationsScreen() {
  const [notifs, setNotifs] = useState(MOCK_NOTIFS);

  const clearAll = () => setNotifs((n) => n.map((x) => ({ ...x, read: true })));

  const sections = ['Today', 'Yesterday'] as const;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {sections.map((section) => {
          const items = notifs.filter((n) => n.section === section);
          if (!items.length) return null;
          return (
            <View key={section}>
              <Text style={styles.sectionHdr}>{section}</Text>
              {items.map((notif) => (
                <TouchableOpacity
                  key={notif.id}
                  style={[styles.notifItem, notif.type === 'critical' && styles.notifCritical]}
                  onPress={() => setNotifs((n) => n.map((x) => x.id === notif.id ? { ...x, read: true } : x))}
                  activeOpacity={0.85}
                >
                  <View style={[styles.dot, { backgroundColor: NOTIF_COLORS[notif.type] }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, notif.type === 'critical' && { color: Colors.criticalText }]}>
                      {notif.title}
                    </Text>
                    <Text style={styles.notifBody}>{notif.body}</Text>
                    {notif.type === 'critical' && (
                      <View style={{ marginTop: 5 }}>
                        <Badge variant="critical" label="Stay away" />
                      </View>
                    )}
                    {notif.type === 'resolved' && (
                      <View style={{ marginTop: 5 }}>
                        <Badge variant="resolved" label="Resolved ✓" />
                      </View>
                    )}
                  </View>
                  {!notif.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              ))}
            </View>
          );
        })}
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
  sectionHdr: {
    fontSize: 10, fontWeight: '500', color: Colors.textMuted,
    letterSpacing: 0.04, textTransform: 'uppercase', marginTop: 4, marginBottom: 4,
  },
  notifItem: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 11,
    paddingHorizontal: 13, borderWidth: 0.5, borderColor: Colors.border,
    flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 6,
  },
  notifCritical: { backgroundColor: Colors.criticalBg, borderColor: 'rgba(192,57,43,0.22)' },
  dot: { width: 9, height: 9, borderRadius: 4.5, flexShrink: 0, marginTop: 3 },
  notifTitle: { fontSize: 12, fontWeight: '500', color: Colors.textPrimary },
  notifBody: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.teal, marginTop: 3 },
});
