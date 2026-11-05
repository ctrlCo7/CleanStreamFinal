#!/usr/bin/env node
/**
 * Clears CleanStream's report activity (reports, cleanups, inspections, alerts, logs) so the
 * app starts fresh, while keeping the setup: accounts, roles, barangays, checkpoints, staff
 * directory, announcements and settings.
 *
 * Safe by default:
 *   - without --yes it only COUNTS what would be deleted;
 *   - with --yes it first saves every document it is about to delete to
 *     backups/before-wipe-<time>.json (restore it with firestore-backup.mjs restore <file>),
 *     and only then deletes.
 *
 * Usage (from the repository root, after `cd functions && npm install`):
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\cleanstream-service-account.json
 *   node scripts/backup/wipe-report-data.mjs                      (count only)
 *   node scripts/backup/wipe-report-data.mjs --yes                (back up, then delete)
 *   node scripts/backup/wipe-report-data.mjs --yes --messages     (also clear chat threads)
 *
 * Photos are in Cloudinary and are not touched; delete them from the Cloudinary dashboard if needed.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../functions/package.json'));
const admin = require('firebase-admin');

const args = new Set(process.argv.slice(2));
const DELETE = args.has('--yes');

/** Report activity: everything here is created by using the app, not by setting it up. */
const WIPE = [
  'reports',          // waste reports (and any sub-collections)
  'cleanupTasks',     // proposed / approved / done cleanups
  'crewTracking',     // live truck positions
  'cleanupEvents',    // community cleanup events
  'fieldCheckpoints', // officials' inspection reports
  'notifications',    // in-app alerts
  'activityLogs',     // the Captain's activity log
  'scheduleLocks',    // per-day schedule locks (rebuilt automatically)
  'analytics',        // dashboard snapshots computed from reports
];
if (args.has('--messages')) WIPE.push('conversations');

// Never touched: users, verifications, auditLogs, barangays, checkpoints, checkpointAlarms,
// barangayStaff, pushTokens, announcements, feedback, systemSettings (and Firebase Auth).

const projectId = process.env.GCLOUD_PROJECT || 'cleanstream-b7942';
admin.initializeApp({ projectId });
const db = admin.firestore();
const { Timestamp, GeoPoint, DocumentReference } = admin.firestore;

const encode = (v) => {
  if (v instanceof Timestamp) return { __t: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof GeoPoint) return { __t: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return { __t: 'ref', path: v.path };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
};

async function dump(col, out) {
  const snap = await col.get();
  for (const d of snap.docs) {
    out[d.ref.path] = encode(d.data());
    for (const sub of await d.ref.listCollections()) await dump(sub, out);
  }
  return snap.size;
}

async function main() {
  const where = process.env.FIRESTORE_EMULATOR_HOST ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}` : `project ${projectId}`;
  console.log(`${DELETE ? 'WIPING' : 'Counting (nothing is deleted)'} on ${where}\n`);

  const out = {};
  const counts = {};
  for (const name of WIPE) counts[name] = await dump(db.collection(name), out);
  for (const name of WIPE) console.log(`  ${name.padEnd(18)} ${counts[name]}`);
  const total = Object.keys(out).length;
  console.log(`\n  ${total} documents in all (including sub-collections)`);

  if (!DELETE) {
    console.log('\nNothing was deleted. Run again with --yes to back these up and delete them.');
    return;
  }
  if (total === 0) { console.log('\nNothing to delete.'); return; }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.resolve(here, '../../backups', `before-wipe-${stamp}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ meta: { app: 'CleanStream', createdAt: new Date().toISOString(), documents: total, wiped: WIPE }, docs: out }));
  console.log(`\nBacked up to ${file}`);

  for (const name of WIPE) {
    if (!counts[name]) continue;
    await db.recursiveDelete(db.collection(name));
    console.log(`  deleted ${name}`);
  }
  console.log('\nDone. Accounts, barangays, checkpoints and settings were kept.');
}

main().catch((e) => {
  console.error('\nFailed:', e.message);
  if (/credential|authenticat|permission/i.test(e.message)) {
    console.error('Set GOOGLE_APPLICATION_CREDENTIALS to your Firebase service-account key first (see the top of this file).');
  }
  process.exit(1);
});
