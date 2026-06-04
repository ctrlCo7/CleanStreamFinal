export type UserRole = 'citizen' | 'admin' | 'barangay';

export type ReportStatus = 'pending' | 'in_progress' | 'resolved' | 'cancelled';

export type SeverityLevel = 'critical' | 'high' | 'moderate' | 'low';

export type WasteType = 'plastic' | 'organic' | 'hazardous' | 'metal' | 'electronic';

export interface User {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  barangay?: string;
  employeeId?: string;
  agency?: string;
  jurisdiction?: string;
  createdAt: string;
  photoURL?: string;
}

export interface GeoLocation {
  latitude: number;
  longitude: number;
  lat?: number;
  lng?: number;
  accuracy?: number;
  timestamp: number;
  barangay?: string;
  address?: string;
}

export interface WasteClassification {
  type: WasteType;
  percentage: number;
  label: string;
  color: string;
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
}

export interface WasteReport {
  id: string;
  userId: string;
  userRole: UserRole;
  userName: string;
  location: GeoLocation;
  photoURL: string;
  thumbnailURL?: string;
  notes?: string;
  checkpoint?: string;
  status: ReportStatus;
  severity: SeverityLevel;
  aiAnalysis?: AIAnalysisResult;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  assignedTeam?: string;
  assignedBarangay?: string;
}

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
  unreadCount: number;
  reportRef?: string;
  reportTag?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: 'critical' | 'high' | 'update' | 'resolved' | 'message' | 'ai_result';
  severity?: SeverityLevel;
  reportId?: string;
  read: boolean;
  timestamp: string;
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

// Navigation types
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
