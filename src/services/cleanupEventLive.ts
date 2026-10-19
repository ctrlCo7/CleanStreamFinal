import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import { CleanupEvent, EventParticipant } from '../types';

/** Live view of one event; the callback gets null when it does not exist or cannot be read. */
export const subscribeToEvent = (eventId: string, callback: (event: CleanupEvent | null) => void) =>
  onSnapshot(
    doc(db, 'cleanupEvents', eventId),
    (snap) => callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as CleanupEvent) : null),
    () => callback(null),
  );

/** Live list of the people who joined an event. */
export const subscribeToParticipants = (
  eventId: string,
  callback: (participants: EventParticipant[]) => void,
) =>
  onSnapshot(
    collection(db, 'cleanupEvents', eventId, 'participants'),
    (snap) => callback(snap.docs.map((d) => ({ ...d.data(), userId: d.id } as EventParticipant))),
    () => callback([]),
  );
