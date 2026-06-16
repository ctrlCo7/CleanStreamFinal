import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  increment,
  limit,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import { CleanupEvent, CleanupEventStatus, EventParticipant } from '../types';

const COL = 'cleanupEvents';

export const createCleanupEvent = async (
  data: Omit<CleanupEvent, 'id' | 'createdAt' | 'updatedAt' | 'currentParticipants' | 'participantIds'>,
): Promise<string> => {
  const ref = await addDoc(collection(db, COL), {
    ...data,
    currentParticipants: 0,
    participantIds: [],
    status: 'upcoming' as CleanupEventStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

export const getCleanupEventById = async (eventId: string): Promise<CleanupEvent | null> => {
  const snap = await getDoc(doc(db, COL, eventId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as CleanupEvent;
};

export const getUpcomingEvents = async (limitCount = 20): Promise<CleanupEvent[]> => {
  const q = query(
    collection(db, COL),
    where('status', '==', 'upcoming'),
    orderBy('eventDate', 'asc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupEvent));
};

export const getEventsByBarangay = async (barangayId: string): Promise<CleanupEvent[]> => {
  const q = query(
    collection(db, COL),
    where('barangayId', '==', barangayId),
    orderBy('eventDate', 'desc'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupEvent));
};

export const getAllEvents = async (limitCount = 50): Promise<CleanupEvent[]> => {
  const q = query(
    collection(db, COL),
    orderBy('eventDate', 'desc'),
    limit(limitCount),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupEvent));
};

export const updateEventStatus = async (
  eventId: string,
  status: CleanupEventStatus,
): Promise<void> => {
  await updateDoc(doc(db, COL, eventId), {
    status,
    updatedAt: serverTimestamp(),
  });
};

export const joinEvent = async (
  eventId: string,
  participant: Omit<EventParticipant, 'joinedAt' | 'attendanceStatus'>,
): Promise<void> => {
  const eventRef = doc(db, COL, eventId);
  const participantRef = doc(db, COL, eventId, 'participants', participant.userId);

  await setDoc(participantRef, {
    ...participant,
    attendanceStatus: 'registered',
    joinedAt: serverTimestamp(),
  });

  await updateDoc(eventRef, {
    participantIds: arrayUnion(participant.userId),
    currentParticipants: increment(1),
    updatedAt: serverTimestamp(),
  });
};

export const leaveEvent = async (eventId: string, userId: string): Promise<void> => {
  const eventRef = doc(db, COL, eventId);
  const participantRef = doc(db, COL, eventId, 'participants', userId);

  await deleteDoc(participantRef);
  await updateDoc(eventRef, {
    participantIds: arrayRemove(userId),
    currentParticipants: increment(-1),
    updatedAt: serverTimestamp(),
  });
};

export const markAttendance = async (
  eventId: string,
  userId: string,
  status: EventParticipant['attendanceStatus'],
): Promise<void> => {
  await updateDoc(doc(db, COL, eventId, 'participants', userId), {
    attendanceStatus: status,
  });
};

export const getEventParticipants = async (eventId: string): Promise<EventParticipant[]> => {
  const snap = await getDocs(collection(db, COL, eventId, 'participants'));
  return snap.docs.map((d) => d.data() as EventParticipant);
};

export const uploadEventCoverPhoto = async (uri: string, eventId: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `cleanupEvents/${eventId}/cover.jpg`);
  await uploadBytes(storageRef, blob);
  return getDownloadURL(storageRef);
};

export const subscribeToUpcomingEvents = (callback: (events: CleanupEvent[]) => void) => {
  const q = query(
    collection(db, COL),
    where('status', 'in', ['upcoming', 'ongoing']),
    orderBy('eventDate', 'asc'),
    limit(20),
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleanupEvent)));
  });
};
