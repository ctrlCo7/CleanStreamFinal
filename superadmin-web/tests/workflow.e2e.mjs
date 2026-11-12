import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, arrayUnion, serverTimestamp, runTransaction,
} from 'firebase/firestore';

/**
 * QA: one waste report followed through the whole workflow, from the citizen's sign-up and the
 * official's verification to the crew's cleanup, the Captain's confirmation and the citizen
 * opening the "cleaned up" notification with the before and after photos.
 * Each step makes the same Firestore writes the app makes (src/services/reportsService.ts,
 * crewService.ts, workflowNotifications.ts), signed in as the role that does it in the app,
 * and checks that the other roles are refused at that step.
 *
 * Run: npm run test:workflow   (starts the Firestore emulator; needs Java)
 */
const RULES = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
const env = await initializeTestEnvironment({
  projectId: 'cleanstream-b7942',
  firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(RULES, 'utf8') },
});

const B = 'talamban';
const person = (uid, role, extra = {}) => ({
  uid, email: `${uid}@x.co`, firstName: uid, lastName: 'QA', role, isActive: true, isVerified: true, ...extra,
});
await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  // The reporter ('citizen') and a new official ('newOfficial') sign up during the test (stage S).
  for (const [uid, role, extra] of [
    ['superadmin', 'superadmin', {}],
    ['official', 'barangay', { barangayId: B, idVerification: 'approved' }],
    ['captain', 'admin', { barangayId: B }],
    ['crew', 'cleanup_team', { barangayId: B, crewSize: 5 }],
    ['crew2', 'cleanup_team', { barangayId: B }],
    ['crewOther', 'cleanup_team', { barangayId: 'lahug' }],
    ['officialOther', 'barangay', { barangayId: 'lahug', idVerification: 'approved' }],
    ['citizen2', 'citizen', { barangayId: B }],
  ]) await setDoc(doc(db, 'users', uid), person(uid, role, extra));
});

// Everyone signs in with a confirmed email, as the app now requires.
const as = (uid) => env.authenticatedContext(uid, { email_verified: true }).firestore();
const citizen = as('citizen'), official = as('official'), captain = as('captain'), crew = as('crew');
const crew2 = as('crew2'), crewOther = as('crewOther'), officialOther = as('officialOther'), citizen2 = as('citizen2');

let pass = 0, fail = 0;
const failures = [];
const check = async (name, p) => {
  try { await p; pass++; console.log('  ok  ', name); } catch (e) {
    fail++; failures.push(name); console.log('  FAIL', name, '-', String(e?.message ?? e).split('\n')[0].slice(0, 140));
  }
};
const expect = async (name, fn) => check(name, (async () => { const r = await fn(); if (r !== true) throw new Error(`got ${JSON.stringify(r)}`); })());
// Reads the stored document directly (rules off) to check what the workflow actually saved.
const read = async (col, id) => {
  let data;
  await env.withSecurityRulesDisabled(async (c) => { data = (await getDoc(doc(c.firestore(), col, id))).data(); });
  return data;
};
const history = (status, by, note) => arrayUnion({ status, changedBy: by, changedByName: by, changedAt: new Date().toISOString(), ...(note ? { note } : {}) });
const note = (db, sender, userId, type, extra = {}) =>
  addDoc(collection(db, 'notifications'), { userId, senderId: sender, type, title: type, body: type, read: false, createdAt: serverTimestamp(), ...extra });

// ─── S. Sign-up and onboarding ──────────────────────────────────────────────────
// registerUser (authService.ts): the profile a new account writes for itself.
const unconfirmed = (uid) => env.authenticatedContext(uid, { email_verified: false }).firestore();
const superadmin = as('superadmin');
const signupProfile = (uid, role, extra = {}) => ({
  uid, email: `${uid}@x.co`, firstName: uid, lastName: 'QA', role, barangay: 'Talamban', barangayId: B,
  emailVerificationRequired: true, isActive: true, isVerified: false, createdAt: serverTimestamp(), ...extra,
});
console.log('\n== S. Sign-up: a new citizen and a new official create their accounts');
await check('sign-up cannot skip email confirmation', assertFails(setDoc(doc(unconfirmed('citizen'), 'users', 'citizen'),
  { ...signupProfile('citizen', 'citizen'), emailVerificationRequired: false })));
