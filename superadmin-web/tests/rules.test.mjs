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
  for (const [uid, role, extra] of [
    ['sa', 'superadmin'], ['ad', 'admin'], ['bg', 'barangay', { barangayId: 'b1' }], ['ct', 'citizen'],
    ['cl', 'cleanup_team'], ['victim', 'citizen'], ['ct2', 'citizen', { isVerified: false }],
    ['sa_off', 'superadmin', { isActive: false }],
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
await check('self-signup as barangay works (pending approval)', assertSucceeds(setDoc(doc(fresh2, 'users', 'brand_new2'), { uid: 'brand_new2', email: 'n2@x.co', firstName: 'N', lastName: 'W', role: 'barangay' })));
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

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
