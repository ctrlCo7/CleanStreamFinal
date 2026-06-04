import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import { Message, Conversation } from '../types';

export const sendMessage = async (
  conversationId: string,
  senderId: string,
  senderName: string,
  senderRole: string,
  receiverId: string,
  content: string,
  reportRef?: string,
): Promise<string> => {
  const msgRef = await addDoc(
    collection(db, 'conversations', conversationId, 'messages'),
    {
      senderId,
      senderName,
      senderRole,
      receiverId,
      content,
      reportRef: reportRef || null,
      timestamp: serverTimestamp(),
      read: false,
    },
  );

  await updateDoc(doc(db, 'conversations', conversationId), {
    lastMessage: content,
    lastMessageTime: serverTimestamp(),
    [`unreadCounts.${receiverId}`]: (await getDocs(
      query(
        collection(db, 'conversations', conversationId, 'messages'),
        where('receiverId', '==', receiverId),
        where('read', '==', false),
      ),
    )).size + 1,
  });

  return msgRef.id;
};

export const getOrCreateConversation = async (
  userId1: string,
  userName1: string,
  role1: string,
  userId2: string,
  userName2: string,
  role2: string,
  reportRef?: string,
  reportTag?: string,
): Promise<string> => {
  const convId = [userId1, userId2].sort().join('_');

  await setDoc(
    doc(db, 'conversations', convId),
    {
      participantIds: [userId1, userId2],
      participantNames: { [userId1]: userName1, [userId2]: userName2 },
      participantRoles: { [userId1]: role1, [userId2]: role2 },
      reportRef: reportRef || null,
      reportTag: reportTag || null,
      lastMessage: '',
      lastMessageTime: serverTimestamp(),
      unreadCounts: { [userId1]: 0, [userId2]: 0 },
    },
    { merge: true },
  );

  return convId;
};

export const subscribeToMessages = (
  conversationId: string,
  callback: (messages: Message[]) => void,
) => {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('timestamp', 'asc'),
  );
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Message));
    callback(messages);
  });
};

export const subscribeToConversations = (
  userId: string,
  callback: (convs: Conversation[]) => void,
) => {
  const q = query(
    collection(db, 'conversations'),
    where('participantIds', 'array-contains', userId),
    orderBy('lastMessageTime', 'desc'),
  );
  return onSnapshot(q, (snap) => {
    const convs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation));
    callback(convs);
  });
};

export const markMessagesRead = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  await updateDoc(doc(db, 'conversations', conversationId), {
    [`unreadCounts.${userId}`]: 0,
  });
};