await check('sign-up cannot mark itself verified', assertFails(setDoc(doc(unconfirmed('citizen'), 'users', 'citizen'),
  { ...signupProfile('citizen', 'citizen'), isVerified: true })));
await check('sign-up cannot create a cleanup crew account', assertFails(setDoc(doc(unconfirmed('citizen'), 'users', 'citizen'),
  signupProfile('citizen', 'cleanup_team'))));
await check('sign-up cannot create a profile for someone else', assertFails(setDoc(doc(unconfirmed('citizen'), 'users', 'someoneElse'),
  signupProfile('someoneElse', 'citizen'))));
await check('a new citizen signs up (registerUser)', assertSucceeds(setDoc(doc(unconfirmed('citizen'), 'users', 'citizen'), signupProfile('citizen', 'citizen'))));
await check('before confirming the email, the citizen cannot file a report', assertFails(setDoc(doc(unconfirmed('citizen'), 'reports', 'qa_unconfirmed'), {
  userId: 'citizen', barangayId: B, location: { latitude: 10.37, longitude: 123.91 }, status: 'pending', severity: 'low',
})));
await check('the citizen cannot remove the email-confirmation requirement', assertFails(updateDoc(doc(unconfirmed('citizen'), 'users', 'citizen'),
  { emailVerificationRequired: false })));
await check('an official cannot sign up already approved', assertFails(setDoc(doc(unconfirmed('newOfficial'), 'users', 'newOfficial'),
  signupProfile('newOfficial', 'barangay', { idVerification: 'approved' }))));
await check('a new official signs up, waiting for ID approval', assertSucceeds(setDoc(doc(unconfirmed('newOfficial'), 'users', 'newOfficial'),
  signupProfile('newOfficial', 'barangay', { idVerification: 'pending' }))));
await check('the new official sends their ID and selfies for review', assertSucceeds(setDoc(doc(unconfirmed('newOfficial'), 'verifications', 'newOfficial'), {
  uid: 'newOfficial', role: 'barangay', idType: 'national_id', idImage: 'data:x', selfieNeutral: 'data:x', selfieSmile: 'data:x', selfieTurn: 'data:x',
  status: 'pending', submittedAt: serverTimestamp(),
})));
await check('the new official cannot approve themselves', assertFails(updateDoc(doc(as('newOfficial'), 'users', 'newOfficial'), { idVerification: 'approved' })));
console.log('   (the citizen and the official open the link in the confirmation email: their sign-in token now has email_verified)');

// ─── 0. Staff directory ─────────────────────────────────────────────────────────
// The Captain and the official register themselves in the staff directory (staffDirectory.ts).
console.log('\n== 0. Staff register themselves in the barangay staff directory');
await check('the Captain adds themselves to the directory', assertSucceeds(setDoc(doc(captain, 'barangayStaff', B), { captains: ['captain'], officials: [], updatedAt: serverTimestamp() })));
await check('the official adds themselves to the directory', assertSucceeds(updateDoc(doc(official, 'barangayStaff', B), { officials: arrayUnion('official'), updatedAt: serverTimestamp() })));
await check('the crew cannot add itself as a Captain', assertFails(updateDoc(doc(crew, 'barangayStaff', B), { captains: arrayUnion('crew'), updatedAt: serverTimestamp() })));

const R = 'qa_report_1';
const T = 'qa_task_1';
const DATE = '2030-01-15';
const loc = { latitude: 10.3765, longitude: 123.9169, barangay: 'Talamban', address: 'Talamban, Cebu City' };

