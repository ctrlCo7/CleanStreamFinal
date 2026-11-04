import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, serverTimestamp, query, where } from 'firebase/firestore';

// Run via `npm run test:rules` (starts the Firestore emulator; needs Java installed).
const RULES = fileURLToPath(new URL('../../firestore.rules', import.meta.url));
const env = await initializeTestEnvironment({
  projectId: 'cleanstream-b7942',
  firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(RULES, 'utf8') },
});

const base = (uid, role, extra = {}) => ({
  uid, email: `${uid}@x.co`, firstName: uid, lastName: 'T', role, isActive: true, isVerified: true, ...extra,
});

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  const task = (barangayId, crew, extra = {}) => ({
    reportId: 'r_b1', barangayId, barangay: barangayId, assignedTeamId: crew, assignedTeamName: crew, assignedByUserId: 'bg',
    assignedByName: 'Official', title: 'Cleanup', status: 'assigned', beforePhotoURLs: [], afterPhotoURLs: [], ...extra,
  });
  await setDoc(doc(db, 'cleanupTasks', 't1'), task('b1', 'cl'));
  await setDoc(doc(db, 'cleanupTasks', 't2'), task('b1', 'cl2'));
  await setDoc(doc(db, 'cleanupTasks', 't_b2'), task('b2', 'cl2'));
  const ev = (barangayId) => ({ title: 'Cleanup drive', barangayId, organizedBy: 'bg', participantIds: [], currentParticipants: 0, status: 'upcoming' });
  await setDoc(doc(db, 'cleanupEvents', 'ev1'), ev('b1'));
  await setDoc(doc(db, 'cleanupEvents', 'ev_b2'), ev('b2'));
  await setDoc(doc(db, 'cleanupEvents', 'ev1', 'participants', 'ct'), { userId: 'ct', userName: 'Ct', attendanceStatus: 'registered' });
  await setDoc(doc(db, 'reports', 'r_b1'), { userId: 'ct', barangayId: 'b1', location: { latitude: 1, longitude: 2 }, status: 'pending', severity: 'low' });
  await setDoc(doc(db, 'reports', 'r_photo'), { userId: 'ct', barangayId: 'b1', location: { latitude: 1, longitude: 2 }, status: 'verified', severity: 'low', photoPending: true });
  await setDoc(doc(db, 'reports', 'r_done'), { userId: 'ct', barangayId: 'b1', location: { latitude: 1, longitude: 2 }, status: 'completed', severity: 'low' });
  await setDoc(doc(db, 'reports', 'r_asg'), { userId: 'ct', barangayId: 'b1', location: { latitude: 1, longitude: 2 }, status: 'assigned', severity: 'low', assignedTeamId: 'cl' });
  await setDoc(doc(db, 'reports', 'r_asg2'), { userId: 'ct', barangayId: 'b1', location: { latitude: 1, longitude: 2 }, status: 'assigned', severity: 'low', assignedTeamId: 'cl' });
  await setDoc(doc(db, 'reports', 'r_b2'), { userId: 'ct', barangayId: 'b2', location: { latitude: 1, longitude: 2 }, status: 'verified', severity: 'low' });
  await setDoc(doc(db, 'verifications', 'bg_rej'), { uid: 'bg_rej', status: 'rejected', reason: 'blurry' });
  await setDoc(doc(db, 'verifications', 'bg_pend'), { uid: 'bg_pend', role: 'barangay', status: 'pending', idImage: 'data:x' });
  for (const [uid, role, extra] of [
    ['sa', 'superadmin', { barangayId: 'b1' }], ['ad', 'admin', { barangayId: 'b1' }], ['ad_none', 'admin'], ['sa_none', 'superadmin'], ['bg', 'barangay', { barangayId: 'b1' }], ['ct', 'citizen'],
    ['cl', 'cleanup_team', { barangayId: 'b1' }], ['victim', 'citizen'], ['ct2', 'citizen', { isVerified: false }],
    ['sa_off', 'superadmin', { isActive: false }],
    ['bg2', 'barangay', { barangayId: 'b2' }],
    ['cl2', 'cleanup_team', { barangayId: 'b1' }],
    ['cl_b2', 'cleanup_team', { barangayId: 'b2' }],
    ['cl_off', 'cleanup_team', { barangayId: 'b1', isActive: false }],
    ['bg_off', 'barangay', { barangayId: 'b1', isActive: false }],
    ['ct_off', 'citizen', { isActive: false }],
    ['vol1', 'citizen', { barangayId: 'b1' }],
    ['vol2', 'citizen', { barangayId: 'b1' }],
    ['ad_pend', 'admin', { idVerification: 'pending', isVerified: false }],
    ['bg_pend', 'barangay', { barangayId: 'b1', idVerification: 'pending', isVerified: false }],
    ['bg_pend2', 'barangay', { barangayId: 'b1', idVerification: 'pending', isVerified: false }],
    ['bg_rej', 'barangay', { barangayId: 'b1', idVerification: 'rejected', isVerified: false }],
    ['bg_ok', 'barangay', { barangayId: 'b1', idVerification: 'approved' }],
    ['sa_gone', 'superadmin', { deletedAt: new Date() }],
  ]) await setDoc(doc(db, 'users', uid), base(uid, role, extra));
  await setDoc(doc(db, 'auditLogs', 'seed'), { action: 'account.create', actorUid: 'sa' });
});

const as = (uid) => env.authenticatedContext(uid).firestore();
let pass = 0, fail = 0;
const check = async (name, p) => {
  try { await p; pass++; console.log('  ok  ', name); } catch (e) { fail++; console.log('  FAIL', name, '-', String(e.message).split('\n')[0].slice(0, 110)); }
};

console.log('\n== Super Admin: full account management');
const sa = as('sa');
await check('reads any account', assertSucceeds(getDoc(doc(sa, 'users', 'victim'))));
await check('lists all accounts', assertSucceeds(getDocs(collection(sa, 'users'))));
await check('creates an admin profile for another uid', assertSucceeds(setDoc(doc(sa, 'users', 'new_admin'), base('new_admin', 'admin', { createdBy: 'sa' }))));
await check('creates a superadmin profile', assertSucceeds(setDoc(doc(sa, 'users', 'new_sa'), base('new_sa', 'superadmin'))));
await check("changes someone's role", assertSucceeds(updateDoc(doc(sa, 'users', 'victim'), { role: 'barangay' })));
await check('deactivates an account', assertSucceeds(updateDoc(doc(sa, 'users', 'victim'), { isActive: false })));
await check('approves an account', assertSucceeds(updateDoc(doc(sa, 'users', 'victim'), { isVerified: true })));
await check('soft-removes an account (deletedAt/deletedBy)', assertSucceeds(updateDoc(doc(sa, 'users', 'victim'), { deletedAt: serverTimestamp(), deletedBy: 'sa' })));
await check('deletes a profile document', assertSucceeds(deleteDoc(doc(sa, 'users', 'new_sa'))));

