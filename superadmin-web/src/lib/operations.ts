import {
  Timestamp, addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';
import { barangayById } from './barangays';
import { db } from './firebase';
import { Actor, AuditAction } from './types';

// Field operations data shared with the mobile app: waste reports, managed checkpoints,
// barangay inspection submissions (`fieldCheckpoints`) and the app-wide settings document.

// ─── Types ───────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'moderate' | 'low';
export const SEVERITIES: Severity[] = ['critical', 'high', 'moderate', 'low'];

export type ReportStatus = 'pending' | 'verified' | 'assigned' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
export const REPORT_STATUSES: ReportStatus[] = ['pending', 'verified', 'assigned', 'in_progress', 'completed', 'rejected', 'cancelled'];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pending', verified: 'Verified', assigned: 'Assigned', in_progress: 'In progress',
  completed: 'Resolved', rejected: 'Rejected', cancelled: 'Cancelled',
};

/** The paper's four waste categories, plus electronic and mixed which the app also records. */
export type WasteGroup = 'plastic' | 'organic' | 'hazardous' | 'metal' | 'electronic' | 'mixed';
export const WASTE_GROUPS: WasteGroup[] = ['plastic', 'organic', 'hazardous', 'metal', 'electronic', 'mixed'];
export const WASTE_LABELS: Record<WasteGroup, string> = {
  plastic: 'Plastic', organic: 'Organic', hazardous: 'Hazardous', metal: 'Metal', electronic: 'Electronic', mixed: 'Mixed',
};

