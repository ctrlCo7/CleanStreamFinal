#!/usr/bin/env node
/**
 * CleanStream Firestore backup and restore, on Firebase's free (Spark) plan.
 *
 * Firestore's managed export (gcloud firestore export) needs the paid plan, so this script
 * uses the Admin SDK instead: it walks every collection and sub-collection and writes all
 * documents to one JSON file, keeping Firestore types (timestamps, geopoints, references).
 *
 * Usage (from the repository root, after `cd functions && npm install`):
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\cleanstream-service-account.json
 *   node scripts/backup/firestore-backup.mjs backup  backups/cleanstream-2026-11-04.json
 *   node scripts/backup/firestore-backup.mjs restore backups/cleanstream-2026-11-04.json
 *
 * Restore writes every document back with set() (it adds and overwrites, it never deletes),
 * so it is safe to run on a project that still has newer data. To test it without touching
 * production, set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and run against the emulator.
 *
 * Keep the service-account key and the backup files private: they contain personal data.
 * Photos live in Cloudinary and are backed up there (see DEPLOYMENT.md).
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

// firebase-admin is installed with the Cloud Functions package.
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../../functions/package.json'));
const admin = require('firebase-admin');

const [, , mode, file] = process.argv;
if (!['backup', 'restore'].includes(mode) || !file) {
  console.error('Usage: node scripts/backup/firestore-backup.mjs <backup|restore> <file.json>');
  process.exit(2);
}

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'cleanstream-b7942' });
const db = admin.firestore();
const { Timestamp, GeoPoint, DocumentReference } = admin.firestore;

// ─── Type-preserving JSON ─────────────────────────────────────────────────────
const encode = (v) => {
  if (v instanceof Timestamp) return { __t: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof GeoPoint) return { __t: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return { __t: 'ref', path: v.path };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
};
const decode = (v) => {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if (v.__t === 'ts') return new Timestamp(v.s, v.n);
    if (v.__t === 'geo') return new GeoPoint(v.lat, v.lng);
    if (v.__t === 'ref') return db.doc(v.path);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
};

async function dumpCollection(col, out) {
  const snap = await col.get();
  for (const d of snap.docs) {
    out[d.ref.path] = encode(d.data());
    for (const sub of await d.ref.listCollections()) await dumpCollection(sub, out);
  }
}

async function backup() {
  const out = {};
  for (const col of await db.listCollections()) await dumpCollection(col, out);
  const meta = { app: 'CleanStream', createdAt: new Date().toISOString(), documents: Object.keys(out).length };
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ meta, docs: out }));
  console.log(`Backed up ${meta.documents} documents to ${file}`);
}

async function restore() {
  const { meta, docs } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const paths = Object.keys(docs);
  console.log(`Restoring ${paths.length} documents from a backup made ${meta?.createdAt ?? '(unknown date)'}...`);
  for (let i = 0; i < paths.length; i += 400) {
    const batch = db.batch();
    for (const p of paths.slice(i, i + 400)) batch.set(db.doc(p), decode(docs[p]));
    await batch.commit();
  }
  console.log(`Restored ${paths.length} documents.`);
}

(mode === 'backup' ? backup() : restore()).catch((e) => {
  console.error(`${mode} failed:`, e.message || e);
  process.exit(1);
});
