import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList, Message } from '../../types';
import { useAppSelector } from '../../store/hooks';
import { subscribeToMessages, sendMessage } from '../../services/messagingService';
import { BackIcon, SendIcon } from '../../components/common/TabIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'CitizenChat'>;

const QUICK_REPLIES = ['When will it be cleaned?', 'Is it safe nearby?', 'Thank you!', 'Waste looks worse'];

const MOCK_MESSAGES: Message[] = [
  { id: '1', senderId: 'admin', senderName: 'Admin', senderRole: 'admin', receiverId: 'me', content: 'Hazardous waste detected in your report. Specialist team dispatched.', timestamp: new Date(Date.now() - 600000).toISOString(), read: true },
  { id: '2', senderId: 'me', senderName: 'Me', senderRole: 'citizen', receiverId: 'admin', content: 'Is it safe to be nearby?', timestamp: new Date(Date.now() - 540000).toISOString(), read: true },
  { id: '3', senderId: 'admin', senderName: 'Admin', senderRole: 'admin', receiverId: 'me', content: 'Please maintain 20-meter distance until cleanup on April 5.', timestamp: new Date(Date.now() - 480000).toISOString(), read: true },
];

export default function CitizenChatScreen({ navigation, route }: Props) {
  const { conversationId, participantName } = route.params;
  const { user } = useAppSelector((s) => s.auth);
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (conversationId === 'admin_support') return;
    const unsub = subscribeToMessages(conversationId, (msgs) => {
      setMessages(msgs);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 100);
    });
    return unsub;
  }, [conversationId]);

  const doSend = async (text?: string) => {
    const content = (text || input).trim();
    if (!content || !user) return;
    setInput('');

    const optimistic: Message = {
      id: Date.now().toString(),
      senderId: user.uid,
      senderName: `${user.firstName} ${user.lastName}`,
      senderRole: user.role,
      receiverId: 'admin',
      content,
      timestamp: new Date().toISOString(),
      read: false,
    };
    setMessages((m) => [...m, optimistic]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);

    if (conversationId !== 'admin_support') {
      try {
        await sendMessage(conversationId, user.uid, `${user.firstName} ${user.lastName}`, user.role, 'admin', content);
      } catch { /* optimistic update stands */ }
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.chatHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}><BackIcon /></TouchableOpacity>
        <View style={[styles.chatAvatar, { backgroundColor: Colors.tealLight }]}>
          <Text style={[styles.chatAvatarText, { color: Colors.tealDark }]}>
            {participantName.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.chatName}>{participantName}</Text>
          <Text style={styles.chatStatus}>
            <View style={styles.onlineDot} />
            {' '}Online
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.chatBody}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.map((msg) => {
            const isMe = msg.senderId === user?.uid || msg.senderId === 'me';
            return (
              <View key={msg.id}>
                <View style={[styles.bubble, isMe ? styles.bubbleOut : styles.bubbleIn]}>
                  <Text style={[styles.bubbleText, isMe && { color: '#fff' }]}>{msg.content}</Text>
                </View>
                <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeR : styles.bubbleTimeL]}>
                  {isMe ? '' : `${msg.senderName} · `}{formatTime(msg.timestamp)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Quick replies */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickReplies} contentContainerStyle={{ gap: 6, padding: 7 }}>
          {QUICK_REPLIES.map((qr) => (
            <TouchableOpacity key={qr} style={styles.qrChip} onPress={() => doSend(qr)}>
              <Text style={styles.qrChipText}>{qr}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor={Colors.textHint}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => doSend()}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity style={styles.sendBtn} onPress={() => doSend()}>
            <SendIcon />
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
  chatAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatAvatarText: { fontSize: 13, fontWeight: '500' },
  chatName: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  chatStatus: { fontSize: 11, color: Colors.textMuted, flexDirection: 'row', alignItems: 'center' },
  onlineDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: Colors.teal, display: 'flex' },
  chatBody: { padding: 12, gap: 0, paddingBottom: 8 },
  bubble: { maxWidth: '80%', padding: 9, paddingHorizontal: 12, borderRadius: 16, marginBottom: 0 },
  bubbleIn: {
    alignSelf: 'flex-start', backgroundColor: Colors.white,
    borderBottomLeftRadius: 3, borderWidth: 0.5, borderColor: Colors.border,
  },
  bubbleOut: { alignSelf: 'flex-end', backgroundColor: Colors.teal, borderBottomRightRadius: 3 },
  bubbleText: { fontSize: 12, lineHeight: 18, color: Colors.textPrimary },
  bubbleTime: { fontSize: 10, color: Colors.textHint, marginBottom: 6 },
  bubbleTimeL: { alignSelf: 'flex-start', marginLeft: 4 },
  bubbleTimeR: { alignSelf: 'flex-end', marginRight: 4 },
  quickReplies: {
    backgroundColor: Colors.white, borderTopWidth: 0.5,
    borderTopColor: Colors.border, maxHeight: 50,
  },
  qrChip: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
    borderWidth: 0.5, borderColor: Colors.tealMid, backgroundColor: Colors.tealLight,
  },
  qrChipText: { fontSize: 11, color: Colors.tealDark },
  inputBar: {
    backgroundColor: Colors.white, borderTopWidth: 0.5, borderTopColor: Colors.border,
    padding: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  input: {
    flex: 1, backgroundColor: Colors.grayBg, borderRadius: 22,
    paddingHorizontal: 13, paddingVertical: 8, fontSize: 12, color: Colors.textPrimary,
    maxHeight: 80,
  },
  sendBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.teal,
    alignItems: 'center', justifyContent: 'center',
  },
});