export interface Report {
  id: string;
  reportNumber: string;
  userName: string;
  userRole: string;
  barangayId?: string;
  barangay?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  severity: Severity;
  status: ReportStatus;
  wasteGroup: WasteGroup;
  wasteLabel: string;
  /** 0–100, or undefined when no AI analysis ran. */
  aiConfidence?: number;
  /** Where the waste is relative to the water (from the reporter or the AI). */
  waterContext?: 'in_water' | 'riverbank' | 'drainage' | 'unknown';
  blockage?: Severity;
  /** Cubic metres, as estimated by the AI. */
  estimatedVolume?: number;
  hazardous: boolean;
  checkpoint?: string;
  photoURL?: string;
  // Duplicate / hotspot flags set by the app right after submission.
  duplicateOfNumber?: string;
  nearbyReportCount?: number;
  // Labels for model training: what an official confirmed, what the reporter said, what the AI guessed.
  officialWasteType?: string;
  reporterWasteType?: string;
  aiWasteType?: string;
  createdAt: Date | null;
  respondedAt: Date | null;
  resolvedAt: Date | null;
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type Day = (typeof DAYS)[number];

export interface Checkpoint {
  id: string;
  name: string;
  barangayId: string;
  barangay: string;
  waterway: string;
  description: string;
  latitude?: number;
  longitude?: number;
  assignedUserIds: string[];
  assignedNames: string[];
  days: Day[];
  /** 24-hour "HH:MM". */
  time: string;
  isActive: boolean;
  lastInspectedAt: Date | null;
  lastInspectedByName?: string;
  lastCondition?: string;
  createdAt: Date | null;
}

export interface CheckpointInput {
  name: string;
  barangayId: string;
  waterway: string;
  description: string;
  latitude: string;
  longitude: string;
  assignedUserIds: string[];
  assignedNames: string[];
  days: Day[];
  time: string;
  isActive: boolean;
}

/** A barangay official's inspection submission from the mobile app. */
export interface Inspection {
  id: string;
  userId: string;
  userName: string;
  barangayId: string;
  barangay: string;
  checkpointId?: string;
  checkpointName?: string;
  type: string;
  condition: string;
  wasteType: string;
  status: 'pending' | 'verified';
  createdAt: Date | null;
}

export interface Settings {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  supportEmail: string;
  supportPhone: string;
  aiModelVersion: string;
  /** Below this AI confidence (0–100) a report is flagged for manual review. */
  aiReviewThreshold: number;
  defaultSeverityThresholds: { critical: number; high: number; moderate: number };
  notificationSettings: { enablePush: boolean; reportUpdateAlerts: boolean; criticalAlerts: boolean; inspectionReminders: boolean };
  featureFlags: Record<string, boolean>;
  /** A waste classifier trained on CleanStream's own photos (ml/README.md), used by the app when enabled. */
  customModel: { enabled: boolean; url: string; version: string };
  updatedAt: Date | null;
  updatedBy?: string;
}

export const FEATURE_FLAGS: Array<{ key: string; label: string }> = [
  { key: 'aiAnalysis', label: 'AI waste analysis' },
  { key: 'cleanupEvents', label: 'Volunteer cleanup events' },
  { key: 'messaging', label: 'In-app messaging' },
  { key: 'mapView', label: 'Hotspot map' },
  { key: 'announcements', label: 'Announcements' },
];

// Same document and defaults the mobile app uses (src/services/systemSettingsService.ts).
const SETTINGS_REF = () => doc(db, 'systemSettings', 'app');

export const DEFAULT_SETTINGS: Settings = {
  maintenanceMode: false,
  maintenanceMessage: '',
  supportEmail: 'support@cleanstream.ph',
  supportPhone: '+63 900 000 0000',
  aiModelVersion: 'v1.0',
  aiReviewThreshold: 60,
  defaultSeverityThresholds: { critical: 90, high: 70, moderate: 40 },
  notificationSettings: { enablePush: true, reportUpdateAlerts: true, criticalAlerts: true, inspectionReminders: true },
  featureFlags: { aiAnalysis: true, cleanupEvents: true, messaging: true, mapView: true, announcements: true },
  customModel: { enabled: false, url: '', version: '' },
  updatedAt: null,
};

// ─── Reading ─────────────────────────────────────────────────────────────────

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/** Maps the app's detailed AI labels (plastic_bottle, metal_can, …) onto the report categories. */
export const wasteGroupOf = (raw: string | undefined): WasteGroup => {
  const t = (raw ?? '').toLowerCase();
  if (!t) return 'mixed';
  if (t.includes('hazard')) return 'hazardous';
  if (t.includes('e_waste') || t.includes('electronic')) return 'electronic';
  if (t.includes('metal') || t.includes('can')) return 'metal';
  if (t.includes('food') || t.includes('organic') || t.includes('paper') || t.includes('cardboard')) return 'organic';
  if (t.includes('plastic') || t.includes('styrofoam') || t.includes('bottle') || t.includes('cigarette')) return 'plastic';
  return 'mixed';
};

export const toReport = (id: string, d: Record<string, unknown>): Report => {
  const ai = rec(d.aiAnalysis);
  const loc = rec(d.location);
  const aiTypes = Array.isArray(ai.wasteTypes) ? (ai.wasteTypes as Array<Record<string, unknown>>) : [];
  const listed = Array.isArray(d.wasteTypes) ? (d.wasteTypes as unknown[]).map(String) : [];
  const rawType = str(d.citizenWasteType) ?? str(d.groundTruthWasteType) ?? str(aiTypes[0]?.type) ?? listed[0];
  const conf = num(ai.confidence);
  const lat = num(loc.latitude);
  const lng = num(loc.longitude);
  const verifiedAt = toDate(d.verifiedAt);
  const assignedAt = toDate(d.assignedAt);
  const resolvedAt = toDate(d.resolvedAt);
  const severity = SEVERITIES.find((s) => s === d.severity) ?? 'moderate';
  return {
    id,
    reportNumber: str(d.reportNumber) ?? id.slice(0, 8).toUpperCase(),
    userName: str(d.userName) ?? '—',
    userRole: str(d.userRole) ?? 'citizen',
    barangayId: str(d.barangayId) ?? str(loc.barangayId),
    barangay: str(d.barangay) ?? str(loc.barangay),
    address: str(loc.address),
    // 0,0 is what a failed GPS fix leaves behind, not a real place.
    latitude: lat && lng ? lat : undefined,
    longitude: lat && lng ? lng : undefined,
    severity,
    status: REPORT_STATUSES.find((s) => s === d.status) ?? 'pending',
    wasteGroup: wasteGroupOf(rawType),
    wasteLabel: str(aiTypes[0]?.label) ?? (rawType ? rawType.replace(/_/g, ' ') : 'Unclassified'),
    aiConfidence: conf === undefined ? undefined : conf <= 1 ? Math.round(conf * 100) : Math.round(conf),
    estimatedVolume: num(ai.estimatedVolume),
    waterContext: (['in_water', 'riverbank', 'drainage', 'unknown'] as const).find((c) => c === rec(ai.waterway).context),
    blockage: SEVERITIES.find((s) => s === rec(rec(ai.waterway).blockage).level),
    hazardous: ai.hazardousDetected === true || wasteGroupOf(rawType) === 'hazardous',
    checkpoint: str(d.checkpoint),
    photoURL: str(d.photoURL),
    duplicateOfNumber: str(d.duplicateOfNumber),
    nearbyReportCount: num(d.nearbyReportCount),
    officialWasteType: str(d.groundTruthWasteType),
    reporterWasteType: str(d.citizenWasteType),
    aiWasteType: str(aiTypes[0]?.type),
    createdAt: toDate(d.createdAt),
    respondedAt: [verifiedAt, assignedAt, resolvedAt].find((x) => x) ?? null,
    resolvedAt,
  };
};

const sortNewest = <T extends { createdAt: Date | null }>(list: T[]): T[] =>
  list.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

/**
 * Every report in every barangay: the Super Admin oversees all of Cebu City (firestore.rules).
 * Sorted client-side: orderBy would silently drop documents that lack the field.
 */
export const subscribeReports = (onData: (r: Report[]) => void, onError: (e: Error) => void) =>
  onSnapshot(collection(db, 'reports'), (snap) => onData(sortNewest(snap.docs.map((x) => toReport(x.id, x.data())))), onError);

const toCheckpoint = (id: string, d: Record<string, unknown>): Checkpoint => ({
  id,
  name: str(d.name) ?? 'Unnamed checkpoint',
  barangayId: str(d.barangayId) ?? '',
  barangay: str(d.barangay) ?? '—',
  waterway: str(d.waterway) ?? '',
  description: str(d.description) ?? '',
  latitude: num(d.latitude),
  longitude: num(d.longitude),
  assignedUserIds: Array.isArray(d.assignedUserIds) ? (d.assignedUserIds as unknown[]).map(String) : [],
  assignedNames: Array.isArray(d.assignedNames) ? (d.assignedNames as unknown[]).map(String) : [],
  days: Array.isArray(d.days) ? DAYS.filter((day) => (d.days as unknown[]).includes(day)) : [],
  time: str(d.time) ?? '07:00',
  isActive: d.isActive !== false,
  lastInspectedAt: toDate(d.lastInspectedAt),
  lastInspectedByName: str(d.lastInspectedByName),
  lastCondition: str(d.lastCondition),
  createdAt: toDate(d.createdAt),
});

export const subscribeCheckpoints = (onData: (c: Checkpoint[]) => void, onError: (e: Error) => void) =>
  onSnapshot(
    collection(db, 'checkpoints'),
    (snap) => onData(snap.docs.map((x) => toCheckpoint(x.id, x.data())).sort((a, b) => a.barangay.localeCompare(b.barangay) || a.name.localeCompare(b.name))),
    onError,
  );

export const subscribeInspections = (onData: (i: Inspection[]) => void, onError: (e: Error) => void) =>
  onSnapshot(
    query(collection(db, 'fieldCheckpoints'), orderBy('createdAt', 'desc')),
    (snap) => onData(snap.docs.map((x) => {
      const d = x.data();
      return {
        id: x.id,
        userId: str(d.userId) ?? '',
        userName: str(d.userName) ?? 'Barangay official',
        barangayId: str(d.barangayId) ?? '',
        barangay: str(d.barangay) ?? '—',
        checkpointId: str(d.checkpointId),
        checkpointName: str(d.checkpointName),
        type: str(d.type) ?? '—',
        condition: str(d.condition) ?? '—',
        wasteType: str(d.wasteType) ?? '—',
        status: d.status === 'verified' ? 'verified' : 'pending',
        createdAt: toDate(d.createdAt),
      } satisfies Inspection;
    })),
    onError,
  );

export const subscribeSettings = (onData: (s: Settings) => void, onError: (e: Error) => void) =>
  onSnapshot(SETTINGS_REF(), (snap) => {
    const d = snap.data() ?? {};
    const thresholds = rec(d.defaultSeverityThresholds);
    const notes = rec(d.notificationSettings);
    const flags = rec(d.featureFlags);
    onData({
      maintenanceMode: d.maintenanceMode === true,
      maintenanceMessage: str(d.maintenanceMessage) ?? '',
      supportEmail: str(d.supportEmail) ?? DEFAULT_SETTINGS.supportEmail,
      supportPhone: str(d.supportPhone) ?? DEFAULT_SETTINGS.supportPhone,
      aiModelVersion: str(d.aiModelVersion) ?? DEFAULT_SETTINGS.aiModelVersion,
      aiReviewThreshold: num(d.aiReviewThreshold) ?? DEFAULT_SETTINGS.aiReviewThreshold,
      defaultSeverityThresholds: {
        critical: num(thresholds.critical) ?? 90,
        high: num(thresholds.high) ?? 70,
        moderate: num(thresholds.moderate) ?? 40,
      },
      notificationSettings: {
        enablePush: notes.enablePush !== false,
        reportUpdateAlerts: notes.reportUpdateAlerts !== false,
        criticalAlerts: notes.criticalAlerts !== false,
        inspectionReminders: notes.inspectionReminders !== false,
      },
      featureFlags: Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, flags[f.key] !== false])),
      customModel: {
        enabled: rec(d.customModel).enabled === true,
        url: str(rec(d.customModel).url) ?? '',
        version: str(rec(d.customModel).version) ?? '',
      },
      updatedAt: toDate(d.updatedAt),
      updatedBy: str(d.updatedByEmail) ?? str(d.updatedBy),
    });
  }, onError);

