import React, { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthChange } from '../services/authService';
import { restoreSession, setUser } from '../store/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { useTheme } from '../hooks/useTheme';
import { RootStackParamList } from '../types';

import SplashScreen from '../screens/SplashScreen';
import LoadingScreen from '../screens/LoadingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import IdentityVerificationScreen from '../screens/auth/IdentityVerificationScreen';
import VerificationPendingScreen from '../screens/auth/VerificationPendingScreen';
import MapScreen from '../screens/MapScreen';

import CitizenNavigator from './CitizenNavigator';
import AdminNavigator from './AdminNavigator';
import BarangayNavigator from './BarangayNavigator';
import CleanupNavigator from './CleanupNavigator';

import CitizenReportScreen from '../screens/citizen/ReportScreen';
import CitizenAIResultScreen from '../screens/citizen/AIResultScreen';
import CitizenDetailScreen from '../screens/citizen/ReportDetailScreen';
import CitizenChatScreen from '../screens/citizen/ChatScreen';
import CitizenNotificationsScreen from '../screens/citizen/NotificationsScreen';
import AdminScheduleScreen from '../screens/admin/ScheduleScreen';
import AdminAlertsScreen from '../screens/admin/AlertsScreen';
import AdminChatScreen from '../screens/admin/ChatScreen';
import BarangayScheduleScreen from '../screens/barangay/ScheduleScreen';
import BarangayChatScreen from '../screens/barangay/ChatScreen';
import BarangayVerifyReportsScreen from '../screens/barangay/VerifyReportsScreen';
import BarangayVerifyReportDetailScreen from '../screens/barangay/VerifyReportDetailScreen';
import BarangayAlarmsScreen from '../screens/barangay/AlarmsScreen';
import CleanupTaskDetailScreen from '../screens/cleanup/CleanupTaskDetailScreen';
import BarangayCrewTasksScreen from '../screens/barangay/CrewTasksScreen';
import BarangayAssignCrewScreen from '../screens/barangay/AssignCrewScreen';
import BarangayCreateEventScreen from '../screens/barangay/CreateEventScreen';
import BarangayEventDetailScreen from '../screens/barangay/EventDetailScreen';
import CitizenEventsScreen from '../screens/citizen/EventsScreen';
import CitizenEventDetailScreen from '../screens/citizen/EventDetailScreen';
import AdminCheckpointAlarmsScreen from '../screens/admin/CheckpointAlarmsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAppSelector((s) => s.auth);
  const { colors, isDark } = useTheme();
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        await dispatch(restoreSession(firebaseUser.uid));
      } else {
        dispatch(setUser(null));
      }
      setInitializing(false);
    });
    return unsub;
  }, [dispatch]);

  if (initializing) return <LoadingScreen />;

  // Admin / Barangay Official applicants stay on the waiting screen until the Super Admin
  // approves their ID (the security rules give them no powers until then either).
  const awaitingIdReview = user?.idVerification === 'pending' || user?.idVerification === 'rejected';

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.appBg,
      card: colors.white,
      text: colors.textPrimary,
      border: colors.border,
      primary: colors.teal,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {isAuthenticated && user && awaitingIdReview ? (
          <>
            <Stack.Screen name="VerificationPending" component={VerificationPendingScreen} />
            <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
          </>
        ) : isAuthenticated && user ? (
          <>
            {/* The signed-in role's Tabs screen must be declared FIRST: React Navigation
                only re-derives the initial route from the 0th declared screen when the
                set of screens itself changes (e.g. on login/logout) -- `initialRouteName`
                is only honored on the very first mount and is NOT reactive to later state
                changes, which was why signing out previously left the app stuck on the
                current tab screen instead of returning to Login. */}
            {user.role === 'admin' ? (
              <Stack.Screen name="AdminTabs" component={AdminNavigator} />
            ) : user.role === 'barangay' ? (
              <Stack.Screen name="BarangayTabs" component={BarangayNavigator} />
            ) : user.role === 'cleanup_team' ? (
              <Stack.Screen name="CleanupTabs" component={CleanupNavigator} />
            ) : (
              <Stack.Screen name="CitizenTabs" component={CitizenNavigator} />
            )}

            <Stack.Screen name="Map" component={MapScreen} />
            <Stack.Screen name="CitizenReport" component={CitizenReportScreen} />
            <Stack.Screen name="CitizenAIResult" component={CitizenAIResultScreen} />
            <Stack.Screen name="CitizenDetail" component={CitizenDetailScreen} />
            <Stack.Screen name="CitizenChat" component={CitizenChatScreen} />
            <Stack.Screen name="CitizenNotifications" component={CitizenNotificationsScreen} />
            <Stack.Screen name="AdminSchedule" component={AdminScheduleScreen} />
            <Stack.Screen name="AdminAlerts" component={AdminAlertsScreen} />
            <Stack.Screen name="AdminChat" component={AdminChatScreen} />
            <Stack.Screen name="BarangaySchedule" component={BarangayScheduleScreen} />
            <Stack.Screen name="BarangayVerify" component={BarangayVerifyReportsScreen} />
            <Stack.Screen name="BarangayVerifyDetail" component={BarangayVerifyReportDetailScreen} />
            <Stack.Screen name="BarangayChat" component={BarangayChatScreen} />
            <Stack.Screen name="BarangayAlarms" component={BarangayAlarmsScreen} />
            <Stack.Screen name="CleanupTaskDetail" component={CleanupTaskDetailScreen} />
            <Stack.Screen name="BarangayCrewTasks" component={BarangayCrewTasksScreen} />
            <Stack.Screen name="BarangayAssignCrew" component={BarangayAssignCrewScreen} />
            <Stack.Screen name="BarangayCreateEvent" component={BarangayCreateEventScreen} />
            <Stack.Screen name="BarangayEventDetail" component={BarangayEventDetailScreen} />
            <Stack.Screen name="CitizenEvents" component={CitizenEventsScreen} />
            <Stack.Screen name="CitizenEventDetail" component={CitizenEventDetailScreen} />
            <Stack.Screen name="AdminCheckpointAlarms" component={AdminCheckpointAlarmsScreen} />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} />
            <Stack.Screen name="IdentityVerification" component={IdentityVerificationScreen} />
            <Stack.Screen name="Splash" component={SplashScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