// ─── 1. The citizen files a report ──────────────────────────────────────────────
console.log('\n== 1. Citizen files the report (status: pending)');
await check('citizen creates a pending report in their barangay', assertSucceeds(setDoc(doc(citizen, 'reports', R), {
  id: R, reportNumber: 'CS-QA-0001', userId: 'citizen', userRole: 'citizen', userName: 'citizen QA', barangayId: B, barangay: 'Talamban',
  location: loc, photoURL: 'https://res.cloudinary.com/x/before.jpg', status: 'pending', severity: 'high', wasteTypes: ['plastic'],
  statusHistory: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
})));
await check('a report cannot be filed with made-up cleanup photos', assertFails(setDoc(doc(citizen, 'reports', 'qa_fake2'), {
  userId: 'citizen', barangayId: B, location: loc, status: 'pending', severity: 'low',
  cleanupResult: { beforePhotoURLs: [], afterPhotoURLs: ['https://x/fake.jpg'], confirmedAt: 'x' },
})));
await check('a report cannot be filed already "verified"', assertFails(setDoc(doc(citizen, 'reports', 'qa_fake'), {
  userId: 'citizen', barangayId: B, location: loc, status: 'verified', severity: 'low',
})));
await check('the official of the barangay can see it', assertSucceeds(getDoc(doc(official, 'reports', R))));
// The new official, still waiting for ID approval, has no staff powers yet.
const newOfficial = as('newOfficial');
await check('the new official (ID not yet approved) cannot verify it', assertFails(updateDoc(doc(newOfficial, 'reports', R), {
  status: 'verified', updatedAt: serverTimestamp(), statusHistory: history('verified', 'newOfficial'),
})));
await check('the Super Admin approves the new official\'s ID (portal)', assertSucceeds(updateDoc(doc(superadmin, 'users', 'newOfficial'), {
  idVerification: 'approved', isVerified: true,
})));
await check('the Super Admin deletes the ID photos after deciding', assertSucceeds(updateDoc(doc(superadmin, 'verifications', 'newOfficial'), {
  status: 'approved', idImage: null, selfieNeutral: null, selfieSmile: null, selfieTurn: null,
})));
await check('once approved, the new official can open the barangay\'s reports', assertSucceeds(getDoc(doc(newOfficial, 'reports', R))));
await check("another barangay's official cannot see it", assertFails(getDoc(doc(officialOther, 'reports', R))));

// ─── 2. The official verifies it ────────────────────────────────────────────────
console.log('\n== 2. Barangay Official verifies the report (pending → verified)');
await check('the reporter cannot verify their own report', assertFails(updateDoc(doc(citizen, 'reports', R), { status: 'verified' })));
await check('the crew cannot verify it', assertFails(updateDoc(doc(crew, 'reports', R), { status: 'verified' })));
await check("another barangay's official cannot verify it", assertFails(updateDoc(doc(officialOther, 'reports', R), {
  status: 'verified', updatedAt: serverTimestamp(), statusHistory: history('verified', 'officialOther'),
})));
await check('the official cannot skip ahead to "assigned"', assertFails(updateDoc(doc(official, 'reports', R), {
  status: 'assigned', updatedAt: serverTimestamp(), statusHistory: history('assigned', 'official'),
})));
await check('the official verifies it, confirming severity and waste type (verifyReport)', assertSucceeds(updateDoc(doc(official, 'reports', R), {
  status: 'verified', updatedAt: serverTimestamp(), statusHistory: history('verified', 'official'),
  verifiedBy: 'official', verifiedByName: 'official QA', verifiedAt: serverTimestamp(),
  groundTruthSeverity: 'high', groundTruthWasteType: 'plastic',
})));
await expect('the report now reads "verified", with who verified it', async () => {
  const r = await read('reports', R); return r.status === 'verified' && r.verifiedBy === 'official' && r.groundTruthSeverity === 'high';
});
await check('the reporter can no longer change the severity', assertFails(updateDoc(doc(citizen, 'reports', R), { severity: 'low', updatedAt: serverTimestamp() })));
// notifyReportVerified: the reporter is told, and the report is forwarded to the Captain.
await check('the official tells the reporter it was verified', assertSucceeds(note(official, 'official', 'citizen', 'report_verified', { reportId: R })));
let captainIds = [];
await check('the official finds the Captain of the barangay to forward it to', (async () => {
  const s = await getDocs(query(collection(official, 'users'), where('role', 'in', ['admin']), where('barangayId', '==', B)));
  captainIds = s.docs.map((d) => d.id);
  if (!captainIds.includes('captain')) throw new Error(`Captain not found, got ${captainIds}`);
})());
await check('the official forwards it to the Captain (notification)', assertSucceeds(note(official, 'official', 'captain', 'report_forwarded', { reportId: R })));
await check('the official logs it in the activity log', assertSucceeds(addDoc(collection(official, 'activityLogs'), {
  userId: 'official', barangayId: B, action: 'report_verified', entityType: 'report', entityId: R, timestamp: serverTimestamp(),
})));

