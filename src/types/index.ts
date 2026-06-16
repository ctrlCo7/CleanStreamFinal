// ─── User & Auth ────────────────────────────────────────────────────────────

export type UserRole = 'citizen' | 'barangay' | 'cleanup_team' | 'admin';

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
  isActive: boolean;
  isVerified: boolean;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string;
}

// ─── Shared Primitives ───────────────────────────────────────────────────────

export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low';
export type WasteType = 'plastic' | 'organic' | 'hazardous' | 'metal' | 'electronic' | 'mixed';

/** Detailed 12-type waste classification returned by the AI Cloud Functions */
export type AIWasteType =
  | 'plastic_bottle' | 'plastic_bag' | 'glass_bottle' | 'metal_can'
  | 'paper_waste' | 'cardboard' | 'food_waste' | 'styrofoam'
  | 'cigarette_butt' | 'e_waste' | 'mixed_waste' | 'trash_pile';

export type WasteCategory =
  | 'recyclable' | 'non_recyclable' | 'organic' | 'hazardous' | 'electronic'
  | 'waterway_pollution' | 'severe_pollution' | 'moderate_pollution' | 'low_pollution';

export interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
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

export interface AIAnalysisResult {
  modelVersion: string;
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

export type CleanupTaskStatus = 'assigned' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface CleanupTask {
  id: string;
  reportId: string;
  barangayId: string;
  barangay: string;
  assignedTeamId: string;
  assignedTeamName: string;
  assignedByUserId: string;
  assignedByName: string;
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
  progressNotes?: string;
  completionNotes?: string;
  equipmentNeeded: string[];
  personnelCount: number;
  wasteCollectedKg?: number;
  isAiSuggested: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
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
  | 'system';

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
  | 'user_updated' | 'announcement_published' | 'notification_sent' | 'login' | 'logout';

export type ActivityEntityType = 'report' | 'task' | 'event' | 'user' | 'announcement' | 'barangay' | 'system';

export interface ActivityLog {
  id: string;
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
  CitizenTabs: undefined;
  AdminTabs: undefined;
  BarangayTabs: undefined;
  Map: { focusReport?: string };
  CitizenReport: undefined;
  CitizenAIResult: { report: WasteReport };
  CitizenDetail: { reportId: string };
  CitizenChat: { conversationId: string; participantName: string };
  AdminSchedule: { reportId?: string };
  AdminChat: { conversationId: string; participantName: string; reportTag?: string };
  BarangaySchedule: { reportId?: string };
  BarangayChat: { conversationId: string; participantName: string; reportTag?: string };
};

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

export type BarangayTabParamList = {
  BarangayDashboard: undefined;
  BarangayHistory: undefined;
  BarangayReport: undefined;
  BarangayMessages: undefined;
  BarangayProfile: undefined;
};
