import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState, useMemo } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { subscribeToConversations, getOrCreateAdminConversation, sendMessage } from '../../services/messagingService';
import { useAppSelector } from '../../store/hooks';
import { Conversation, RootStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const QUICK_MESSAGES = [
  'When will cleanup happen?',
  'Waste is getting worse',
  'Is the area safe?',
  'Thank you!',
];

export default function CitizenMessagesScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useAppSelector((s) => s.auth);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contactingAdmin, setContactingAdmin] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToConversations(user.uid, setConversations);
    return unsub;
  }, [user?.uid]);

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unreadCounts?.[user?.uid ?? ''] || 0), 0);

  const openChat = (conv: Conversation) => {
    const otherName = Object.entries(conv.participantNames)
      .find(([id]) => id !== user?.uid)?.[1] || 'Support';
    navigation.navigate('CitizenChat', { conversationId: conv.id, participantName: otherName });
  };

  const getInitials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('');

  const messageAdmin = async (prefill?: string) => {
    if (!user?.uid || contactingAdmin) return;
    setContactingAdmin(true);
    try {
      const result = await getOrCreateAdminConversation(user.uid, `${user.firstName} ${user.lastName}`, 'citizen');
      if (!result) {
        Alert.alert('No admin available', 'No admin account was found to message right now.');
        return;
      }
      if (prefill) {
        await sendMessage(result.conversationId, user.uid, `${user.firstName} ${user.lastName}`, 'citizen', result.adminUid, prefill);
      }
      navigation.navigate('CitizenChat', { conversationId: result.conversationId, participantName: result.adminName });
    } catch {
      Alert.alert('Couldn’t open chat', 'Please try again.');
    } finally {
      setContactingAdmin(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Conversations</Text>
          {totalUnread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{totalUnread} unread</Text>
            </View>
          )}
        </View>

        {conversations.length === 0 && (
          <TouchableOpacity style={styles.convItem} onPress={() => messageAdmin()} disabled={contactingAdmin} activeOpacity={0.85}>
            <View style={[styles.avatar, { backgroundColor: colors.tealLight }]}>
              <Text style={[styles.avatarText, { color: colors.tealDark }]}>AD</Text>
            </View>
            <View style={styles.convBody}>
              <Text style={styles.convName}>Message admin support</Text>
              <Text style={styles.convPreview} numberOfLines={1}>
                {contactingAdmin ? 'Opening…' : 'Start a conversation with the CleanStream admin team'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        {conversations.map((conv) => {
          const otherName = Object.entries(conv.participantNames)
            .find(([id]) => id !== user?.uid)?.[1] || 'Unknown';
          const isUnread = (conv.unreadCounts?.[user?.uid ?? ''] || 0) > 0;
          return (
            <TouchableOpacity
              key={conv.id}
              style={[styles.convItem, isUnread && styles.convUnread]}
              onPress={() => openChat(conv)}
              activeOpacity={0.85}
            >
              <View style={[styles.avatar, { backgroundColor: colors.blueBg }]}>
                <Text style={[styles.avatarText, { color: colors.blueText }]}>{getInitials(otherName)}</Text>
              </View>
              <View style={styles.convBody}>
                <Text style={styles.convName}>{otherName}</Text>
                <Text style={[styles.convPreview, isUnread && styles.convPreviewUnread]} numberOfLines={1}>
                  {conv.lastMessage || 'No messages yet'}
                </Text>
                {conv.reportTag && (
                  <View style={styles.convTag}><Text style={styles.convTagText}>{conv.reportTag}</Text></View>
                )}
              </View>
              <View style={styles.convMeta}>
                <Text style={styles.convTime}>
                  {conv.lastMessageTime ? new Date((conv.lastMessageTime as unknown as { seconds: number }).seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </Text>
                {isUnread && <View style={styles.unreadDot} />}
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Quick messages panel */}
        <View style={styles.quickPanel}>
          <Text style={styles.quickPanelTitle}>Quick message to admin</Text>
          <View style={styles.quickChips}>
            {QUICK_MESSAGES.map((msg) => (
              <TouchableOpacity
                key={msg}
                style={styles.quickChip}
                onPress={() => messageAdmin(msg)}
                disabled={contactingAdmin}
              >
                <Text style={styles.quickChipText}>{msg}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
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
  body: { padding: 14, gap: 8, paddingBottom: 20 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  unreadBadge: { backgroundColor: Colors.redBg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  unreadBadgeText: { fontSize: 11, color: Colors.redText, fontWeight: '500' },
  convItem: {
    backgroundColor: Colors.white, borderRadius: 12, padding: 11,
    flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 0.5, borderColor: Colors.border,
  },
  convUnread: { borderLeftWidth: 3, borderLeftColor: Colors.teal },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, fontWeight: '500' },
  convBody: { flex: 1, minWidth: 0 },
  convName: { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  convPreview: { fontSize: 11, color: Colors.textMuted, marginTop: 2, overflow: 'hidden' },
  convPreviewUnread: { color: Colors.textPrimary, fontWeight: '500' },
  convTag: { backgroundColor: Colors.grayBg, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start', marginTop: 3 },
  convTagText: { fontSize: 9, color: Colors.textMuted },
  convMeta: { alignItems: 'flex-end', gap: 5 },
  convTime: { fontSize: 10, color: Colors.textHint },
  unreadDot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: Colors.teal },
  quickPanel: { backgroundColor: Colors.grayBg, borderRadius: 12, padding: 11 },
  quickPanelTitle: { fontSize: 11, fontWeight: '500', color: Colors.textSecondary, marginBottom: 7 },
  quickChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  quickChip: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
    borderWidth: 0.5, borderColor: Colors.tealMid, backgroundColor: Colors.tealLight,
  },
  quickChipText: { fontSize: 11, color: Colors.tealDark },
});