// ─── 3. The official proposes a cleanup schedule ────────────────────────────────
console.log('\n== 3. Official proposes a cleanup schedule (task: proposed)');
const taskBase = {
  reportId: R, reportNumber: 'CS-QA-0001', reporterUserId: 'citizen', barangayId: B, barangay: 'Talamban',
  assignedTeamId: 'crew', assignedTeamName: 'crew QA', assignedByUserId: 'official', assignedByName: 'official QA',
  title: 'Cleanup: CS-QA-0001', description: 'high severity waste report at Talamban.', location: loc, priority: 'high',
  scheduledDate: DATE, startTime: '08:00', endTime: '10:00', estimatedDurationMinutes: 120, equipmentNeeded: ['sacks'],
  personnelCount: 3, isAiSuggested: false, beforePhotoURLs: [], afterPhotoURLs: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
};
await check('the official cannot propose it with a crew from another barangay', assertFails(setDoc(doc(official, 'cleanupTasks', 'qa_bad1'), {
  ...taskBase, assignedTeamId: 'crewOther', status: 'proposed',
})));
await check('the official cannot approve their own proposal ("assigned")', assertFails(setDoc(doc(official, 'cleanupTasks', 'qa_bad2'), {
  ...taskBase, status: 'assigned', approvedByUserId: 'official',
})));
await check('the official cannot propose it in the name of someone else', assertFails(setDoc(doc(official, 'cleanupTasks', 'qa_bad3'), {
  ...taskBase, assignedByUserId: 'captain', status: 'proposed',
})));
// proposeCleanup first looks for another schedule of the same report (one cleanup per report).
await check("the official can check the report's existing schedules", assertSucceeds(getDocs(query(collection(official, 'cleanupTasks'),
  where('barangayId', '==', B), where('reportId', '==', R)))));
await check("the Captain can check the report's existing schedules", assertSucceeds(getDocs(query(collection(captain, 'cleanupTasks'),
  where('barangayId', '==', B), where('reportId', '==', R)))));
await check('the official proposes the schedule under the day\'s lock (proposeCleanup)', assertSucceeds(runTransaction(official, async (tx) => {
  const lockRef = doc(official, 'scheduleLocks', `${B}_${DATE}`);
  const lock = await tx.get(lockRef);
  tx.set(doc(official, 'cleanupTasks', T), { ...taskBase, status: 'proposed' });
  tx.set(lockRef, { barangayId: B, date: DATE, version: (Number(lock.data()?.version) || 0) + 1, by: 'official', updatedAt: serverTimestamp() });
})));
await check('the official asks the Captain to approve it (notification)', assertSucceeds(note(official, 'official', 'captain', 'schedule_proposed', { taskId: T, reportId: R })));
await check('the crew cannot open the task before it is approved', assertFails(getDoc(doc(crew, 'cleanupTasks', T))));
await check("the crew's history query (getTasksByTeam) is allowed", assertSucceeds(getDocs(query(collection(crew, 'cleanupTasks'),
  where('assignedTeamId', '==', 'crew'), where('status', 'in', ['assigned', 'accepted', 'in_progress', 'completed', 'cancelled'])))));
await check('a crew query that would include unapproved tasks is refused', assertFails(getDocs(query(collection(crew, 'cleanupTasks'),
  where('assignedTeamId', '==', 'crew')))));
