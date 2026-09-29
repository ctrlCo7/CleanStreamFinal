import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { Badge } from '../../components/common/Badge';
import { BackIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { subscribeToNotifications, markNotificationRead, markAllNotificationsRead } from '../../services/notificationService';
import { Notification, NotificationType, RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function buildTypeColors(colors: ThemeColors): Record<NotificationType, string> {
  return {
    report_submitted: colors.blue,
    report_verified: colors.purple,
    report_assigned: colors.amber,
    report_in_progress: colors.amber,
    report_completed: colors.teal,
    report_rejected: colors.red,
    task_assigned: colors.amber,
    task_updated: colors.amber,
    event_reminder: colors.blue,
    announcement: colors.purple,
    message: colors.blue,
    ai_result: colors.purple,
    system: colors.grayMuted,
  };
}

function sectionFor(date: Date): 'Today' | 'Yesterday' | 'Earlier' {
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return 'Earlier';
}

export default function CitizenNotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const TYPE_COLORS = useMemo(() => buildTypeColors(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAppSelector((s) => s.auth);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToNotifications(user.uid, (n) => {
      setNotifs(n);
      setLoading(false);
    });
    return unsub;
  }, [user?.uid]);

  const clearAll = () => {
    if (!user?.uid) return;
    markAllNotificationsRead(user.uid).catch(() => null);
  };

  const handlePress = (notif: Notification) => {
    if (!notif.read) markNotificationRead(notif.id).catch(() => null);
    if (notif.reportId) navigation.navigate('CitizenDetail', { reportId: notif.reportId });
  };

  const sections: Array<'Today' | 'Yesterday' | 'Earlier'> = ['Today', 'Yesterday', 'Earlier'];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={clearAll} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>Clear all</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {loading && (
          <ActivityIndicator size="small" color={colors.teal} style={{ marginVertical: 16, alignSelf: 'center' }} />
        )}

        {!loading && notifs.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No notifications yet</Text>
          </View>
        )}

        {sections.map((section) => {
          const items = notifs.filter((n) => sectionFor(new Date(n.createdAt)) === section);
          if (!items.length) return null;
          return (
            <View key={section}>
              <Text style={styles.sectionHdr}>{section}</Text>
              {items.map((notif) => {
                const color = TYPE_COLORS[notif.type] ?? colors.grayMuted;
                const isCritical = notif.severity === 'critical';
                return (
                  <TouchableOpacity
                    key={notif.id}
                    style={[styles.notifItem, isCritical && styles.notifCritical]}
                    onPress={() => handlePress(notif)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.dot, { backgroundColor: color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.notifTitle, isCritical && { color: colors.criticalText }]}>
                        {notif.title}
                      </Text>
                      <Text style={styles.notifBody}>{notif.body}</Text>
                      {notif.severity && (
                        <View style={{ marginTop: 5 }}>
                          <Badge variant={notif.severity} />
                        </View>
                      )}
                    </View>
                    {!notif.read && <View style={styles.unreadDot} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  clearBtnText: { fontSize: 12, color: Colors.teal },
  body: { padding: 14, gap: 6, paddingBottom: 20 },
  emptyCard: { backgroundColor: Colors.white, borderRadius: 12, padding: 32, alignItems: 'center', borderWidth: 0.5, borderColor: Colors.border },
  emptyText: { fontSize: 12, color: Colors.textHint },
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