// ─── Writing ─────────────────────────────────────────────────────────────────

type OpsAuditAction = Extract<AuditAction, 'checkpoint.create' | 'checkpoint.update' | 'checkpoint.delete' | 'settings.update'>;

/** Same `auditLogs` shape the account actions write, with the checkpoint or settings as the "target". */
const logOps = async (actor: Actor, action: OpsAuditAction, targetId: string, targetName: string, details: string) => {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      action, actorUid: actor.uid, actorEmail: actor.email,
      targetUid: targetId, targetEmail: '', targetName, details, createdAt: serverTimestamp(),
    });
  } catch (e) {
    throw new Error(`The change was saved, but writing the audit log failed: ${(e as Error).message}`);
  }
};

const parseCoord = (v: string): number | null => {
  const n = Number(v.trim());
  return v.trim() && Number.isFinite(n) ? n : null;
};

/** Returns the reason the form can't be saved, or null when it's fine. */
export const validateCheckpoint = (input: CheckpointInput): Partial<Record<keyof CheckpointInput, string>> => {
  const errors: Partial<Record<keyof CheckpointInput, string>> = {};
  if (!input.name.trim()) errors.name = 'Give the checkpoint a name.';
  if (!barangayById(input.barangayId)) errors.barangayId = 'Choose a barangay.';
  const lat = parseCoord(input.latitude);
  const lng = parseCoord(input.longitude);
  if ((input.latitude.trim() || input.longitude.trim()) && (lat === null || lng === null)) {
    errors.latitude = 'Enter both latitude and longitude as numbers, or leave both empty.';
  } else if (lat !== null && lng !== null && (Math.abs(lat) > 90 || Math.abs(lng) > 180)) {
    errors.latitude = 'Latitude must be between -90 and 90, longitude between -180 and 180.';
  }
  if (input.days.length === 0) errors.days = 'Pick at least one inspection day.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) errors.time = 'Use a time like 07:30.';
  return errors;
};