await expect("the crew's task list (the app's query) does not include the unapproved task", async () => {
  const s = await getDocs(query(collection(crew, 'cleanupTasks'), where('assignedTeamId', '==', 'crew'), where('status', 'in', ['assigned', 'accepted', 'in_progress'])));
  return s.docs.every((d) => d.id !== T) || s.docs.map((d) => d.id);
});
await check('the crew cannot accept a proposed (unapproved) task', assertFails(updateDoc(doc(crew, 'cleanupTasks', T), { status: 'accepted', updatedAt: serverTimestamp() })));
await check('the official cannot approve the proposal by editing it', assertFails(updateDoc(doc(official, 'cleanupTasks', T), {
  status: 'assigned', approvedByUserId: 'official', updatedAt: serverTimestamp(),
})));
await check('the report stays "verified" while the schedule waits', (async () => {
  const r = await read('reports', R); if (r.status !== 'verified') throw new Error(r.status);
})());

// ─── 4. The Captain approves it ─────────────────────────────────────────────────
console.log('\n== 4. Barangay Captain approves the schedule (task: assigned, report: assigned)');
await check('the Captain approves it under the day\'s lock (approveCleanup)', assertSucceeds(runTransaction(captain, async (tx) => {
  const lockRef = doc(captain, 'scheduleLocks', `${B}_${DATE}`);
  const lock = await tx.get(lockRef);
  const fresh = await tx.get(doc(captain, 'cleanupTasks', T));
  if (fresh.data()?.status !== 'proposed') throw new Error('not proposed');
  const now = new Date().toISOString();
  tx.update(doc(captain, 'cleanupTasks', T), {
    status: 'assigned', approvedByUserId: 'captain', approvedByName: 'captain QA', approvedAt: now, decidedAt: now, updatedAt: serverTimestamp(),
  });
  tx.set(lockRef, { barangayId: B, date: DATE, version: (Number(lock.data()?.version) || 0) + 1, by: 'captain', updatedAt: serverTimestamp() });
})));
await check('the Captain marks the report assigned to the crew (announceApproved)', assertSucceeds(updateDoc(doc(captain, 'reports', R), {
  status: 'assigned', updatedAt: serverTimestamp(), statusHistory: history('assigned', 'captain', `Cleanup scheduled for ${DATE}`),
  assignedTeamId: 'crew', assignedTeamName: 'crew QA', assignedBarangayId: B, cleanupTaskId: T, assignedAt: serverTimestamp(),
})));
await check('the Captain cannot assign the report to another barangay', assertFails(updateDoc(doc(captain, 'reports', R), {
  assignedBarangayId: 'lahug', updatedAt: serverTimestamp(),
})));
await check('the Captain tells the crew (new cleanup task)', assertSucceeds(note(captain, 'captain', 'crew', 'task_assigned', { taskId: T, reportId: R })));
await check('the Captain tells the official it was approved', assertSucceeds(note(captain, 'captain', 'official', 'schedule_approved', { taskId: T, reportId: R })));
await check('the Captain tells the reporter a crew is assigned', assertSucceeds(note(captain, 'captain', 'citizen', 'report_assigned', { reportId: R })));

