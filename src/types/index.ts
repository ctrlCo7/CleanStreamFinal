// ─── User & Auth ────────────────────────────────────────────────────────────

// 'superadmin' accounts exist only for the web portal (superadmin-web/) and never use this app.
export type UserRole = 'citizen' | 'barangay' | 'cleanup_team' | 'admin' | 'superadmin';

export interface User {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  role: UserRole;
  barangayId?: string;
  barangay?: string;
  photoURL?: string;
  fcmToken?: string;
  employeeId?: string;
  agency?: string;
  jurisdiction?: string;
  // Contact number (normalised, e.g. +639171234567). Crews and officials are reached by phone.
  phone?: string;
  // What this person chose to be notified about (Profile → Notification settings).
  notificationPrefs?: import('../services/notificationPrefs').NotificationPrefs;
  // Set only for Admin / Barangay Official sign-ups, which must have their ID and face
  // checked by the Super Admin. 'pending' and 'rejected' accounts have no staff powers.
  idVerification?: IdVerificationStatus;
  idRejectionReason?: string;
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

// ─── Identity verification (Admin / Barangay Official sign-up) ───────────────

export type IdVerificationStatus = 'pending' | 'approved' | 'rejected';

export type IdType =
  | 'philsys' | 'umid' | 'passport' | 'drivers_license' | 'prc' | 'postal'
  | 'voters' | 'sss' | 'gsis' | 'govt_employee' | 'other_govt';

export type SelfieStep = 'neutral' | 'smile' | 'turn';

/** What the phone itself could establish. Advisory only: the Super Admin decides. */
export interface IdentityClientChecks {
  mode: 'mlkit' | 'unavailable';
  faceOnId: boolean;
  textReadable: boolean;
  lastNameOnId: boolean | null;
  firstNameOnId: boolean | null;
  liveness: Record<SelfieStep, boolean>;
}

export interface IdentityEvidence {
  idType: IdType;
  idImage: string;                          // JPEG data URI
  selfies: Record<SelfieStep, string>;      // JPEG data URIs
  clientChecks: IdentityClientChecks;
}

// ─── Shared Primitives ───────────────────────────────────────────────────────

export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low';
export type WasteType = 'plastic' | 'organic' | 'hazardous' | 'metal' | 'electronic' | 'mixed';

/** Detailed 12-type waste classification returned by the AI Cloud Functions */
export type AIWasteType =
  | 'plastic_bottle' | 'plastic_bag' | 'glass_bottle' | 'metal_can'
  | 'paper_waste' | 'cardboard' | 'food_waste' | 'styrofoam'
  | 'cigarette_butt' | 'e_waste' | 'mixed_waste' | 'trash_pile' | 'hazardous_waste';

export type WasteCategory =
  | 'recyclable' | 'non_recyclable' | 'organic' | 'hazardous' | 'electronic'
  | 'waterway_pollution' | 'severe_pollution' | 'moderate_pollution' | 'low_pollution';

export type LocationSource = 'gps' | 'pin' | 'search' | 'approximate';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  /** How the spot was set: live GPS, a pin the reporter placed on the map, a place search, or a barangay centre (approximate). */
  source?: LocationSource;
  timestamp: number;
  barangayId?: string;
  barangay?: string;
  address?: string;
}