const checkpointFields = (input: CheckpointInput) => {
  const b = barangayById(input.barangayId);
  return {
    name: input.name.trim(),
    barangayId: b?.id ?? input.barangayId,
    barangay: b?.name ?? '',
    waterway: input.waterway.trim(),
    description: input.description.trim(),
    latitude: parseCoord(input.latitude),
    longitude: parseCoord(input.longitude),
    assignedUserIds: input.assignedUserIds,
    assignedNames: input.assignedNames,
    days: DAYS.filter((d) => input.days.includes(d)),
    time: input.time,
    isActive: input.isActive,
  };
};

const scheduleText = (input: CheckpointInput) =>
  `${input.days.join(', ')} at ${input.time}; ${input.assignedNames.length ? `assigned to ${input.assignedNames.join(', ')}` : 'nobody assigned'}`;

export const createCheckpoint = async (actor: Actor, input: CheckpointInput) => {
  const fields = checkpointFields(input);
  const ref = await addDoc(collection(db, 'checkpoints'), { ...fields, createdBy: actor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await logOps(actor, 'checkpoint.create', ref.id, fields.name, `${fields.barangay}: ${scheduleText(input)}`);
};

export const updateCheckpoint = async (actor: Actor, target: Checkpoint, input: CheckpointInput) => {
  const fields = checkpointFields(input);
  await updateDoc(doc(db, 'checkpoints', target.id), { ...fields, updatedAt: serverTimestamp() });
  await logOps(actor, 'checkpoint.update', target.id, fields.name, `${fields.barangay}: ${scheduleText(input)}`);
};

export const setCheckpointActive = async (actor: Actor, target: Checkpoint, active: boolean) => {
  await updateDoc(doc(db, 'checkpoints', target.id), { isActive: active, updatedAt: serverTimestamp() });
  await logOps(actor, 'checkpoint.update', target.id, target.name, active ? 'Resumed inspections' : 'Paused inspections');
};

export const deleteCheckpoint = async (actor: Actor, target: Checkpoint) => {
  await deleteDoc(doc(db, 'checkpoints', target.id));
  await logOps(actor, 'checkpoint.delete', target.id, target.name, `Deleted checkpoint in ${target.barangay}`);
};

export const saveSettings = async (actor: Actor, next: Settings, changed: string[]) => {
  const { updatedAt: _u, updatedBy: _b, ...fields } = next;
  await setDoc(SETTINGS_REF(), { ...fields, updatedAt: serverTimestamp(), updatedBy: actor.uid, updatedByEmail: actor.email }, { merge: true });
  await logOps(actor, 'settings.update', 'systemSettings/app', 'System settings', changed.length ? `Changed ${changed.join(', ')}` : 'Saved without changes');
};