// ─── 5. The crew accepts and starts ─────────────────────────────────────────────
console.log('\n== 5. Cleanup crew accepts, heads out and starts (task: accepted → in_progress, report: in_progress)');
await check('the assigned crew can now see the task', assertSucceeds(getDoc(doc(crew, 'cleanupTasks', T))));
await check('another crew of the same barangay cannot see it', assertFails(getDoc(doc(crew2, 'cleanupTasks', T))));
await check("another barangay's crew cannot see it", assertFails(getDoc(doc(crewOther, 'cleanupTasks', T))));
await check('another crew cannot accept it', assertFails(updateDoc(doc(crew2, 'cleanupTasks', T), { status: 'accepted', updatedAt: serverTimestamp() })));
await check('the crew cannot give the task to another crew', assertFails(updateDoc(doc(crew, 'cleanupTasks', T), {
  status: 'accepted', assignedTeamId: 'crew2', updatedAt: serverTimestamp(),
})));
await check('the crew cannot finish it without an after photo', assertFails(updateDoc(doc(crew, 'cleanupTasks', T), {
  status: 'completed', updatedAt: serverTimestamp(),
})));
await check('the crew accepts the task (respondToTask)', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', T), { status: 'accepted', updatedAt: serverTimestamp() })));
await check('the crew tells the official they accepted', assertSucceeds(note(crew, 'crew', 'official', 'task_updated', { taskId: T, reportId: R })));
// The task screens start listening before the trip exists; that read must not be refused, or
// the listener closes and the screen never sees the trip (found in the emulator run).
await check('the crew can listen for the trip before it starts', assertSucceeds(getDoc(doc(crew, 'crewTracking', T))));
await check('the official can listen for the trip before it starts', assertSucceeds(getDoc(doc(official, 'crewTracking', T))));
await check('the crew shares its trip on the way (live tracking)', assertSucceeds(setDoc(doc(crew, 'crewTracking', T), {
  taskId: T, reportId: R, crewId: 'crew', crewName: 'crew QA', barangayId: B, reporterUserId: 'citizen', status: 'en_route',
  latitude: 10.37, longitude: 123.91, updatedAt: serverTimestamp(),
})));
await check('the reporter can follow the truck', assertSucceeds(getDoc(doc(citizen, 'crewTracking', T))));
await check('another resident cannot follow the truck', assertFails(getDoc(doc(citizen2, 'crewTracking', T))));
await check('the crew adds a before photo', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', T), {
  beforePhotoURLs: ['https://res.cloudinary.com/x/cleanupTasks/qa/before_0.jpg'], updatedAt: serverTimestamp(),
})));
await check('the crew starts work (startTask: task in_progress)', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', T), {
  status: 'in_progress', actualStartTime: serverTimestamp(), updatedAt: serverTimestamp(),
})));
await check('the crew cannot mark the report completed', assertFails(updateDoc(doc(crew, 'reports', R), {
  status: 'completed', updatedAt: serverTimestamp(), statusHistory: history('completed', 'crew'),
})));
await check('the crew moves the report to "in progress" (startTask)', assertSucceeds(updateDoc(doc(crew, 'reports', R), {
  status: 'in_progress', updatedAt: serverTimestamp(), statusHistory: history('in_progress', 'crew', 'Cleanup started by the crew'),
})));
await check('the crew tells the official and the reporter it started', assertSucceeds(Promise.all([
  note(crew, 'crew', 'official', 'task_updated', { taskId: T }), note(crew, 'crew', 'citizen', 'report_in_progress', { reportId: R }),
])));

// ─── 6. The crew finishes ───────────────────────────────────────────────────────
console.log('\n== 6. Cleanup crew documents and finishes the cleanup (task: completed)');
await check('the crew adds an after photo and the AI result', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', T), {
  afterPhotoURLs: ['https://res.cloudinary.com/x/cleanupTasks/qa/after_0.jpg'],
  afterAnalysis: { objectCount: 0, volumeM3: 0 }, updatedAt: serverTimestamp(),
})));
await check('the crew cannot mark it confirmed itself', assertFails(updateDoc(doc(crew, 'cleanupTasks', T), {
  status: 'completed', confirmedByUserId: 'crew', confirmedAt: new Date().toISOString(), updatedAt: serverTimestamp(),
})));
await check('the crew finishes the task with notes and kg collected (finishTask)', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', T), {
  status: 'completed', completionNotes: 'Cleared 6 sacks of plastic.', wasteCollectedKg: 18,
  actualEndTime: serverTimestamp(), completedAt: serverTimestamp(), updatedAt: serverTimestamp(),
})));
await check('the crew cannot change a finished task any more', assertFails(updateDoc(doc(crew, 'cleanupTasks', T), {
  wasteCollectedKg: 99, updatedAt: serverTimestamp(),
})));
// finishTask: the Captain (the only one who can confirm) is found through the staff directory.
let crewSeesCaptains = [];
await check('the crew finds the Captain in the staff directory', (async () => {
  const s = await getDoc(doc(crew, 'barangayStaff', B));
  crewSeesCaptains = s.data()?.captains ?? [];
  if (!crewSeesCaptains.includes('captain')) throw new Error(`captains: ${crewSeesCaptains}`);
})());
await check('the crew tells the Captain to review and confirm', assertSucceeds(note(crew, 'crew', 'captain', 'task_updated', { taskId: T })));
await check('the crew tells the official it is finished', assertSucceeds(note(crew, 'crew', 'official', 'task_updated', { taskId: T })));
await expect('the report is still "in progress" until the Captain confirms', async () => (await read('reports', R)).status === 'in_progress');

