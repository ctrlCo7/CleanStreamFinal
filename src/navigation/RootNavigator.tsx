import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { onAuthChange } from '../services/authService';
import { restoreSession, setUser } from '../store/authSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { RootStackParamList } from '../types';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import MapScreen from '../screens/MapScreen';

import CitizenNavigator from './CitizenNavigator';
import AdminNavigator from './AdminNavigator';
import BarangayNavigator from './BarangayNavigator';

import CitizenReportScreen from '../screens/citizen/ReportScreen';
import CitizenAIResultScreen from '../screens/citizen/AIResultScreen';
import CitizenDetailScreen from '../screens/citizen/ReportDetailScreen';
import CitizenChatScreen from '../screens/citizen/ChatScreen';
import AdminScheduleScreen from '../screens/admin/ScheduleScreen';
import AdminChatScreen from '../screens/admin/ChatScreen';
import BarangayScheduleScreen from '../screens/barangay/ScheduleScreen';
import BarangayChatScreen from '../screens/barangay/ChatScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAppSelector((s) => s.auth);
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

  if (initializing) return null;

  const getHomeScreen = () => {
    if (!isAuthenticated || !user) return 'Login';
    switch (user.role) {
      case 'admin': return 'AdminTabs';
      case 'barangay': return 'BarangayTabs';
      default: return 'CitizenTabs';
    }
  };

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={getHomeScreen() as keyof RootStackParamList}
        screenOptions={{ headerShown: false, animation: 'slide_from_right' }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />

        <Stack.Screen name="CitizenTabs" component={CitizenNavigator} />
        <Stack.Screen name="AdminTabs" component={AdminNavigator} />
        <Stack.Screen name="BarangayTabs" component={BarangayNavigator} />

        <Stack.Screen name="Map" component={MapScreen} />
        <Stack.Screen name="CitizenReport" component={CitizenReportScreen} />
        <Stack.Screen name="CitizenAIResult" component={CitizenAIResultScreen} />
        <Stack.Screen name="CitizenDetail" component={CitizenDetailScreen} />
        <Stack.Screen name="CitizenChat" component={CitizenChatScreen} />
        <Stack.Screen name="AdminSchedule" component={AdminScheduleScreen} />
        <Stack.Screen name="AdminChat" component={AdminChatScreen} />
        <Stack.Screen name="BarangaySchedule" component={BarangayScheduleScreen} />
        <Stack.Screen name="BarangayChat" component={BarangayChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
