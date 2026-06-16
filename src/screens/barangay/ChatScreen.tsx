import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList, Message } from '../../types';
import { BackIcon, SendIcon } from '../../components/common/TabIcons';
import { useAppSelector } from '../../store/hooks';
import { subscribeToMessages, sendMessage, markMessagesRead } from '../../services/messagingService';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayChat'>;

const QUICK_REPLIES = ['Noted. Will comply.', 'On our way', 'Site secured', 'Need more manpower', 'Cleanup complete'];

export default function BarangayChatScreen({ navigation, route }: Props) {
  const { conversationId, participantName, reportTag } = route.params;
  const { user } = useAppSelector((s) => s.auth);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Derive the other participant's ID from conversationId (format: uid1_uid2)
  const receiverId = conversationId.includes('_')
    ? conversationId.split('_').find((p) => p !== user?.uid) ?? ''
    : '';

  useEffect(() => {
    if (!conversationId) return;
    const unsub = subscribeToMessages(conversationId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80);
    });
    return unsub;
  }, [conversationId]);

  // Mark as read on open
  useEffect(() => {
    if (conversationId && user?.uid) {
      markMessagesRead(conversationId, user.uid).catch(() => null);
    }
  }, [conversationId, user?.uid]);

  const send = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || !user || sending) return;
    setInput('');
    setSending(true);
    try {
      const senderName = `${user.firstName} ${user.lastName}`;
      await sendMessage(conversationId, user.uid, senderName, 'barangay', receiverId, content, reportTag);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      // silent — user can retry
    } finally {
      setSending(false);
    }
  }, [input, user, conversationId, receiverId, reportTag, sending]);

  const formatTime = (ts: unknown): string => {
    if (!ts) return '';
    try {
      const d = typeof ts === 'string' ? new Date(ts)
        : (ts as { toDate?: () => Date }).toDate?.() ?? new Date();
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
        <View style={[styles.avatar, { backgroundColor: Colors.brgyLight }]}>
          <Text style={[styles.avatarText, { color: Colors.brgyDark }]}>
            {participantName.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>{participantName}</Text>
          {reportTag && <Text style={styles.chatTag}>{reportTag}</Text>}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.chatBody} showsVerticalScrollIndicator={false}>
          {messages.length === 0 && (
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>No messages yet. Start the conversation.</Text>
            </View>
          )}
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.uid;
            return (
              <View key={msg.id}>
                <View style={[styles.bubble, isMe ? styles.bubbleBhw : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{msg.content}</Text>
                </View>
                <Text style={[styles.bubbleTime, isMe ? styles.timeR : styles.timeL]}>{formatTime(msg.timestamp)}</Text>
              </View>
            );
          })}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.qrBar} contentContainerStyle={{ gap: 6, padding: 7 }}>
          {QUICK_REPLIES.map((qr) => (
            <TouchableOpacity key={qr} style={styles.qrChip} onPress={() => send(qr)}>
              <Text style={styles.qrText}>{qr}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Reply..."
            placeholderTextColor={Colors.textHint}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => send()}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => send()} disabled={sending}>
            {sending ? <ActivityIndicator size="small" color="#fff" /> : <SendIcon />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.grayBg },
  chatHeader: {
    backgroundColor: Colors.white, padding: 10, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderBottomWidth: 0.5, borderBottomColor: Colors.border,
  },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.grayBg, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '500' },
  chatName: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  chatTag: { fontSize: 10, color: Colors.textMuted },
  chatBody: { padding: 12, paddingBottom: 8 },
  emptyChat: { alignItems: 'center', paddingVertical: 32 },
  emptyChatText: { fontSize: 12, color: Colors.textHint },
  bubble: { maxWidth: '80%', padding: 9, paddingHorizontal: 12, borderRadius: 16, marginBottom: 0 },
  bubbleOther: { alignSelf: 'flex-start', backgroundColor: Colors.white, borderBottomLeftRadius: 3, borderWidth: 0.5, borderColor: Colors.border },
  bubbleBhw: { alignSelf: 'flex-end', backgroundColor: Colors.brgy, borderBottomRightRadius: 3 },
  bubbleText: { fontSize: 12, lineHeight: 18, color: Colors.textPrimary },
  bubbleTime: { fontSize: 10, color: Colors.textHint, marginBottom: 6 },
  timeL: { alignSelf: 'flex-start', marginLeft: 4 },
  timeR: { alignSelf: 'flex-end', marginRight: 4 },
  qrBar: { backgroundColor: Colors.white, borderTopWidth: 0.5, borderTopColor: Colors.border, maxHeight: 50 },
  qrChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, borderWidth: 0.5, borderColor: Colors.brgyMid, backgroundColor: Colors.brgyLight },
  qrText: { fontSize: 11, color: Colors.brgyDark },
  inputBar: { backgroundColor: Colors.white, borderTopWidth: 0.5, borderTopColor: Colors.border, padding: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, backgroundColor: Colors.grayBg, borderRadius: 22, paddingHorizontal: 13, paddingVertical: 8, fontSize: 12, color: Colors.textPrimary },
  sendBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.brgy, alignItems: 'center', justifyContent: 'center' },
});