// ─── 7. The Captain confirms; the report closes ─────────────────────────────────
console.log('\n== 7. Captain confirms the cleanup (report: completed)');
await check('the official cannot close the report', assertFails(updateDoc(doc(official, 'reports', R), {
  status: 'completed', updatedAt: serverTimestamp(), statusHistory: history('completed', 'official'),
})));
await check('the official cannot mark the task confirmed', assertFails(updateDoc(doc(official, 'cleanupTasks', T), {
  confirmedByUserId: 'official', confirmedAt: new Date().toISOString(), updatedAt: serverTimestamp(),
})));
await check('the Captain closes the report (confirmTaskCompleted)', assertSucceeds(updateDoc(doc(captain, 'reports', R), {
  status: 'completed', updatedAt: serverTimestamp(), statusHistory: history('completed', 'captain', 'Cleanup confirmed'), resolvedAt: serverTimestamp(),
})));
await check('the Captain copies the before/after photos onto the report (cleanupResult)', assertSucceeds(updateDoc(doc(captain, 'reports', R), {
  cleanupResult: {
    beforePhotoURLs: ['https://res.cloudinary.com/x/cleanupTasks/qa/before_0.jpg'], afterPhotoURLs: ['https://res.cloudinary.com/x/cleanupTasks/qa/after_0.jpg'],
    crewName: 'crew QA', wasteCollectedKg: 18, notes: 'Cleared 6 sacks of plastic.', confirmedAt: new Date().toISOString(),
  },
})));
await expect('the reporter sees the before and after photos on their report', async () => {
  const r = (await getDoc(doc(citizen, 'reports', R))).data();
  return (r.cleanupResult?.beforePhotoURLs?.length === 1 && r.cleanupResult?.afterPhotoURLs?.length === 1) || r.cleanupResult;
});
await check('the official cannot write the cleanup photos onto the report', assertFails(updateDoc(doc(official, 'reports', R), {
  cleanupResult: { beforePhotoURLs: [], afterPhotoURLs: ['https://evil/x.jpg'], confirmedAt: 'x' },
})));
await check('the Captain marks the task confirmed', assertSucceeds(updateDoc(doc(captain, 'cleanupTasks', T), {
  confirmedByUserId: 'captain', confirmedAt: new Date().toISOString(), updatedAt: serverTimestamp(),
})));
await check('the Captain tells the reporter it is cleaned up', assertSucceeds(note(captain, 'captain', 'citizen', 'report_completed', { reportId: R })));

