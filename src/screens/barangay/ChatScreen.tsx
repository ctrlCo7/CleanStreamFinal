import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { RootStackParamList } from '../../types';
import { BackIcon, SendIcon } from '../../components/common/TabIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'BarangayChat'>;

const QUICK_REPLIES = ['Noted. Will comply.', 'On our way', 'Site secured', 'Need more manpower', 'Cleanup complete'];

interface ChatMsg { id: string; from: 'bhw' | 'other'; text: string; time: string }

const INITIAL: ChatMsg[] = [
  { id: '1', from: 'other', text: 'Team B will arrive at 6:00 AM. Please have volunteers ready at the staging area.', time: '8:20 AM' },
  { id: '2', from: 'bhw', text: 'Understood. We have 8 volunteers confirmed.', time: '8:22 AM' },
  { id: '3', from: 'other', text: 'Excellent. Bring extra PPE kits for hazmat procedures.', time: '8:23 AM' },
];

export default function BarangayChatScreen({ navigation, route }: Props) {
  const { participantName, reportTag } = route.params;
  const [messages, setMessages] = useState<ChatMsg[]>(INITIAL);
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  const send = (text?: string) => {
    const content = (text || input).trim();
    if (!content) return;
    setInput('');
    const msg: ChatMsg = {
      id: Date.now().toString(), from: 'bhw', text: content,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages((m) => [...m, msg]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
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
          {messages.map((msg) => {
            const isBhw = msg.from === 'bhw';
            return (
              <View key={msg.id}>
                <View style={[styles.bubble, isBhw ? styles.bubbleBhw : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, isBhw && { color: '#fff' }]}>{msg.text}</Text>
                </View>
                <Text style={[styles.bubbleTime, isBhw ? styles.timeR : styles.timeL]}>{msg.time}</Text>
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
          <TouchableOpacity style={styles.sendBtn} onPress={() => send()}>
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
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '500' },
  chatName: { fontSize: 14, fontWeight: '500', color: Colors.textPrimary },
  chatTag: { fontSize: 10, color: Colors.textMuted },
  chatBody: { padding: 12, paddingBottom: 8 },
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