console.log('\n== Admin: no longer manages accounts');
const ad = as('ad');
await check("can read their own barangay's people (crews, officials)", assertSucceeds(getDoc(doc(ad, 'users', 'cl'))));
await check("can't read people of other barangays or with none (privacy)", assertFails(getDoc(doc(ad, 'users', 'ct'))));
await check("can't read another barangay's official", assertFails(getDoc(doc(ad, 'users', 'bg2'))));
await check('cannot deactivate an account', assertFails(updateDoc(doc(ad, 'users', 'ct'), { isActive: false })));
await check('cannot change a role', assertFails(updateDoc(doc(ad, 'users', 'ct'), { role: 'admin' })));
await check('cannot verify an account', assertFails(updateDoc(doc(ad, 'users', 'bg'), { isVerified: true })));
await check('cannot create an admin profile', assertFails(setDoc(doc(ad, 'users', 'fake_admin'), base('fake_admin', 'admin'))));
await check('cannot delete a profile', assertFails(deleteDoc(doc(ad, 'users', 'ct'))));
await check('can still edit their own name', assertSucceeds(updateDoc(doc(ad, 'users', 'ad'), { firstName: 'Renamed' })));
await check('cannot promote themselves to superadmin', assertFails(updateDoc(doc(ad, 'users', 'ad'), { role: 'superadmin' })));

