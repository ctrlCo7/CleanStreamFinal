import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { Badge } from '../../components/common/Badge';
import { useAppSelector } from '../../store/hooks';
import { subscribeToConversations } from '../../services/messagingService';
import { createAnnouncement } from '../../services/announcementService';
import { Conversation, RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface AlertItem { id: string; title: string; body: string; level: 'critical' | 'high' | 'moderate' | 'info'; reportId?: string }

export default function AdminAlertsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAppSelector((s) => s.auth);
  const { reports } = useAppSelector((s) => s.reports);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [composerOpen, setComposerOpen] = useState(false);
  const [instructionTitle, setInstructionTitle] = useState('');
  const [instructionBody, setInstructionBody] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToConversations(user.uid, setConversations);
    return unsub;
  }, [user?.uid]);

  const openReports = (severity: string) =>
    reports.filter((r) => r.severity === severity && r.status !== 'completed' && r.status !== 'rejected' && r.status !== 'cancelled');

  const unreadConvCount = conversations.filter((c) => (c.unreadCounts?.[user?.uid ?? ''] || 0) > 0).length;

  const alerts: AlertItem[] = [
    ...openReports('critical').map((r) => ({
      id: r.id,
      reportId: r.id,
      level: 'critical' as const,
      title: `CRITICAL — ${r.location?.barangay || r.barangay || 'Unknown'}`,
      body: `${r.aiAnalysis?.wasteTypes?.[0]?.label || 'Waste detected'} · CNN ${r.aiAnalysis?.confidence != null ? `${r.aiAnalysis.confidence}%` : '—'}`,
    })),
    ...openReports('high').map((r) => ({
      id: r.id,
      reportId: r.id,
      level: 'high' as const,
      title: `High — ${r.location?.barangay || r.barangay || 'Unknown'}`,
      body: `${r.aiAnalysis?.wasteTypes?.[0]?.label || 'Waste detected'} · awaiting dispatch`,
    })),
    ...openReports('moderate').slice(0, 5).map((r) => ({
      id: r.id,
      reportId: r.id,
      level: 'moderate' as const,
      title: `Moderate — ${r.location?.barangay || r.barangay || 'Unknown'}`,
      body: `${r.aiAnalysis?.wasteTypes?.[0]?.label || 'Waste detected'} · pending review`,
    })),
    ...(unreadConvCount > 0
      ? [{
          id: 'unread_messages',
          level: 'info' as const,
          title: `${unreadConvCount} unread conversation${unreadConvCount > 1 ? 's' : ''}`,
          body: 'Open Messages to reply',
        }]
      : []),
  ];

  const dismiss = (id: string) => setDismissed((prev) => new Set(prev).add(id));
  const clearAll = () => setDismissed(new Set(alerts.map((a) => a.id)));

  const visible = alerts.filter((a) => !dismissed.has(a.id));
  const grouped = {
    critical: visible.filter((a) => a.level === 'critical'),
    high: visible.filter((a) => a.level === 'high'),
    moderate: visible.filter((a) => a.level === 'moderate'),
    info: visible.filter((a) => a.level === 'info'),
  };

  const LEVEL_STYLES: Record<string, { bg: string; border: string; titleColor: string }> = {
    critical: { bg: colors.criticalBg, border: 'rgba(192,57,43,0.2)', titleColor: colors.criticalText },
    high: { bg: colors.redBg, border: 'rgba(226,75,74,0.22)', titleColor: colors.redText },
    moderate: { bg: colors.white, border: colors.border, titleColor: colors.textPrimary },
    info: { bg: colors.white, border: colors.border, titleColor: colors.textPrimary },
  };

  const DOT_COLORS: Record<string, string> = { critical: colors.critical, high: colors.red, moderate: colors.amber, info: colors.blue };

  const handlePress = (alert: AlertItem) => {
    if (alert.reportId) {
      navigation.navigate('AdminSchedule', { reportId: alert.reportId });
      return;
    }
    if (alert.id === 'unread_messages') {
      navigation.navigate('AdminTabs', {} as never);
      return;
    }
    dismiss(alert.id);
  };

  const handlePostInstruction = async () => {
    if (!user || posting) return;
    if (!instructionTitle.trim() || !instructionBody.trim()) {
      Alert.alert('Missing fields', 'Please enter both a title and a message.');
      return;
    }
    setPosting(true);
    try {
      await createAnnouncement({
        title: instructionTitle.trim(),
        content: instructionBody.trim(),
        authorId: user.uid,
        authorName: `${user.firstName} ${user.lastName}`,
        targetRoles: ['barangay'],
        targetBarangayIds: [],
        priority: urgent ? 'urgent' : 'normal',
        type: 'general',
        attachmentURLs: [],
        isPinned: false,
        isActive: true,
        publishedAt: new Date().toISOString(),
      });
      setInstructionTitle('');
      setInstructionBody('');
      setUrgent(false);
      setComposerOpen(false);
      Alert.alert('Instruction sent', 'Barangay officials will see this on their dashboard.');
    } catch {
      Alert.alert('Error', 'Failed to post instruction. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Alerts</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={styles.clearBtn} onPress={() => setComposerOpen((v) => !v)}>
            <Text style={styles.clearBtnText}>{composerOpen ? 'Cancel' : '+ Instruction'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
            <Text style={styles.clearBtnText}>Clear all</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {composerOpen && (
          <View style={styles.composer}>
            <Text style={styles.composerLabel}>Post instruction to barangay officials</Text>
            <TextInput
              style={styles.composerInput}
              placeholder="Title"
              placeholderTextColor={colors.textHint}
              value={instructionTitle}
              onChangeText={setInstructionTitle}
            />
            <TextInput
              style={[styles.composerInput, styles.composerTextarea]}
              placeholder="Message..."
              placeholderTextColor={colors.textHint}
              value={instructionBody}
              onChangeText={setInstructionBody}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
            <TouchableOpacity style={styles.urgentToggle} onPress={() => setUrgent((v) => !v)}>
              <View style={[styles.checkbox, urgent && { backgroundColor: colors.critical, borderColor: colors.critical }]} />
              <Text style={styles.composerLabel}>Mark as urgent</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.postBtn} onPress={handlePostInstruction} disabled={posting}>
              {posting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.postBtnText}>Send to barangay officials</Text>}
            </TouchableOpacity>
          </View>
        )}

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
                    onPress={() => handlePress(alert)}
                    onLongPress={() => dismiss(alert.id)}
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

const createStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  header: {
    backgroundColor: Colors.white, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 16, fontWeight: '500', color: Colors.textPrimary },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  clearBtnText: { fontSize: 12, color: Colors.teal },
  composer: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 12, gap: 8,
    borderWidth: 0.5, borderColor: Colors.border, marginBottom: 4,
  },
  composerLabel: { fontSize: 11, fontWeight: '500', color: Colors.textPrimary },
  composerInput: {
    backgroundColor: Colors.grayBg, borderRadius: 10, borderWidth: 0.5, borderColor: Colors.border,
    paddingHorizontal: 11, paddingVertical: 9, fontSize: 12, color: Colors.textPrimary,
  },
  composerTextarea: { minHeight: 80 },
  urgentToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: Colors.borderMid },
  postBtn: { backgroundColor: Colors.blue, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  postBtnText: { fontSize: 12, fontWeight: '500', color: '#fff' },
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
