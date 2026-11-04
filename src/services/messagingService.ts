import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  setDoc,
  limit,
} from 'firebase/firestore';
import { db } from './firebase';
import { Message, Conversation } from '../types';
import { createNotification, getNotificationRecipientsByRole } from './notificationService';

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

  // Tell the recipient (a phone notification too, when push is set up). A message to a
  // barangay's shared inbox goes to every official of that barangay.
  notifyNewMessage(conversationId, senderName, receiverId, content).catch((e) =>
    console.warn('[Messages] New-message notification failed (non-fatal):', e));

  return msgRef.id;
};

async function notifyNewMessage(conversationId: string, senderName: string, receiverId: string, content: string): Promise<void> {
  const inbox = receiverId.startsWith('brgy_') ? receiverId.slice('brgy_'.length) : null;
  const recipients = inbox ? await getNotificationRecipientsByRole(['barangay'], inbox) : [receiverId];
  const preview = content.length > 120 ? `${content.slice(0, 117)}…` : content;
  await Promise.all(recipients.map((userId) => createNotification({
    userId, type: 'message', title: `New message from ${senderName}`, body: preview, conversationId,
  })));
}

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

// Finds (or creates) the conversation between a user and their barangay's Captain (stored
// role 'admin'), since callers like "Message your Captain" only know the barangay, not a uid.
// Returns null when the barangay has no Captain yet.
export const getOrCreateAdminConversation = async (
  userId: string,
  userName: string,
  role: string,
  barangayId: string | undefined,
): Promise<{ conversationId: string; adminName: string; adminUid: string } | null> => {
  if (!barangayId) return null;
  const snap = await getDocs(query(
    collection(db, 'users'), where('role', '==', 'admin'), where('barangayId', '==', barangayId), limit(1),
  ));
  if (snap.empty) return null;

  const adminDoc = snap.docs[0];
  const admin = adminDoc.data() as { firstName?: string; lastName?: string };
  const adminName = `${admin.firstName ?? ''} ${admin.lastName ?? ''}`.trim() || 'Barangay Captain';

  const conversationId = await getOrCreateConversation(userId, userName, role, adminDoc.id, adminName, 'admin');
  return { conversationId, adminName, adminUid: adminDoc.id };
};

// ─── Barangay inboxes ─────────────────────────────────────────────────────────
// A citizen can message any barangay (for example about a waterway they reported there).
// The chat goes to the barangay's shared inbox: every official of that barangay sees it
// and can answer, and the citizen never needs an official's personal account.

/** Who a message to a barangay is addressed to, and where its unread count is kept. */
export const barangayInboxKey = (barangayId: string) => `brgy_${barangayId}`;

export const barangayConversationId = (barangayId: string, citizenId: string) => `brgyinbox-${barangayId}-${citizenId}`;

export const getOrCreateBarangayConversation = async (
  citizen: { uid: string; name: string; role: string },
  barangay: { id: string; name: string },
  reportTag?: string,
): Promise<string> => {
  const conversationId = barangayConversationId(barangay.id, citizen.uid);
  const ref = doc(db, 'conversations', conversationId);
  // The rules refuse reading a conversation that doesn't exist yet, so a refusal means "new".
  const exists = await getDoc(ref).then((s) => s.exists()).catch(() => false);
  if (exists) {
    if (reportTag) await updateDoc(ref, { reportTag });
    return conversationId;
  }
  const key = barangayInboxKey(barangay.id);
  await setDoc(ref, {
    participantIds: [citizen.uid],
    participantNames: { [citizen.uid]: citizen.name, [key]: `Brgy. ${barangay.name}` },
    participantRoles: { [citizen.uid]: citizen.role, [key]: 'barangay' },
    barangayId: barangay.id,
    barangayName: barangay.name,
    citizenId: citizen.uid,
    reportRef: null,
    reportTag: reportTag || null,
    lastMessage: '',
    lastMessageTime: serverTimestamp(),
    unreadCounts: { [citizen.uid]: 0, [key]: 0 },
  });
  return conversationId;
};

/** A barangay's shared inbox, newest first (sorted here, so no composite index is needed). */
export const subscribeToBarangayInbox = (barangayId: string, callback: (convs: Conversation[]) => void) =>
  onSnapshot(query(collection(db, 'conversations'), where('barangayId', '==', barangayId)), (snap) => {
    const seconds = (c: Conversation) => (c.lastMessageTime as unknown as { seconds?: number } | null)?.seconds ?? 0;
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conversation)).sort((a, b) => seconds(b) - seconds(a)));
  }, () => callback([]));

export const markMessagesRead = async (
  conversationId: string,
  userId: string,
): Promise<void> => {
  await updateDoc(doc(db, 'conversations', conversationId), {
    [`unreadCounts.${userId}`]: 0,
  });
};