export interface WasteClassification {
  type: string;   // WasteType (legacy) or AIWasteType (Cloud Functions)
  percentage: number;
  label: string;
  color: string;
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

export interface DetectedObject {
  label: string;
  wasteType: AIWasteType;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  color: string;
}

export interface CNNClassification {
  category: WasteCategory;
  confidence: number;
  label: string;
  allScores?: Array<{ category: WasteCategory; confidence: number; label: string }>;
}

export interface AIDisposalRecommendation {
  wasteType: AIWasteType;
  wasteLabel: string;
  category: WasteCategory;
  action: string;
  facility: string;
  urgency: 'immediate' | 'scheduled' | 'routine';
  icon: string;
}

export interface EnvironmentalRiskScore {
  riskScore: number;
  severityLevel: SeverityLevel;
  coverageRatio: number;
  densityClass: 'sparse' | 'moderate' | 'dense' | 'severe';
  hazardousPresent: boolean;
  estimatedCleanupHours: number;
  waterBodyAffected: boolean;
  factors: {
    objectCountScore: number;
    densityScore: number;
    hazardScore: number;
    coverageScore: number;
  };
}

// ─── Waterway assessment ─────────────────────────────────────────────────────

/** Where the waste is relative to the water. 'unknown' when neither the reporter nor the AI could tell. */
export type WaterContext = 'in_water' | 'riverbank' | 'drainage' | 'unknown';

export type WaterColor = 'blue' | 'green' | 'brown' | 'dark';

export interface PhotoQuality {
  level: 'good' | 'fair' | 'poor';
  issues: Array<'too_dark' | 'overexposed' | 'blurry' | 'low_contrast'>;
}

/** Rain expected at the report's location (Open-Meteo forecast). */
export interface RainOutlook {
  level: 'none' | 'light' | 'moderate' | 'heavy';
  next24hMm: number;
  next72hMm: number;
  /** Highest hourly chance of rain in the next 24 hours, 0–100. */
  maxProbability: number;
  fetchedAt: string;
}

/** What the AI found in one cleanup-task photo, kept small for the task document. */
export interface PhotoWasteSummary {
  objectCount: number;
  volumeM3: number;
  severityScore: number;
  analyzedAt: string;
  /** 'report' = taken from the original report's analysis because no before photo was analyzed. */
  source: 'photo' | 'report';
}

export interface SeverityFactor {
  label: string;
  points: number;
}

export interface WaterwayAssessment {
  context: WaterContext;
  /** 'reporter' = the person filing said so; 'ai' = inferred from the photo. */
  contextSource: 'reporter' | 'ai' | 'none';
  /** 0–100: how likely the photo shows water. */
  waterLikelihood: number;
  /** Visual estimate of the water's color, when water was found in the photo. */
  waterColor?: WaterColor;
  blockage: { score: number; level: SeverityLevel };
  floodRisk: SeverityLevel;
  spreadRisk: SeverityLevel;
  contamination: { score: number; level: SeverityLevel };
  /** 0–100: share of the detected items that float and drift downstream. */
  floatableShare: number;
  rainySeason: boolean;
  rain?: RainOutlook;
  healthRisks: string[];
  actions: string[];
  equipment: string[];
  /** Points added to the detection-based severity score, and why. */
  severityFactors: SeverityFactor[];
}

export interface AIAnalysisResult {
  modelVersion: string;
  /** 'unavailable' = the AI couldn't run on this phone; the numbers are a neutral placeholder. */
  analysisSource?: 'on_device' | 'cloud' | 'unavailable';
  /** Severity from the detected items alone, before waterway factors were added. */
  baseSeverityScore?: number;
  waterway?: WaterwayAssessment;
  photoQuality?: PhotoQuality;
  confidence: number;
  severityScore: number;
  severityLevel: SeverityLevel;
  wasteTypes: WasteClassification[];
  estimatedVolume: number;
  spreadArea: number;
  hazardousDetected: boolean;
  teamNeeded: string;
  cleanupPriority: string;
  timestamp: string;
  // Cloud Functions AI pipeline extras (optional — present when cloud analysis ran)
  predictionId?: string;
  objectCount?: number;
  coverageRatio?: number;
  environmentalImpact?: string;
  processedImageURL?: string;
  detectedObjects?: DetectedObject[];
  cnnResult?: CNNClassification;
  recommendations?: AIDisposalRecommendation[];
  environmental?: EnvironmentalRiskScore;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export type ReportStatus =
  | 'pending'
  | 'verified'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface StatusHistoryEntry {
  status: ReportStatus;
  changedBy: string;
  changedByName: string;
  changedAt: string;
  note?: string;
}

/** The kind of environmental concern a citizen reports. */
export type ConcernType = 'clogged_drainage' | 'garbage_accumulation' | 'polluted_waterway' | 'illegal_dumping' | 'other';

export const CONCERN_LABELS: Record<ConcernType, string> = {
  clogged_drainage: 'Clogged drainage',
  garbage_accumulation: 'Garbage accumulation',
  polluted_waterway: 'Polluted waterway',
  illegal_dumping: 'Illegal dumping',
  other: 'Other concern',
};

export interface WasteReport {
  id: string;
  reportNumber: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  barangayId?: string;
  barangay?: string;
  location: GeoLocation;
  photoURL: string;
  thumbnailURL?: string;
  /** The photo couldn't be uploaded yet; the reporter's phone keeps retrying (photoRetry.ts). */
  photoPending?: boolean;
  notes?: string;
  checkpoint?: string;
  status: ReportStatus;
  severity: SeverityLevel;
  wasteTypes?: WasteType[];
  aiAnalysis?: AIAnalysisResult;
  assignedTeamId?: string;
  assignedTeamName?: string;
  assignedBarangayId?: string;
  cleanupTaskId?: string;
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  assignedAt?: string;
  resolvedAt?: string;
  rejectionReason?: string;
  // Human-confirmed labels captured at verification time -- when a barangay official
  // verifies a report, they confirm or correct the AI's severity/waste-type call.
  // This is the ground truth ml-waste-detection's export script trains on; an
  // unmodified confirmation (groundTruth* equal to the AI's own severity/wasteTypes[0])
  // is itself a valid positive training example, not just corrections.
  groundTruthSeverity?: SeverityLevel;
  groundTruthWasteType?: AIWasteType;
  // What the reporter says the waste is (confirmed or corrected on the AI result screen).
  citizenWasteType?: AIWasteType;
  /** What kind of problem the reporter says it is. */
  concernType?: ConcernType;
  /** The date the reporter saw the problem (YYYY-MM-DD, Philippine date). */
  incidentDate?: string;
  /** Filed by an official from a checkpoint inspection that found an issue. */
  fromCheckpointId?: string;
  // Set right after submission by checkNearbyReports (reportProximity.ts).
  duplicateOf?: string;
  duplicateOfNumber?: string;
  duplicateDistanceM?: number;
  /** Reports within 100 m in the last 90 days, this one included; 3+ makes it a hotspot. */
  nearbyReportCount?: number;
  /** Set when the report was filed offline and uploaded later. */
  capturedAt?: string;
  statusHistory: StatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

// ─── Barangay ─────────────────────────────────────────────────────────────────

export interface Barangay {
  id: string;
  name: string;
  city: string;
  province: string;
  region: string;
  captainName: string;
  contactNumber: string;
  email?: string;
  centerLocation: GeoLocation;
  activeReports: number;
  resolvedReports: number;
  totalReports: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Cleanup Tasks ────────────────────────────────────────────────────────────

/**
 * proposed  – an official proposed it; waiting for the Barangay Captain's approval
 * declined  – declined automatically: it clashed with an approved cleanup (see `conflict`)
 * rejected  – the Captain rejected it (see `rejectionRemarks`)
 * assigned  – approved by the Captain; the crew has been told
 * accepted / in_progress / completed / cancelled – the crew's progress
 */
export type CleanupTaskStatus =
  | 'proposed' | 'declined' | 'rejected'
  | 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

/** The approved cleanup a request clashed with, kept on the declined request. */
export interface ScheduleConflictInfo {
  taskId: string;
  title: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  place: string;
  crewName: string;
  reasons: string[];
  message: string;
}

export interface CleanupTask {
  id: string;
  reportId: string;
  barangayId: string;
  barangay: string;
  // assignedTeamId is the crew LEADER's user id (their account is what sees and works the task).
  assignedTeamId: string;
  assignedTeamName: string;
  assignedTeamPhone?: string;
  assignedByUserId: string;
  assignedByName: string;
  assignedByPhone?: string;
  // Copied from the report so a crew (who can't read other users' data) can notify and describe it.
  reporterUserId?: string;
  reportNumber?: string;
  title: string;
  description: string;
  location: GeoLocation;
  priority: SeverityLevel;
  status: CleanupTaskStatus;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  estimatedDurationMinutes: number;
  actualStartTime?: string;
  actualEndTime?: string;
  beforePhotoURLs: string[];
  afterPhotoURLs: string[];
  // What the on-device AI found in the before/after photos (cleanupComparison.ts).
  beforeAnalysis?: PhotoWasteSummary;
  afterAnalysis?: PhotoWasteSummary;
  progressNotes?: string;
  completionNotes?: string;
  equipmentNeeded: string[];
  personnelCount: number;
  wasteCollectedKg?: number;
  declineReason?: string;
  // Schedule approval (the Barangay Captain only)
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectedByUserId?: string;
  rejectedByName?: string;
  rejectionRemarks?: string;
  decidedAt?: string;
  /** Set when the request was declined automatically for clashing with an approved cleanup. */
  conflicts?: ScheduleConflictInfo[];
  /** A free time the system suggested instead, when it declined the request. */
  suggestedSlot?: { scheduledDate: string; startTime: string; endTime: string };
  // Set when an official records the work on behalf of a crew without the app.
  recordedByUserId?: string;
  recordedByName?: string;
  // Set when an official/admin confirms the cleanup, which closes the report.
  confirmedByUserId?: string;
  confirmedAt?: string;
  isAiSuggested: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ─── Live crew tracking ───────────────────────────────────────────────────────

/**
 * The crew's trip to a cleanup site, in `crewTracking/{taskId}`. Written only by the crew
 * leader's phone while the trip is active; read by the official, the Admin and the
 * resident who reported the waste (see crewTrackingService.ts and firestore.rules).
 */
export interface CrewTracking {
  taskId: string;
  reportId: string;
  crewId: string;
  crewName: string;
  barangayId: string;
  reporterUserId?: string;
  status: 'en_route' | 'arrived' | 'ended';
  latitude: number;
  longitude: number;
  /** Degrees, 0 = north. */
  heading: number;
  /** Metres per second, when the phone reports it. */
  speed?: number;
  accuracy?: number;
  destination: { latitude: number; longitude: number };
  /** Road route from where the trip (or the last re-route) started, simplified. */
  route: Array<{ latitude: number; longitude: number }>;
  routeSource: 'osrm' | 'straight';
  routeDistanceM: number;
  routeDurationS: number;
  remainingM: number;
  etaSeconds: number;
  /** Metres driven along `route` (when the truck is on it), so viewers can glide it along the road. */
  alongM?: number;
  /** True when the truck is on its route and shown on the road rather than at the raw GPS fix. */
  onRoute?: boolean;
  /** True while the truck is away from its route (a new route is being worked out). */
  offRoute?: boolean;
  /** Bumped every time the route is recalculated, so viewers know the old one no longer applies. */
  routeVersion?: number;
  /** Length of the first route of the trip (re-routes don't change it), for "40% of the way". */
  tripDistanceM?: number;
  startedAt: number;
  /** Milliseconds since epoch on the crew's phone, for "updated 5 s ago". */
  updatedAtMs: number;
  arrivedAt?: number;
}

// ─── Cleanup Events ───────────────────────────────────────────────────────────

export type CleanupEventStatus = 'upcoming' | 'ongoing' | 'completed' | 'cancelled';

export interface CleanupEvent {
  id: string;
  title: string;
  description: string;
  barangayId: string;
  barangay: string;
  organizedBy: string;
  organizerName: string;
  location: GeoLocation;
  locationAddress: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  currentParticipants: number;
  status: CleanupEventStatus;
  coverPhotoURL?: string;
  tags: string[];
  requirements: string[];
  volunteersNeeded: number;
  participantIds: string[];
  targetWasteTypes: WasteType[];
  createdAt: string;
  updatedAt: string;
}

export interface EventParticipant {
  userId: string;
  userName: string;
  userPhotoURL?: string;
  joinedAt: string;
  attendanceStatus: 'registered' | 'attended' | 'no_show';
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType =
  | 'report_submitted'
  | 'report_verified'
  | 'report_assigned'
  | 'report_in_progress'
  | 'report_completed'
  | 'report_rejected'
  | 'task_assigned'
  | 'task_updated'
  | 'event_reminder'
  | 'announcement'
  | 'message'
  | 'ai_result'
  | 'system'
  | 'report_forwarded'
  | 'schedule_proposed'
  | 'schedule_approved'
  | 'schedule_rejected'
  | 'schedule_declined'
  | 'checkpoint_missed'
  | 'checkpoint_completed'
  | 'checkpoint_issue'
  | 'crew_request';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  severity?: SeverityLevel;
  reportId?: string;
  taskId?: string;
  eventId?: string;
  announcementId?: string;
  conversationId?: string;
  read: boolean;
  readAt?: string;
  imageURL?: string;
  createdAt: string;
}

// ─── Announcements ────────────────────────────────────────────────────────────

export type AnnouncementPriority = 'urgent' | 'high' | 'normal' | 'low';
export type AnnouncementType = 'general' | 'event' | 'alert' | 'maintenance' | 'policy';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  targetRoles: Array<UserRole | 'all'>;
  targetBarangayIds: string[];
  priority: AnnouncementPriority;
  type: AnnouncementType;
  imageURL?: string;
  attachmentURLs: string[];
  isActive: boolean;
  isPinned: boolean;
  viewCount: number;
  publishedAt: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

export type ActivityAction =
  | 'report_created' | 'report_updated' | 'report_verified' | 'report_assigned'
  | 'report_completed' | 'report_rejected' | 'task_created' | 'task_updated'
  | 'task_completed' | 'event_created' | 'event_joined' | 'user_registered'
  | 'user_updated' | 'announcement_published' | 'notification_sent' | 'login' | 'logout'
  | 'schedule_proposed' | 'schedule_approved' | 'schedule_rejected' | 'schedule_declined'
  | 'checkpoint_inspected' | 'checkpoint_issue' | 'checkpoint_missed';

export type ActivityEntityType = 'report' | 'task' | 'event' | 'user' | 'announcement' | 'barangay' | 'system';

export interface ActivityLog {
  id: string;
  /** The barangay it happened in, so its Captain can review it (activity log). */
  barangayId?: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  details: Record<string, string | number | boolean>;
  deviceInfo?: string;
  timestamp: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export type AnalyticsPeriodType = 'daily' | 'monthly' | 'yearly';

export interface BarangayStat {
  barangayId: string;
  name: string;
  totalReports: number;
  resolvedReports: number;
  resolutionRate: number;
  avgResponseHours: number;
}

export interface AnalyticsSnapshot {
  id: string;
  period: string;
  periodType: AnalyticsPeriodType;
  date: string;
  totalReports: number;
  pendingReports: number;
  verifiedReports: number;
  assignedReports: number;
  completedReports: number;
  rejectedReports: number;
  criticalReports: number;
  highReports: number;
  moderateReports: number;
  lowReports: number;
  resolutionRate: number;
  avgResponseTimeHours: number;
  totalCleanupTasks: number;
  completedTasks: number;
  totalEvents: number;
  activeUsers: number;
  newUsers: number;
  wasteCollectedKg: number;
  hazardousReports: number;
  barangayStats: BarangayStat[];
  wasteTypeBreakdown: Record<WasteType, number>;
  aiStats: {
    totalScans: number;
    avgConfidence: number;
    hazardousFlags: number;
    modelVersion: string;
  };
  createdAt: string;
  updatedAt: string;
}

// Legacy alias kept for screen compatibility
export interface AnalyticsData {
  totalReports: number;
  criticalCount: number;
  highCount: number;
  pendingCount: number;
  resolvedCount: number;
  resolutionRate: number;
  avgResponseHours: number;
  hazardousCount: number;
  monthlyData: { month: string; count: number }[];
  wasteTypeDistribution: WasteClassification[];
  barangayPollution: { name: string; percentage: number }[];
  aiStats: {
    totalScans: number;
    avgConfidence: number;
    hazardousFlags: number;
    modelVersion: string;
  };
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export type FeedbackType = 'bug_report' | 'feature_request' | 'general' | 'report_feedback';
export type FeedbackStatus = 'open' | 'in_review' | 'resolved' | 'closed';

export interface Feedback {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  type: FeedbackType;
  rating: number;
  subject: string;
  message: string;
  referenceId?: string;
  status: FeedbackStatus;
  adminResponse?: string;
  screenshotURLs: string[];
  appVersion: string;
  createdAt: string;
  updatedAt: string;
}

// ─── System Settings ──────────────────────────────────────────────────────────

export interface SystemSettings {
  appVersion: string;
  minAppVersion: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  aiModelVersion: string;
  maxPhotoSizeMB: number;
  allowedPhotoTypes: string[];
  defaultSeverityThresholds: {
    critical: number;
    high: number;
    moderate: number;
  };
  notificationSettings: {
    enablePush: boolean;
    enableEmail: boolean;
    reportUpdateAlerts: boolean;
    criticalAlerts: boolean;
  };
  featureFlags: Record<string, boolean>;
  /** CleanStream's own trained waste classifier (set in the Super Admin portal). */
  customModel?: { enabled: boolean; url: string; version?: string };
  supportEmail: string;
  supportPhone: string;
  updatedAt: string;
  updatedBy: string;
}

// ─── Messaging ────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  receiverId: string;
  content: string;
  timestamp: string;
  read: boolean;
  reportRef?: string;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  participantRoles: Record<string, UserRole>;
  lastMessage: string;
  lastMessageTime: string;
  unreadCounts: Record<string, number>;
  reportRef?: string;
  reportTag?: string;
  /** Set on a citizen's chat with a barangay's shared inbox (any of its officials can answer). */
  barangayId?: string;
  barangayName?: string;
  citizenId?: string;
}

// ─── Legacy schedule types (kept for screen compatibility) ────────────────────

export interface CleanupSchedule {
  id: string;
  reportId: string;
  location: string;
  barangay: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  personnel: string;
  priority: SeverityLevel;
  status: 'scheduled' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  assignedTeam?: string;
  assignedBarangayUnit?: string;
  notes?: string;
  aiSuggested: boolean;
  approvedBy?: string;
  createdAt: string;
}

export interface CheckpointSchedule {
  id: string;
  name: string;
  location: string;
  barangay: string;
  dayOfWeek: string[];
  time: string;
  severity: SeverityLevel;
  status: 'assigned' | 'upcoming' | 'in_progress' | 'completed';
  assignedTo: string;
  notes?: string;
}

export interface BarangayCheckIn {
  id: string;
  userId: string;
  userName: string;
  checkpointId: string;
  checkpointName: string;
  location: GeoLocation;
  photoURL?: string;
  timestamp: string;
  status: 'checked_in' | 'completed' | 'missed';
  notes?: string;
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Signup: undefined;
  IdentityVerification: { mode: 'signup' | 'resubmit'; firstName: string; lastName: string };
  VerificationPending: undefined;
  CleanupTabs: undefined;
  CleanupTaskDetail: { taskId: string };
  BarangayCrewTasks: undefined;
  BarangayAssignCrew: { reportId: string };
  BarangayCreateEvent: undefined;
  BarangayEventDetail: { eventId: string };
  CitizenEvents: undefined;
  CitizenEventDetail: { eventId: string };
  CitizenTabs: undefined;
  AdminTabs: undefined;
  BarangayTabs: undefined;
  Map: { focusReport?: string };
  // Officials can open it from a checkpoint inspection that found an issue (filled in for them).
  CitizenReport: { fromCheckpointId?: string; checkpointName?: string; notes?: string } | undefined;
  CitizenAIResult: { report: WasteReport };
  CitizenDetail: { reportId: string };
  CitizenChat: { conversationId: string; participantName: string; receiverId?: string };
  CitizenNotifications: undefined;
  AdminSchedule: { reportId?: string };
  AdminAlerts: undefined;
  AdminChat: { conversationId: string; participantName: string; reportTag?: string };
  BarangaySchedule: { reportId?: string };
  BarangayVerify: undefined;
  BarangayVerifyDetail: { reportId: string };
  BarangayChat: { conversationId: string; participantName: string; reportTag?: string; receiverId?: string; inboxKey?: string };
  BarangayAlarms: undefined;
  AdminCheckpointAlarms: undefined;
  AdminApprovals: undefined;
  RequestCrew: undefined;
};

// ─── Cleanup team account requests ────────────────────────────────────────────
// An official or the Captain asks the Super Admin for a cleanup crew account for their
// barangay. The Super Admin (web portal) creates the account or declines with a reason.

export type CrewRequestStatus = 'pending' | 'approved' | 'declined' | 'cancelled';

export interface CrewRequest {
  id: string;
  barangayId: string;
  barangay: string;
  requestedBy: string;
  requestedByName: string;
  requestedByRole: 'admin' | 'barangay';
  /** What the crew will be called, e.g. "Talamban Cleanup Crew 2". */
  teamName: string;
  crewSize: number;
  /** Who will sign in for the crew (the crew leader), if already known. */
  leaderName?: string;
  leaderEmail?: string;
  leaderPhone?: string;
  reason: string;
  status: CrewRequestStatus;
  createdAt: string;
  decidedAt?: string;
  decidedByName?: string;
  declineReason?: string;
  /** The account the Super Admin created for this request. */
  accountEmail?: string;
}

export type CitizenTabParamList = {
  CitizenHome: undefined;
  CitizenHistory: undefined;
  MapTab: undefined;
  CitizenMessages: undefined;
  CitizenProfile: undefined;
};

export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminAnalytics: undefined;
  AdminHistory: undefined;
  AdminMessages: undefined;
  AdminProfile: undefined;
};

export type CleanupTabParamList = {
  CleanupTasks: undefined;
  CleanupProfile: undefined;
};

export type BarangayTabParamList = {
  BarangayDashboard: undefined;
  BarangayHistory: undefined;
  BarangayReport: undefined;
  BarangayMessages: undefined;
  BarangayProfile: undefined;
};
