import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

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
  await setDoc(doc(db, 'reports', 'r_b1'), { userId: 'ct', barangayId: 'b1', location: { latitude: 1, longitude: 2 }, status: 'pending', severity: 'low' });
  await setDoc(doc(db, 'verifications', 'bg_rej'), { uid: 'bg_rej', status: 'rejected', reason: 'blurry' });
  await setDoc(doc(db, 'verifications', 'bg_pend'), { uid: 'bg_pend', role: 'barangay', status: 'pending', idImage: 'data:x' });
  for (const [uid, role, extra] of [
    ['sa', 'superadmin'], ['ad', 'admin'], ['bg', 'barangay', { barangayId: 'b1' }], ['ct', 'citizen'],
    ['cl', 'cleanup_team'], ['victim', 'citizen'], ['ct2', 'citizen', { isVerified: false }],
    ['sa_off', 'superadmin', { isActive: false }],
    ['ad_pend', 'admin', { idVerification: 'pending', isVerified: false }],
    ['bg_pend', 'barangay', { barangayId: 'b1', idVerification: 'pending', isVerified: false }],
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
await check('can still read accounts (messaging/analytics)', assertSucceeds(getDoc(doc(ad, 'users', 'ct'))));
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
await check('barangay official can read accounts', assertSucceeds(getDoc(doc(as('bg'), 'users', 'ct'))));
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
await check('any signed-in user can read alarms', assertSucceeds(getDoc(doc(ct, 'checkpointAlarms', 'b1'))));
await check('citizen can still submit a report', assertSucceeds(setDoc(doc(ct, 'reports', 'r1'), { userId: 'ct', location: { latitude: 1, longitude: 2 }, status: 'pending', severity: 'low' })));
await check('any signed-in user can read reports (public map)', assertSucceeds(getDoc(doc(as('bg'), 'reports', 'r1'))));

console.log('\n== Identity verification: applicants get no powers until approved');
const adp = as('ad_pend'), bgp = as('bg_pend'), bgr = as('bg_rej'), bgo = as('bg_ok');
await check('pending admin cannot read other accounts', assertFails(getDoc(doc(adp, 'users', 'ct'))));
await check('pending admin cannot set checkpoint alarms', assertFails(setDoc(doc(adp, 'checkpointAlarms', 'b2'), { barangayId: 'b2', hour: 8, minute: 0 })));
await check('pending barangay official cannot read accounts', assertFails(getDoc(doc(bgp, 'users', 'ct'))));
await check('pending barangay official cannot verify a report', assertFails(updateDoc(doc(bgp, 'reports', 'r_b1'), { status: 'verified' })));
await check('rejected barangay official cannot verify a report', assertFails(updateDoc(doc(bgr, 'reports', 'r_b1'), { status: 'verified' })));
await check('approved barangay official can verify a report', assertSucceeds(updateDoc(doc(bgo, 'reports', 'r_b1'), { status: 'verified' })));
await check('existing barangay official (no field) still works', assertSucceeds(getDoc(doc(as('bg'), 'users', 'ct'))));

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

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