console.log('\n== Everyone else: unchanged protections');
const ct = as('ct');
await check('citizen reads own profile', assertSucceeds(getDoc(doc(ct, 'users', 'ct'))));
await check("citizen can't read another profile", assertFails(getDoc(doc(ct, 'users', 'victim'))));
await check('citizen edits own name', assertSucceeds(updateDoc(doc(ct, 'users', 'ct'), { firstName: 'N' })));
await check('citizen saves own fcmToken (app does this)', assertSucceeds(updateDoc(doc(ct, 'users', 'ct'), { fcmToken: 'abc' })));
await check("citizen can't change own role", assertFails(updateDoc(doc(ct, 'users', 'ct'), { role: 'admin' })));
await check("citizen can't deactivate/reactivate self", assertFails(updateDoc(doc(ct, 'users', 'ct'), { isActive: false })));
await check("citizen can't un-remove self (deletedAt)", assertFails(updateDoc(doc(ct, 'users', 'ct'), { deletedAt: null })));
await check("unverified user can't approve self", assertFails(updateDoc(doc(as('ct2'), 'users', 'ct2'), { isVerified: true })));
await check("citizen can't edit others", assertFails(updateDoc(doc(ct, 'users', 'victim'), { firstName: 'X' })));
const fresh = env.authenticatedContext('brand_new').firestore();
await check('self-signup as citizen works', assertSucceeds(setDoc(doc(fresh, 'users', 'brand_new'), { uid: 'brand_new', email: 'n@x.co', firstName: 'N', lastName: 'W', role: 'citizen' })));
const fresh2 = env.authenticatedContext('brand_new2').firestore();
await check('self-signup as barangay without the ID check is refused', assertFails(setDoc(doc(fresh2, 'users', 'brand_new2'), { uid: 'brand_new2', email: 'n2@x.co', firstName: 'N', lastName: 'W', role: 'barangay' })));
const fresh3 = env.authenticatedContext('brand_new3').firestore();
await check("self-signup as admin is refused", assertFails(setDoc(doc(fresh3, 'users', 'brand_new3'), { uid: 'brand_new3', email: 'n3@x.co', firstName: 'N', lastName: 'W', role: 'admin' })));
await check("self-signup as superadmin is refused", assertFails(setDoc(doc(fresh3, 'users', 'brand_new3'), { uid: 'brand_new3', email: 'n3@x.co', firstName: 'N', lastName: 'W', role: 'superadmin' })));
await check("barangay official reads their own barangay's crew", assertSucceeds(getDoc(doc(as('bg'), 'users', 'cl'))));
await check("barangay official can't read people outside their barangay", assertFails(getDoc(doc(as('bg'), 'users', 'ct'))));
await check("barangay official can't edit others", assertFails(updateDoc(doc(as('bg'), 'users', 'ct'), { isActive: false })));
await check('logged-out visitor reads nothing', assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users', 'ct'))));

console.log('\n== A deactivated or removed Super Admin loses their powers at once');
await check('deactivated superadmin cannot edit accounts', assertFails(updateDoc(doc(as('sa_off'), 'users', 'ct'), { firstName: 'Z' })));
await check('removed superadmin cannot edit accounts', assertFails(updateDoc(doc(as('sa_gone'), 'users', 'ct'), { firstName: 'Z' })));
await check('deactivated superadmin cannot read the audit log', assertFails(getDocs(collection(as('sa_off'), 'auditLogs'))));

console.log('\n== Audit log');
await check('superadmin appends an entry as themselves', assertSucceeds(addDoc(collection(sa, 'auditLogs'), { action: 'account.update', actorUid: 'sa', createdAt: serverTimestamp() })));
await check("superadmin can't forge another actor", assertFails(addDoc(collection(sa, 'auditLogs'), { action: 'account.update', actorUid: 'ad' })));
await check('superadmin reads the log', assertSucceeds(getDocs(collection(sa, 'auditLogs'))));
await check("superadmin can't edit an entry", assertFails(updateDoc(doc(sa, 'auditLogs', 'seed'), { details: 'tampered' })));
await check("superadmin can't delete an entry", assertFails(deleteDoc(doc(sa, 'auditLogs', 'seed'))));
await check('admin cannot read the log', assertFails(getDocs(collection(ad, 'auditLogs'))));
await check('admin cannot write the log', assertFails(addDoc(collection(ad, 'auditLogs'), { action: 'x', actorUid: 'ad' })));
await check('citizen cannot read the log', assertFails(getDocs(collection(ct, 'auditLogs'))));

console.log('\n== Existing features still work (regression)');
await check('admin can still set checkpoint alarms', assertSucceeds(setDoc(doc(ad, 'checkpointAlarms', 'b1'), { barangayId: 'b1', hour: 8, minute: 0 })));

console.log('\n== Barangay Captain (stored role admin): only their own barangay');
await check("a Captain can't set another barangay's alarm", assertFails(setDoc(doc(ad, 'checkpointAlarms', 'b2'), { barangayId: 'b2', hour: 8, minute: 0 })));
await check("a Captain can't change system settings", assertFails(setDoc(doc(ad, 'systemSettings', 'app'), { maintenanceMode: true }, { merge: true })));
await check("a Captain can't add or remove barangays", assertFails(setDoc(doc(ad, 'barangays', 'b9'), { id: 'b9', name: 'New' })));
await check('a Captain posts an instruction to their own barangay', assertSucceeds(addDoc(collection(ad, 'announcements'), { authorId: 'ad', targetBarangayIds: ['b1'], targetRoles: ['barangay'], isActive: true })));
await check("a Captain can't post to every barangay", assertFails(addDoc(collection(ad, 'announcements'), { authorId: 'ad', targetBarangayIds: [], targetRoles: ['barangay'], isActive: true })));
await check("a Captain can't post to another barangay", assertFails(addDoc(collection(ad, 'announcements'), { authorId: 'ad', targetBarangayIds: ['b2'], targetRoles: ['barangay'], isActive: true })));
await check("a Captain can't create a cleanup event for another barangay", assertFails(addDoc(collection(ad, 'cleanupEvents'), { organizedBy: 'ad', barangayId: 'b2' })));
await check('a Captain creates a cleanup event for their barangay', assertSucceeds(addDoc(collection(ad, 'cleanupEvents'), { organizedBy: 'ad', barangayId: 'b1' })));
await check('any signed-in user can read alarms', assertSucceeds(getDoc(doc(ct, 'checkpointAlarms', 'b1'))));
await check('citizen can still submit a report', assertSucceeds(setDoc(doc(ct, 'reports', 'r1'), { userId: 'ct', location: { latitude: 1, longitude: 2 }, status: 'pending', severity: 'low' })));
await check("a citizen reads their barangay's report", assertSucceeds(getDoc(doc(as('vol1'), 'reports', 'r_b1'))));
await check("a citizen can't read another barangay's report", assertFails(getDoc(doc(as('vol1'), 'reports', 'r_b2'))));
await check("a citizen lists their barangay's reports (the map)", assertSucceeds(getDocs(query(collection(as('vol1'), 'reports'), where('barangayId', '==', 'b1')))));
await check("a citizen can't list every report", assertFails(getDocs(collection(as('vol1'), 'reports'))));
await check("a citizen can't list another barangay's reports", assertFails(getDocs(query(collection(as('vol1'), 'reports'), where('barangayId', '==', 'b2')))));
await check('a citizen still reads their own report filed in another barangay', assertSucceeds(getDoc(doc(as('ct'), 'reports', 'r_b2'))));
await check("a citizen lists their own reports wherever they are", assertSucceeds(getDocs(query(collection(as('ct'), 'reports'), where('userId', '==', 'ct')))));
await check("a citizen with no barangay can't read others' reports", assertFails(getDoc(doc(as('ct2'), 'reports', 'r_b1'))));
await check("the Admin reads their barangay's report", assertSucceeds(getDoc(doc(as('ad'), 'reports', 'r_b1'))));
await check("the Admin can't read another barangay's report", assertFails(getDoc(doc(as('ad'), 'reports', 'r_b2'))));
await check("the Admin can't list every report", assertFails(getDocs(collection(as('ad'), 'reports'))));
await check("the Admin lists their barangay's reports", assertSucceeds(getDocs(query(collection(as('ad'), 'reports'), where('barangayId', '==', 'b1')))));
await check("the Super Admin reads any barangay's report", assertSucceeds(getDoc(doc(as('sa'), 'reports', 'r_b2'))));
await check('the Super Admin lists every report in the city', assertSucceeds(getDocs(collection(as('sa'), 'reports'))));
await check('an Admin with no barangay sees no reports', assertFails(getDoc(doc(as('ad_none'), 'reports', 'r_b1'))));
await check('a Super Admin needs no barangay to see reports', assertSucceeds(getDoc(doc(as('sa_none'), 'reports', 'r_b1'))));
await check("a deactivated Super Admin can't list reports", assertFails(getDocs(collection(as('sa_off'), 'reports'))));
await check("an Admin with no barangay can't read a report with no barangay", assertFails(getDoc(doc(as('ad_none'), 'reports', 'r1'))));
await check("the Admin can't change another barangay's report", assertFails(updateDoc(doc(as('ad'), 'reports', 'r_b2'), { status: 'rejected' })));
await check("the Admin can't delete another barangay's report", assertFails(deleteDoc(doc(as('ad'), 'reports', 'r_b2'))));
await check("the Admin can't read another barangay's cleanup task", assertFails(getDoc(doc(as('ad'), 'cleanupTasks', 't_b2'))));
await check("the Admin can't change another barangay's cleanup task", assertFails(updateDoc(doc(as('ad'), 'cleanupTasks', 't_b2'), { status: 'cancelled' })));
await check("the Admin reads their barangay's cleanup task", assertSucceeds(getDoc(doc(as('ad'), 'cleanupTasks', 't1'))));

console.log('\n== Reports stay inside their barangay');
await check("an official reads their barangay's report", assertSucceeds(getDoc(doc(as('bg'), 'reports', 'r_b1'))));
await check("an official can't read another barangay's report", assertFails(getDoc(doc(as('bg'), 'reports', 'r_b2'))));
await check("an official can't read a report with no barangay", assertFails(getDoc(doc(as('bg'), 'reports', 'r1'))));
await check("an official lists their barangay's reports", assertSucceeds(getDocs(query(collection(as('bg'), 'reports'), where('barangayId', '==', 'b1')))));
await check("an official can't list another barangay's reports", assertFails(getDocs(query(collection(as('bg'), 'reports'), where('barangayId', '==', 'b2')))));
await check("an official can't list every report", assertFails(getDocs(collection(as('bg'), 'reports'))));
await check('an official still reads a report they filed elsewhere', assertSucceeds(getDocs(query(collection(as('bg2'), 'reports'), where('userId', '==', 'bg2')))));
await check("a crew can't read another barangay's report", assertFails(getDoc(doc(as('cl'), 'reports', 'r_b2'))));
await check("a crew reads their own barangay's report", assertSucceeds(getDoc(doc(as('cl'), 'reports', 'r_b1'))));
await check("another barangay's official can't verify it", assertFails(updateDoc(doc(as('bg2'), 'reports', 'r_b1'), { status: 'verified' })));

console.log('\n== Identity verification: applicants get no powers until approved');
const adp = as('ad_pend'), bgp = as('bg_pend'), bgr = as('bg_rej'), bgo = as('bg_ok');
await check('pending admin cannot read other accounts', assertFails(getDoc(doc(adp, 'users', 'ct'))));
await check('pending admin cannot set checkpoint alarms', assertFails(setDoc(doc(adp, 'checkpointAlarms', 'b2'), { barangayId: 'b2', hour: 8, minute: 0 })));
await check('pending barangay official cannot read accounts', assertFails(getDoc(doc(bgp, 'users', 'ct'))));
await check('pending barangay official cannot verify a report', assertFails(updateDoc(doc(bgp, 'reports', 'r_b1'), { status: 'verified' })));
await check('rejected barangay official cannot verify a report', assertFails(updateDoc(doc(bgr, 'reports', 'r_b1'), { status: 'verified' })));
await check('approved barangay official can verify a report', assertSucceeds(updateDoc(doc(bgo, 'reports', 'r_b1'), { status: 'verified' })));
await check('existing barangay official (no field) still works', assertSucceeds(getDoc(doc(as('bg'), 'users', 'cl'))));

console.log('\n== Identity verification: self sign-up cannot skip the check');
const su = (uid, data) => setDoc(doc(env.authenticatedContext(uid).firestore(), 'users', uid), { uid, email: uid + '@x.co', firstName: 'N', lastName: 'W', ...data });
await check('admin sign-up with idVerification pending is accepted', assertSucceeds(su('n_ad', { role: 'admin', idVerification: 'pending', isVerified: false, isActive: true })));
await check('barangay sign-up with idVerification pending is accepted', assertSucceeds(su('n_bg', { role: 'barangay', idVerification: 'pending', isVerified: false, isActive: true })));
await check('admin sign-up WITHOUT idVerification is refused', assertFails(su('n_ad2', { role: 'admin', isVerified: false })));
await check('barangay sign-up WITHOUT idVerification is refused', assertFails(su('n_bg2', { role: 'barangay', isVerified: false })));
await check('sign-up claiming idVerification approved is refused', assertFails(su('n_bg3', { role: 'barangay', idVerification: 'approved' })));
await check('sign-up claiming isVerified true is refused', assertFails(su('n_ct2', { role: 'citizen', isVerified: true })));
await check('sign-up with isActive false is refused', assertFails(su('n_ct3', { role: 'citizen', isActive: false })));
await check('citizen sign-up (no ID step) still works', assertSucceeds(su('n_ct4', { role: 'citizen', isVerified: false, isActive: true })));
await check('pending applicant cannot approve themselves', assertFails(updateDoc(doc(bgp, 'users', 'bg_pend'), { idVerification: 'approved' })));
await check('pending applicant cannot set isVerified', assertFails(updateDoc(doc(bgp, 'users', 'bg_pend'), { isVerified: true })));
await check('rejected applicant cannot jump to approved', assertFails(updateDoc(doc(bgr, 'users', 'bg_rej'), { idVerification: 'approved' })));
await check('rejected applicant can resubmit (rejected -> pending)', assertSucceeds(updateDoc(doc(bgr, 'users', 'bg_rej'), { idVerification: 'pending' })));
await check('rejected applicant cannot erase the rejection reason', assertFails(updateDoc(doc(bgr, 'users', 'bg_rej'), { idRejectionReason: 'x' })));
await check('superadmin approves an applicant', assertSucceeds(updateDoc(doc(sa, 'users', 'bg_pend'), { idVerification: 'approved', isVerified: true })));

console.log('\n== Identity verification: the ID images are private');
const evidence = (uid, extra = {}) => ({ uid, role: 'barangay', idType: 'umid', idImage: 'data:a', selfieNeutral: 'data:b', selfieSmile: 'data:c', selfieTurn: 'data:d', clientChecks: { mode: 'mlkit' }, status: 'pending', submittedAt: serverTimestamp(), ...extra });
await check('applicant submits their own evidence', assertSucceeds(setDoc(doc(as('n_bg'), 'verifications', 'n_bg'), evidence('n_bg'))));
await check('applicant reads their own submission', assertSucceeds(getDoc(doc(as('n_bg'), 'verifications', 'n_bg'))));
await check('nobody else can read it (another citizen)', assertFails(getDoc(doc(ct, 'verifications', 'n_bg'))));
await check('nobody else can read it (an admin)', assertFails(getDoc(doc(ad, 'verifications', 'n_bg'))));
await check('nobody else can read it (a barangay official)', assertFails(getDoc(doc(as('bg'), 'verifications', 'n_bg'))));
await check('logged-out visitor cannot read it', assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'verifications', 'n_bg'))));
await check('superadmin reads it', assertSucceeds(getDoc(doc(sa, 'verifications', 'n_bg'))));
await check("applicant can't submit under someone else's id", assertFails(setDoc(doc(as('n_ad'), 'verifications', 'n_bg2'), evidence('n_bg2'))));
await check('submission with extra/unknown fields is refused', assertFails(setDoc(doc(as('n_ad'), 'verifications', 'n_ad'), evidence('n_ad', { approvedByMe: true }))));
await check('submission cannot pre-mark itself approved', assertFails(setDoc(doc(as('n_ad'), 'verifications', 'n_ad'), evidence('n_ad', { status: 'approved' }))));
await check('a citizen (not pending) cannot submit evidence', assertFails(setDoc(doc(ct, 'verifications', 'ct'), evidence('ct', { role: 'citizen' }))));
await check('applicant cannot edit a pending submission', assertFails(updateDoc(doc(as('n_bg'), 'verifications', 'n_bg'), { idImage: 'data:swapped' })));
await check('applicant cannot approve their own submission', assertFails(updateDoc(doc(as('n_bg'), 'verifications', 'n_bg'), { status: 'approved' })));
await check('rejected applicant can resubmit new evidence', assertSucceeds(setDoc(doc(bgr, 'verifications', 'bg_rej'), evidence('bg_rej'))));
await check('superadmin records a decision and clears the images', assertSucceeds(updateDoc(doc(sa, 'verifications', 'n_bg'), { status: 'approved', idImage: null })));
await check('superadmin can delete a submission', assertSucceeds(deleteDoc(doc(sa, 'verifications', 'n_bg'))));