// ─── 8. End state ───────────────────────────────────────────────────────────────
console.log('\n== 8. End state, as the reporter sees it');
await expect('the reporter sees their report as completed', async () => (await getDoc(doc(citizen, 'reports', R))).data().status === 'completed');
await expect('the timeline has every step in order: verified → assigned → in_progress → completed', async () => {
  const steps = (await read('reports', R)).statusHistory.map((h) => h.status);
  return JSON.stringify(steps) === JSON.stringify(['verified', 'assigned', 'in_progress', 'completed']) || steps;
});
await expect('the report records who verified it, the crew, the task and when it was resolved', async () => {
  const r = await read('reports', R);
  return (r.verifiedBy === 'official' && r.assignedTeamId === 'crew' && r.cleanupTaskId === T && !!r.resolvedAt && !!r.verifiedAt && !!r.assignedAt) || r;
});
await expect('the task records approval, the photos, the result and the confirmation', async () => {
  const t = await read('cleanupTasks', T);
  return (t.status === 'completed' && t.approvedByUserId === 'captain' && t.beforePhotoURLs.length === 1 && t.afterPhotoURLs.length === 1
    && t.wasteCollectedKg === 18 && t.confirmedByUserId === 'captain') || t;
});
await expect('the reporter received each update (verified, assigned, in progress, completed)', async () => {
  const s = await getDocs(query(collection(citizen, 'notifications'), where('userId', '==', 'citizen')));
  const types = s.docs.map((d) => d.data().type).sort();
  return JSON.stringify(types) === JSON.stringify(['report_assigned', 'report_completed', 'report_in_progress', 'report_verified']) || types;
});
// ─── 9. The citizen opens the "cleaned up" notification ─────────────────────────
console.log('\n== 9. The citizen taps the "cleaned up" notification');
let completedNote = null;
await expect('the "cleaned up" notification points to the report', async () => {
  const s = await getDocs(query(collection(citizen, 'notifications'), where('userId', '==', 'citizen')));
  completedNote = s.docs.find((d) => d.data().type === 'report_completed');
  return (completedNote?.data().reportId === R) || completedNote?.data();
});
await expect('the report it opens shows the before and after photos', async () => {
  const r = (await getDoc(doc(citizen, 'reports', completedNote.data().reportId))).data();
  return (r.status === 'completed' && r.cleanupResult.beforePhotoURLs.length > 0 && r.cleanupResult.afterPhotoURLs.length > 0) || r;
});
await check('the citizen marks the notification read', assertSucceeds(updateDoc(doc(citizen, 'notifications', completedNote.id), { read: true, readAt: serverTimestamp() })));
await check("another resident cannot read the citizen's notification", assertFails(getDoc(doc(citizen2, 'notifications', completedNote.id))));
await check('the citizen cannot alter the notification text', assertFails(updateDoc(doc(citizen, 'notifications', completedNote.id), { body: 'changed' })));

await check('the reporter cannot reopen the closed report', assertFails(updateDoc(doc(citizen, 'reports', R), { status: 'pending', updatedAt: serverTimestamp() })));
await check('the official cannot reopen the closed report', assertFails(updateDoc(doc(official, 'reports', R), {
  status: 'verified', updatedAt: serverTimestamp(), statusHistory: history('verified', 'official'),
})));

// ─── Side paths ─────────────────────────────────────────────────────────────────
console.log('\n== Side paths: rejection, crew declines, Captain rejects the schedule');
await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'reports', 'qa_r2'), { userId: 'citizen', barangayId: B, location: loc, status: 'pending', severity: 'low', statusHistory: [] });
  await setDoc(doc(db, 'reports', 'qa_r3'), { userId: 'citizen', barangayId: B, location: loc, status: 'assigned', severity: 'low', assignedTeamId: 'crew', statusHistory: [] });
  await setDoc(doc(db, 'cleanupTasks', 'qa_t3'), { ...taskBase, reportId: 'qa_r3', status: 'assigned', approvedByUserId: 'captain' });
  await setDoc(doc(db, 'cleanupTasks', 'qa_t4'), { ...taskBase, reportId: 'qa_r3', status: 'proposed' });
});
await check('the official rejects a report with a reason', assertSucceeds(updateDoc(doc(official, 'reports', 'qa_r2'), {
  status: 'rejected', updatedAt: serverTimestamp(), statusHistory: history('rejected', 'official'), rejectionReason: 'Not waste: construction materials being stored',
})));
await check('the crew declines an approved task with a reason (respondToTask)', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', 'qa_t3'), {
  status: 'cancelled', declineReason: 'Truck under repair', updatedAt: serverTimestamp(),
})));
await check('the official proposes another crew for the same report', assertSucceeds(setDoc(doc(official, 'cleanupTasks', 'qa_t5'), {
  ...taskBase, reportId: 'qa_r3', assignedTeamId: 'crew2', assignedTeamName: 'crew2 QA', status: 'proposed',
})));
await check('the Captain rejects a proposed schedule with remarks (rejectCleanup)', assertSucceeds(updateDoc(doc(captain, 'cleanupTasks', 'qa_t4'), {
  status: 'rejected', rejectedByUserId: 'captain', rejectedByName: 'captain QA', rejectionRemarks: 'Too early, choose 9 AM',
  decidedAt: new Date().toISOString(), updatedAt: serverTimestamp(),
})));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log('Failed:\n - ' + failures.join('\n - '));
await env.cleanup();
process.exit(fail ? 1 : 0);
