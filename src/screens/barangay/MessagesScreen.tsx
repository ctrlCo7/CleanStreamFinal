import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { RootStackParamList } from '../../types';
import { useAppSelector } from '../../store/hooks';
import { subscribeToConversations } from '../../services/messagingService';
import { Conversation } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function BarangayMessagesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAppSelector((s) => s.auth);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToConversations(user.uid, setConversations);
    return unsub;
  }, [user?.uid]);

  const totalUnread = conversations.filter((c) => (c.unreadCounts?.[user?.uid ?? ''] || 0) > 0).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
        {totalUnread > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadText}>{totalUnread} unread</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Conversations</Text>

        {conversations.length === 0 && (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No conversations yet</Text>
          </View>
        )}

        {conversations.map((conv) => {
          const otherName = Object.entries(conv.participantNames)
            .find(([id]) => id !== user?.uid)?.[1] || 'Admin';
          const isUnread = (conv.unreadCounts?.[user?.uid ?? ''] || 0) > 0;
          return (
            <TouchableOpacity
              key={conv.id}
              style={[styles.convItem, isUnread && styles.convUnread]}
              onPress={() => navigation.navigate('BarangayChat', { conversationId: conv.id, participantName: otherName })}
              activeOpacity={0.85}
            >
              <View style={[styles.avatar, { backgroundColor: colors.brgyLight }]}>
                <Text style={[styles.avatarText, { color: colors.brgyDark }]}>{otherName.slice(0, 2).toUpperCase()}</Text>
              </View>
              <View style={styles.convBody}>
                <Text style={styles.convName}>{otherName}</Text>
                <Text style={styles.convPreview} numberOfLines={1}>{conv.lastMessage}</Text>
              </View>
              <View style={styles.convMeta}>
                <Text style={styles.convTime}>—</Text>
                {isUnread && <View style={styles.unreadDot} />}
              </View>
            </TouchableOpacity>
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
  unreadBadge: { backgroundColor: Colors.brgyLight, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  unreadText: { fontSize: 11, color: Colors.brgyDark, fontWeight: '500' },
  body: { padding: 16, gap: 14, paddingBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: Colors.textPrimary },
  convItem: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 11,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  convUnread: { borderLeftWidth: 3, borderLeftColor: Colors.brgy },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '500' },
  convBody: { flex: 1, minWidth: 0 },
  convName: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  convPreview: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  convPreviewUnread: { color: Colors.textPrimary, fontWeight: '500' },
  convTag: { backgroundColor: Colors.grayBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 3 },
  convTagText: { fontSize: 9, color: Colors.textMuted },
  convMeta: { alignItems: 'flex-end', gap: 5 },
  convTime: { fontSize: 10, color: Colors.textHint },
  unreadDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: Colors.brgy },
  emptyCard: {
    backgroundColor: Colors.white, borderRadius: 16, padding: 34, alignItems: 'center',
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1,
  },
  emptyText: { fontSize: 12, color: Colors.textHint },
});