console.log('\n== Cleanup crews: created only by the Super Admin, limited to their own tasks');
const crew = as('cl'), crew2 = as('cl2');
await check('nobody can self-register as a cleanup team account', assertFails(su('n_cl', { role: 'cleanup_team', isVerified: false, isActive: true })));
await check('a crew leader cannot read everyone\'s profiles', assertFails(getDoc(doc(crew, 'users', 'ct'))));
await check('a crew leader cannot list accounts', assertFails(getDocs(collection(crew, 'users'))));
await check('a crew leader reads a task assigned to them', assertSucceeds(getDoc(doc(crew, 'cleanupTasks', 't1'))));
await check("a crew leader cannot read another crew's task", assertFails(getDoc(doc(crew, 'cleanupTasks', 't2'))));
await check('a crew leader accepts their task', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', 't1'), { status: 'accepted', updatedAt: serverTimestamp() })));
await check('a crew leader starts it', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', 't1'), { status: 'in_progress', actualStartTime: serverTimestamp(), updatedAt: serverTimestamp() })));
await check('a crew leader saves the AI result of a cleanup photo', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', 't1'), { afterAnalysis: { objectCount: 1, volumeM3: 0.001, severityScore: 10, analyzedAt: 'x', source: 'photo' }, updatedAt: serverTimestamp() })));
await check("a crew leader can't save it on another crew's task", assertFails(updateDoc(doc(crew, 'cleanupTasks', 't2'), { afterAnalysis: { objectCount: 0 } })));
await check("a crew leader can't finish without an after photo", assertFails(updateDoc(doc(crew, 'cleanupTasks', 't1'), { status: 'completed', completionNotes: 'done' })));
await check('a crew leader adds photos and finishes it', assertSucceeds(updateDoc(doc(crew, 'cleanupTasks', 't1'), { status: 'completed', afterPhotoURLs: ['https://x/a.jpg'], completionNotes: 'done', wasteCollectedKg: 12, completedAt: serverTimestamp(), updatedAt: serverTimestamp() })));
await check('a crew leader can decline with a reason', assertSucceeds(updateDoc(doc(crew2, 'cleanupTasks', 't2'), { status: 'cancelled', declineReason: 'No truck available', updatedAt: serverTimestamp() })));
await check("a crew leader can't hand the task to someone else", assertFails(updateDoc(doc(crew2, 'cleanupTasks', 't_b2'), { assignedTeamId: 'cl' })));
await check("a crew leader can't reset a task to 'assigned'", assertFails(updateDoc(doc(crew2, 'cleanupTasks', 't_b2'), { status: 'assigned' })));
await check("a crew leader can't edit the task's title or location", assertFails(updateDoc(doc(crew2, 'cleanupTasks', 't_b2'), { title: 'Changed' })));
await check("a crew leader can't touch another crew's task", assertFails(updateDoc(doc(crew, 'cleanupTasks', 't2'), { status: 'accepted' })));
await check('a crew leader cannot create tasks', assertFails(setDoc(doc(crew, 'cleanupTasks', 'tx'), { assignedByUserId: 'cl', barangayId: 'b1', assignedTeamId: 'cl' })));
await check('a crew leader cannot delete tasks', assertFails(deleteDoc(doc(crew, 'cleanupTasks', 't1'))));
await check('a crew leader cannot change a report any more', assertFails(updateDoc(doc(crew, 'reports', 'r_b1'), { status: 'completed' })));
await check('a deactivated crew leader loses access at once', assertFails(getDoc(doc(as('cl_off'), 'cleanupTasks', 't1'))));

console.log('\n== Barangay officials: only their own barangay, always as themselves');
const bg1 = as('bg'), bg2 = as('bg2');
const newTask = (barangayId, by) => ({ reportId: 'r_b1', barangayId, assignedTeamId: 'cl', assignedTeamName: 'Crew', assignedByUserId: by, title: 'Cleanup', status: 'assigned' });
await check('an official reads their barangay\'s tasks', assertSucceeds(getDoc(doc(bg1, 'cleanupTasks', 't2'))));
await check("an official can't read another barangay's task", assertFails(getDoc(doc(bg1, 'cleanupTasks', 't_b2'))));
await check('an official proposes a cleanup schedule in their own barangay', assertSucceeds(setDoc(doc(bg1, 'cleanupTasks', 'new1'), { ...newTask('b1', 'bg'), status: 'proposed' })));
await check('an official records a schedule the conflict check declined', assertSucceeds(setDoc(doc(bg1, 'cleanupTasks', 'new1d'), { ...newTask('b1', 'bg'), status: 'declined', declineReason: 'clash' })));
await check("an official can't create an approved ('assigned') schedule", assertFails(setDoc(doc(bg1, 'cleanupTasks', 'new1a'), newTask('b1', 'bg'))));
await check("an official can't stamp their own proposal as approved", assertFails(setDoc(doc(bg1, 'cleanupTasks', 'new1b'), { ...newTask('b1', 'bg'), status: 'proposed', approvedByUserId: 'bg' })));
await check("an official can't approve a proposal", assertFails(updateDoc(doc(bg1, 'cleanupTasks', 'new1'), { status: 'assigned', approvedByUserId: 'bg' })));
await check("an official can't reject a proposal either", assertFails(updateDoc(doc(bg1, 'cleanupTasks', 'new1'), { status: 'rejected', rejectionRemarks: 'no' })));
await check("a crew can't accept a schedule the Captain hasn't approved", assertFails(updateDoc(doc(as('cl'), 'cleanupTasks', 'new1'), { status: 'accepted' })));
await check('the Captain approves a proposed schedule', assertSucceeds(updateDoc(doc(ad, 'cleanupTasks', 'new1'), { status: 'assigned', approvedByUserId: 'ad', approvedByName: 'Cap', approvedAt: 'x' })));
await check('the crew accepts it once approved', assertSucceeds(updateDoc(doc(as('cl'), 'cleanupTasks', 'new1'), { status: 'accepted', updatedAt: serverTimestamp() })));
await check('the Captain rejects a proposal with remarks', assertSucceeds(updateDoc(doc(ad, 'cleanupTasks', 'new1d'), { status: 'rejected', rejectionRemarks: 'Use the morning', rejectedByUserId: 'ad' })));
await check("an official can't assign for another barangay", assertFails(setDoc(doc(bg1, 'cleanupTasks', 'new2'), newTask('b2', 'bg'))));
await check("an official can't create a task in someone else's name", assertFails(setDoc(doc(bg1, 'cleanupTasks', 'new3'), newTask('b1', 'ad'))));
await check("an official can't record a cleanup as done (Captain only)", assertFails(updateDoc(doc(bg1, 'cleanupTasks', 't2'), { status: 'completed', afterPhotoURLs: ['https://x/b.jpg'], recordedByUserId: 'bg' })));
await check("an official can't confirm a cleanup (Captain only)", assertFails(updateDoc(doc(bg1, 'cleanupTasks', 't2'), { confirmedByUserId: 'bg', confirmedAt: 'x' })));
await check("an official can't edit another barangay's task", assertFails(updateDoc(doc(bg1, 'cleanupTasks', 't_b2'), { status: 'completed' })));
await check('an official from another barangay cannot read it either', assertFails(getDoc(doc(bg2, 'cleanupTasks', 't1'))));
await check("an official can't close a report (verification only)", assertFails(updateDoc(doc(bg1, 'reports', 'r_b1'), { status: 'completed' })));
await check("an official can't mark a report assigned (scheduling is the Captain's)", assertFails(updateDoc(doc(bg1, 'reports', 'r_b1'), { status: 'assigned' })));
await check('an official rejects a report with remarks', assertSucceeds(updateDoc(doc(bg1, 'reports', 'r_b1'), { status: 'rejected', rejectionReason: 'Not in our barangay' })));
await check('the Captain marks a report assigned when approving its cleanup', assertSucceeds(updateDoc(doc(ad, 'reports', 'r_b1'), { status: 'assigned' })));
await check("the Admin assigns a report's own barangay crew", assertSucceeds(setDoc(doc(ad, 'cleanupTasks', 'adm1'), newTask('b1', 'ad'))));
await check("the Admin can't file the task under another barangay", assertFails(setDoc(doc(ad, 'cleanupTasks', 'adm2'), newTask('b2', 'ad'))));
await check("the Admin can't send another barangay's crew", assertFails(setDoc(doc(ad, 'cleanupTasks', 'adm3'), { ...newTask('b1', 'ad'), assignedTeamId: 'cl_b2' })));
await check("an official can't send another barangay's crew", assertFails(setDoc(doc(bg1, 'cleanupTasks', 'new4'), { ...newTask('b1', 'bg'), assignedTeamId: 'cl_b2' })));
await check("a task can't point at a report from another barangay", assertFails(setDoc(doc(bg1, 'cleanupTasks', 'new5'), { ...newTask('b1', 'bg'), reportId: 'r_b2' })));
await check("a citizen can't be 'assigned' as a crew", assertFails(setDoc(doc(bg1, 'cleanupTasks', 'new6'), { ...newTask('b1', 'bg'), assignedTeamId: 'ct' })));
await check("an official can't swap the crew (they propose a new schedule instead)", assertFails(updateDoc(doc(bg1, 'cleanupTasks', 't1'), { assignedTeamId: 'cl2' })));
await check('the Captain reassigns to another crew of the same barangay', assertSucceeds(updateDoc(doc(ad, 'cleanupTasks', 't1'), { assignedTeamId: 'cl2' })));
await check("...but never to another barangay's crew", assertFails(updateDoc(doc(ad, 'cleanupTasks', 't1'), { assignedTeamId: 'cl_b2' })));
await check('the Captain hands it back to the first crew', assertSucceeds(updateDoc(doc(ad, 'cleanupTasks', 't1'), { assignedTeamId: 'cl' })));
await check("the Admin can't move a task to another barangay", assertFails(updateDoc(doc(ad, 'cleanupTasks', 't1'), { barangayId: 'b2' })));
await check("the Admin can't move a report to another barangay", assertFails(updateDoc(doc(ad, 'reports', 'r_b1'), { barangayId: 'b2' })));
await check("the Admin can't assign a report to another barangay", assertFails(updateDoc(doc(ad, 'reports', 'r_b1'), { assignedBarangayId: 'b2' })));
await check("the Admin assigns a report within its barangay", assertSucceeds(updateDoc(doc(ad, 'reports', 'r_b1'), { assignedBarangayId: 'b1' })));
await updateDoc(doc(bg1, 'cleanupTasks', 't1'), { assignedTeamId: 'cl' }).catch(() => undefined); // back to the original crew for later tests
await check('a deactivated official loses their powers at once', assertFails(updateDoc(doc(as('bg_off'), 'reports', 'r_b1'), { status: 'verified' })));
await check('a deactivated citizen cannot submit reports', assertFails(setDoc(doc(as('ct_off'), 'reports', 'r_off'), { userId: 'ct_off', location: { latitude: 1, longitude: 2 }, status: 'pending', severity: 'low' })));

console.log('\n== Volunteers and cleanup events');
const evNew = (barangayId, by) => ({ title: 'Drive', barangayId, organizedBy: by, participantIds: [], currentParticipants: 0, status: 'upcoming' });
const v1 = as('vol1'), v2 = as('vol2');
await check('an official creates an event for their own barangay', assertSucceeds(setDoc(doc(bg1, 'cleanupEvents', 'evNew'), evNew('b1', 'bg'))));
await check("an official can't create an event for another barangay", assertFails(setDoc(doc(bg1, 'cleanupEvents', 'evBad'), evNew('b2', 'bg'))));
await check("an official can't create an event in someone else's name", assertFails(setDoc(doc(bg1, 'cleanupEvents', 'evBad2'), evNew('b1', 'ad'))));
await check('a citizen cannot create an event', assertFails(setDoc(doc(v1, 'cleanupEvents', 'evBad3'), evNew('b1', 'vol1'))));
await check('any signed-in resident can read events', assertSucceeds(getDoc(doc(v1, 'cleanupEvents', 'ev1'))));
await check('a resident joins an event (adds only themselves)', assertSucceeds(updateDoc(doc(v1, 'cleanupEvents', 'ev1'), { participantIds: ['vol1'], currentParticipants: 1, updatedAt: serverTimestamp() })));
await check('...and gets a participant record, "registered"', assertSucceeds(setDoc(doc(v1, 'cleanupEvents', 'ev1', 'participants', 'vol1'), { userId: 'vol1', userName: 'V1', attendanceStatus: 'registered' })));
await check('a second resident joins too', assertSucceeds(updateDoc(doc(v2, 'cleanupEvents', 'ev1'), { participantIds: ['vol1', 'vol2'], currentParticipants: 2, updatedAt: serverTimestamp() })));
await check("a resident can't add somebody else to the list", assertFails(updateDoc(doc(v1, 'cleanupEvents', 'ev_b2'), { participantIds: ['vol2'], currentParticipants: 1 })));
await check("a resident can't inflate the volunteer count", assertFails(updateDoc(doc(v1, 'cleanupEvents', 'ev_b2'), { participantIds: ['vol1'], currentParticipants: 50 })));
await check("a resident can't change the event's other details", assertFails(updateDoc(doc(v1, 'cleanupEvents', 'ev_b2'), { participantIds: ['vol1'], currentParticipants: 1, title: 'Hacked' })));
await check("a resident can't remove someone else", assertFails(updateDoc(doc(v1, 'cleanupEvents', 'ev1'), { participantIds: ['vol1'], currentParticipants: 1 })));
await check('a resident leaves an event (removes only themselves)', assertSucceeds(updateDoc(doc(v2, 'cleanupEvents', 'ev1'), { participantIds: ['vol1'], currentParticipants: 1, updatedAt: serverTimestamp() })));
await check("a resident can't register as already 'attended'", assertFails(setDoc(doc(v2, 'cleanupEvents', 'ev_b2', 'participants', 'vol2'), { userId: 'vol2', userName: 'V2', attendanceStatus: 'attended' })));
await check("a resident can't join under another person's id", assertFails(setDoc(doc(v2, 'cleanupEvents', 'ev_b2', 'participants', 'vol1'), { userId: 'vol1', userName: 'V1', attendanceStatus: 'registered' })));
await check("a resident can't mark their own attendance", assertFails(updateDoc(doc(v1, 'cleanupEvents', 'ev1', 'participants', 'vol1'), { attendanceStatus: 'attended' })));
await check('the official of that barangay marks attendance', assertSucceeds(updateDoc(doc(bg1, 'cleanupEvents', 'ev1', 'participants', 'vol1'), { attendanceStatus: 'attended' })));
await check("another barangay's official can't mark attendance", assertFails(updateDoc(doc(bg2, 'cleanupEvents', 'ev1', 'participants', 'vol1'), { attendanceStatus: 'no_show' })));

console.log('\n== Checkpoints, inspections and system settings');
const cpDoc = (barangayId) => ({ name: 'Bridge 2', barangayId, barangay: 'B', days: ['Mon'], time: '07:00', isActive: true, assignedUserIds: ['bg'] });
const stamp = { lastInspectedAt: serverTimestamp(), lastInspectedBy: 'bg', lastInspectedByName: 'Bg', lastCondition: 'Clean' };
await check('the Super Admin adds a checkpoint', assertSucceeds(setDoc(doc(sa, 'checkpoints', 'cp1'), cpDoc('b1'))));
await check('the Super Admin adds one in another barangay', assertSucceeds(setDoc(doc(sa, 'checkpoints', 'cp_b2'), cpDoc('b2'))));
await check('the Admin can manage checkpoints too', assertSucceeds(updateDoc(doc(ad, 'checkpoints', 'cp1'), { time: '08:00' })));
await check("a Captain can't manage another barangay's checkpoint", assertFails(updateDoc(doc(ad, 'checkpoints', 'cp_b2'), { time: '08:00' })));
await check("a Captain can't move a checkpoint to another barangay", assertFails(updateDoc(doc(ad, 'checkpoints', 'cp1'), { barangayId: 'b2' })));
await check('an official reads checkpoints', assertSucceeds(getDoc(doc(bg1, 'checkpoints', 'cp1'))));
await check('an official stamps their own barangay checkpoint as inspected', assertSucceeds(updateDoc(doc(bg1, 'checkpoints', 'cp1'), stamp)));
await check("an official can't stamp another barangay's checkpoint", assertFails(updateDoc(doc(bg1, 'checkpoints', 'cp_b2'), stamp)));
await check("an official can't change the schedule or assignments", assertFails(updateDoc(doc(bg1, 'checkpoints', 'cp1'), { days: ['Sun'] })));
await check("an official can't create checkpoints", assertFails(setDoc(doc(bg1, 'checkpoints', 'cp_bad'), cpDoc('b1'))));
await check("a citizen can't create checkpoints", assertFails(setDoc(doc(ct, 'checkpoints', 'cp_bad2'), cpDoc('b1'))));
// bg_pend was approved by an earlier test, so this uses an official who is still pending.
await check("a pending official can't stamp a checkpoint", assertFails(updateDoc(doc(as('bg_pend2'), 'checkpoints', 'cp1'), stamp)));
await check("a citizen can't delete a checkpoint", assertFails(deleteDoc(doc(ct, 'checkpoints', 'cp1'))));
await check('an official files an inspection against a checkpoint', assertSucceeds(setDoc(doc(bg1, 'fieldCheckpoints', 'fc1'), { userId: 'bg', barangayId: 'b1', checkpointId: 'cp1', checkpointName: 'Bridge 2', status: 'pending' })));
await check('the Super Admin reads inspections (compliance)', assertSucceeds(getDoc(doc(sa, 'fieldCheckpoints', 'fc1'))));
await check("a citizen can't read someone's inspection", assertFails(getDoc(doc(ct, 'fieldCheckpoints', 'fc1'))));
await check('the Super Admin saves system settings', assertSucceeds(setDoc(doc(sa, 'systemSettings', 'app'), { maintenanceMode: true, maintenanceMessage: 'Back soon' }, { merge: true })));
await check('every signed-in user can read settings', assertSucceeds(getDoc(doc(ct, 'systemSettings', 'app'))));
await check("a citizen can't change settings", assertFails(setDoc(doc(ct, 'systemSettings', 'app'), { maintenanceMode: false }, { merge: true })));
await check("a deactivated Super Admin can't change settings", assertFails(setDoc(doc(as('sa_off'), 'systemSettings', 'app'), { maintenanceMode: false }, { merge: true })));
await check('the Super Admin deletes a checkpoint', assertSucceeds(deleteDoc(doc(sa, 'checkpoints', 'cp_b2'))));

console.log('\n== Live crew tracking');
const trip = (over = {}) => ({ taskId: 't1', reportId: 'r_b1', crewId: 'cl', barangayId: 'b1', status: 'en_route',
  latitude: 10.3, longitude: 123.9, heading: 90, destination: { latitude: 10.31, longitude: 123.89 }, route: [], updatedAtMs: 1, ...over });
await check('the assigned crew leader starts sharing their trip', assertSucceeds(setDoc(doc(as('cl'), 'crewTracking', 't1'), trip())));
await check('...and updates their position', assertSucceeds(updateDoc(doc(as('cl'), 'crewTracking', 't1'), { latitude: 10.301, updatedAtMs: 2 })));
await check("another crew can't post a trip for someone else's task", assertFails(setDoc(doc(as('cl2'), 'crewTracking', 't1'), trip({ crewId: 'cl2' }))));
await check("a crew can't point the trip at another barangay", assertFails(setDoc(doc(as('cl'), 'crewTracking', 't1'), trip({ barangayId: 'b2' }))));
await check("a crew can't add a stranger as the 'reporter'", assertFails(setDoc(doc(as('cl'), 'crewTracking', 't1'), trip({ reporterUserId: 'victim' }))));
await check("an official can't fake a crew's position", assertFails(updateDoc(doc(bg1, 'crewTracking', 't1'), { latitude: 0 })));
await check("the barangay's official sees the truck", assertSucceeds(getDoc(doc(bg1, 'crewTracking', 't1'))));
await check("another barangay's official doesn't", assertFails(getDoc(doc(bg2, 'crewTracking', 't1'))));
await check("the Admin sees their barangay's trucks on the way", assertSucceeds(getDocs(query(collection(ad, 'crewTracking'), where('barangayId', '==', 'b1'), where('status', '==', 'en_route')))));
await check("the Admin can't list every barangay's trucks", assertFails(getDocs(query(collection(ad, 'crewTracking'), where('status', '==', 'en_route')))));
await check("an unrelated citizen can't see where the crew is", assertFails(getDoc(doc(ct, 'crewTracking', 't1'))));

console.log('\n== Profiles: people edit their own details, not their barangay');
await check('a citizen edits their own name', assertSucceeds(updateDoc(doc(ct, 'users', 'ct'), { firstName: 'New', lastName: 'Name', displayName: 'New Name' })));
await check('a citizen saves their notification choices', assertSucceeds(updateDoc(doc(ct, 'users', 'ct'), { notificationPrefs: { messages: false } })));
await check("an official can't move themselves to another barangay", assertFails(updateDoc(doc(bg1, 'users', 'bg'), { barangayId: 'b2' })));
await check("a crew can't move themselves to another barangay", assertFails(updateDoc(doc(as('cl'), 'users', 'cl'), { barangayId: 'b2', barangay: 'B2' })));
await check("nobody changes their own email in the profile", assertFails(updateDoc(doc(ct, 'users', 'ct'), { email: 'x@y.z' })));
await check('the Super Admin can still move an official', assertSucceeds(updateDoc(doc(sa, 'users', 'bg2'), { barangayId: 'b2' })));

console.log('\n== Daily checkpoints and the activity log');
await check('an official starts an inspection (ongoing)', assertSucceeds(updateDoc(doc(bg1, 'checkpoints', 'cp1'), { inspectionStartedAt: serverTimestamp(), inspectionStartedBy: 'bg', inspectionStartedByName: 'Bg' })));
await check('an official records an issue at an inspection', assertSucceeds(updateDoc(doc(bg1, 'checkpoints', 'cp1'), { lastIssue: true, lastCondition: 'Critical' })));
await check('an official logs activity in their barangay', assertSucceeds(setDoc(doc(bg1, 'activityLogs', 'log_bg'), { userId: 'bg', barangayId: 'b1', action: 'report_verified', details: { summary: 'x' } })));
await check("an official can't log activity for another barangay", assertFails(setDoc(doc(bg1, 'activityLogs', 'log_bad'), { userId: 'bg', barangayId: 'b2', action: 'report_verified' })));
await check("the Captain reads their barangay's activity log", assertSucceeds(getDoc(doc(ad, 'activityLogs', 'log_bg'))));
await check("another barangay's official can't read it", assertFails(getDoc(doc(bg2, 'activityLogs', 'log_bg'))));
await check('activity log entries can never be changed', assertFails(updateDoc(doc(bg1, 'activityLogs', 'log_bg'), { action: 'x' })));

console.log('\n== QA fixes: report integrity, notifications, staff directory, schedule locks');
const rep = (extra = {}) => ({ userId: 'ct', location: { latitude: 1, longitude: 2 }, status: 'pending', severity: 'low', barangayId: 'b1', ...extra });
await check("a citizen can't file a report that is already 'verified'", assertFails(setDoc(doc(ct, 'reports', 'forged1'), rep({ status: 'verified' }))));
await check("a citizen can't file a report that is already 'completed'", assertFails(setDoc(doc(ct, 'reports', 'forged2'), rep({ status: 'completed' }))));
await check("a citizen can't file a report with verification or training labels", assertFails(setDoc(doc(ct, 'reports', 'forged3'), rep({ verifiedBy: 'bg', groundTruthSeverity: 'low' }))));
await check('a citizen files a pending report', assertSucceeds(setDoc(doc(ct, 'reports', 'qa1'), rep())));
await check("the reporter's phone saves the AI result while pending", assertSucceeds(updateDoc(doc(ct, 'reports', 'qa1'), { aiAnalysis: { confidence: 80 }, severity: 'high', wasteTypes: ['plastic'] })));
await check("the reporter can't set a training label on their own report", assertFails(updateDoc(doc(ct, 'reports', 'qa1'), { groundTruthSeverity: 'critical' })));
await check("the reporter can't assign a crew to their report", assertFails(updateDoc(doc(ct, 'reports', 'qa1'), { assignedTeamId: 'cl' })));
await check('an official verifies it (verification fields only)', assertSucceeds(updateDoc(doc(bg1, 'reports', 'qa1'), { status: 'verified', verifiedBy: 'bg', groundTruthSeverity: 'high' })));
await check("after verification the reporter can't change its severity", assertFails(updateDoc(doc(ct, 'reports', 'qa1'), { severity: 'low' })));
await check("an official can't move the report or change its photo while verifying", assertFails(updateDoc(doc(bg1, 'reports', 'qa1'), { status: 'verified', photoURL: 'https://x/fake.jpg' })));
await check("an official can't reopen a completed report", assertFails(updateDoc(doc(bg1, 'reports', 'r_done'), { status: 'verified' })));
await check('the assigned crew marks the report in progress', assertSucceeds(updateDoc(doc(as('cl'), 'reports', 'r_asg'), { status: 'in_progress' })));
await check("another crew can't", assertFails(updateDoc(doc(as('cl2'), 'reports', 'r_asg2'), { status: 'in_progress' })));
await check("the crew can't complete the report", assertFails(updateDoc(doc(as('cl'), 'reports', 'r_asg'), { status: 'completed' })));

await check('a verified report with a pending photo: the reporter finishes the upload', assertSucceeds(updateDoc(doc(ct, 'reports', 'r_photo'), { photoURL: 'https://res.cloudinary.com/x.jpg', photoPending: false })));
await check('...and can never swap the photo after that', assertFails(updateDoc(doc(ct, 'reports', 'r_photo'), { photoURL: 'https://res.cloudinary.com/other.jpg' })));
await check("a reporter can't change the photo of a verified report", assertFails(updateDoc(doc(ct, 'reports', 'qa1'), { photoURL: 'https://x/fake.jpg' })));

await check('a resident saves their own push token', assertSucceeds(setDoc(doc(ct, 'pushTokens', 'ct'), { token: 'ExponentPushToken[ct]', platform: 'android', staff: false, muted: [] })));
await check("a resident can't claim to be staff on their token", assertFails(setDoc(doc(ct, 'pushTokens', 'ct'), { token: 'ExponentPushToken[ct]', platform: 'android', staff: true })));
await check("no one writes someone else's push token", assertFails(setDoc(doc(ct, 'pushTokens', 'bg'), { token: 'ExponentPushToken[evil]', platform: 'android', staff: true })));
await check('an official saves their push token as staff', assertSucceeds(setDoc(doc(bg1, 'pushTokens', 'bg'), { token: 'ExponentPushToken[bg]', platform: 'android', staff: true, muted: [] })));
await check("a resident reads an official's token (to notify them)", assertSucceeds(getDoc(doc(as('victim'), 'pushTokens', 'bg'))));
await check("a resident can't read another resident's token", assertFails(getDoc(doc(as('victim'), 'pushTokens', 'ct'))));
await check("an official reads a resident's token (report updates)", assertSucceeds(getDoc(doc(bg1, 'pushTokens', 'ct'))));

await check('a notification signed by its sender is accepted', assertSucceeds(setDoc(doc(ct, 'notifications', 'n_ok'), { userId: 'bg', senderId: 'ct', title: 'x', body: 'y', type: 'report_submitted', read: false })));
await check('an unsigned notification is refused', assertFails(setDoc(doc(ct, 'notifications', 'n_anon'), { userId: 'bg', title: 'x', body: 'y', type: 'system', read: false })));
await check("a notification can't be signed as someone else", assertFails(setDoc(doc(ct, 'notifications', 'n_spoof'), { userId: 'bg', senderId: 'sa', title: 'x', body: 'y', type: 'system', read: false })));

await check('an official lists themselves in their barangay staff directory', assertSucceeds(setDoc(doc(bg1, 'barangayStaff', 'b1'), { officials: ['bg'] })));
await check('the Captain lists themselves too', assertSucceeds(setDoc(doc(ad, 'barangayStaff', 'b1'), { officials: ['bg'], captains: ['ad'] })));
await check('a citizen reads the staff directory (to notify officials)', assertSucceeds(getDoc(doc(ct, 'barangayStaff', 'b1'))));
await check("an official can't add someone else", assertFails(setDoc(doc(bg1, 'barangayStaff', 'b1'), { officials: ['bg', 'ct'], captains: ['ad'] })));
await check("an official can't remove the Captain", assertFails(setDoc(doc(bg1, 'barangayStaff', 'b1'), { officials: ['bg'], captains: [] })));
await check("an official can't list themselves in another barangay", assertFails(setDoc(doc(bg1, 'barangayStaff', 'b2'), { officials: ['bg'] })));
await check("a citizen can't list themselves as staff", assertFails(setDoc(doc(ct, 'barangayStaff', 'b1'), { officials: ['bg', 'ct'], captains: ['ad'] })));

await check("the Captain bumps their barangay's schedule lock", assertSucceeds(setDoc(doc(ad, 'scheduleLocks', 'b1_2026-11-05'), { barangayId: 'b1', date: '2026-11-05', version: 1, by: 'ad' })));
await check("no one bumps another barangay's lock", assertFails(setDoc(doc(ad, 'scheduleLocks', 'b2_2026-11-05'), { barangayId: 'b2', date: '2026-11-05', version: 1, by: 'ad' })));
await check("a lock id must match its barangay and date", assertFails(setDoc(doc(ad, 'scheduleLocks', 'b1_wrong'), { barangayId: 'b1', date: '2026-11-05', version: 1, by: 'ad' })));
await check("a citizen can't touch schedule locks", assertFails(setDoc(doc(ct, 'scheduleLocks', 'b1_2026-11-06'), { barangayId: 'b1', date: '2026-11-06', version: 1, by: 'ct' })));

console.log('\n== Barangays typed in by the Super Admin');
const newBrgy = (id) => ({ id, name: 'Lahug', city: 'Cebu City', custom: true, isActive: true });
await check('the Super Admin adds a barangay that is not on the list', assertSucceeds(setDoc(doc(sa, 'barangays', 'lahug'), newBrgy('lahug'))));
await check("the id inside must match the document's", assertFails(setDoc(doc(sa, 'barangays', 'pasil'), newBrgy('lahug'))));
await check('everyone signed in can read it (the app matches reports to it)', assertSucceeds(getDoc(doc(ct, 'barangays', 'lahug'))));
await check("a citizen can't add barangays", assertFails(setDoc(doc(ct, 'barangays', 'fake'), newBrgy('fake'))));
await check("a deactivated Super Admin can't add barangays", assertFails(setDoc(doc(as('sa_off'), 'barangays', 'x'), newBrgy('x'))));

console.log('\n== Citizens message any barangay (shared inbox)');
const inboxConv = (citizen, barangayId, extra = {}) => ({
  participantIds: [citizen], participantNames: { [citizen]: 'C', ['brgy_' + barangayId]: 'Brgy' },
  barangayId, barangayName: barangayId, citizenId: citizen, lastMessage: '', unreadCounts: {}, ...extra,
});
await check('a citizen opens a chat with another barangay', assertSucceeds(setDoc(doc(as('vol1'), 'conversations', 'inbox1'), inboxConv('vol1', 'b2'))));
await check("a citizen can't open one in someone else's name", assertFails(setDoc(doc(as('vol1'), 'conversations', 'inbox2'), inboxConv('victim', 'b2', { participantIds: ['vol1'] }))));
await check("a citizen can't pull an official into the inbox chat", assertFails(setDoc(doc(as('vol1'), 'conversations', 'inbox3'), inboxConv('vol1', 'b2', { participantIds: ['vol1', 'bg2'] }))));
await check('the citizen writes to the barangay', assertSucceeds(addDoc(collection(as('vol1'), 'conversations', 'inbox1', 'messages'), { senderId: 'vol1', receiverId: 'brgy_b2', content: 'Hi', read: false })));
await check("that barangay's official sees the inbox", assertSucceeds(getDocs(query(collection(as('bg2'), 'conversations'), where('barangayId', '==', 'b2')))));
await check("that barangay's official reads the messages", assertSucceeds(getDocs(collection(as('bg2'), 'conversations', 'inbox1', 'messages'))));
await check("that barangay's official replies", assertSucceeds(addDoc(collection(as('bg2'), 'conversations', 'inbox1', 'messages'), { senderId: 'bg2', receiverId: 'vol1', content: 'Noted', read: false })));
await check('...and updates the preview and unread count', assertSucceeds(updateDoc(doc(as('bg2'), 'conversations', 'inbox1'), { lastMessage: 'Noted', 'unreadCounts.vol1': 1 })));
await check("...but can't change who is in the chat", assertFails(updateDoc(doc(as('bg2'), 'conversations', 'inbox1'), { participantIds: ['bg2'] })));
await check("another barangay's official can't read it", assertFails(getDoc(doc(as('bg'), 'conversations', 'inbox1'))));
await check("another barangay's official can't list that inbox", assertFails(getDocs(query(collection(as('bg'), 'conversations'), where('barangayId', '==', 'b2')))));
await check("another barangay's official can't read its messages", assertFails(getDocs(collection(as('bg'), 'conversations', 'inbox1', 'messages'))));
await check("another citizen can't read it", assertFails(getDoc(doc(as('vol2'), 'conversations', 'inbox1'))));
await check('person-to-person chats still work', assertSucceeds(setDoc(doc(as('vol2'), 'conversations', 'p2p'), { participantIds: ['vol2', 'ad'], lastMessage: '' })));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
