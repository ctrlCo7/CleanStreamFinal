import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors } from '../constants/colors';
import { BarangayTabParamList } from '../types';

import BarangayDashboardScreen from '../screens/barangay/DashboardScreen';
import BarangayHistoryScreen from '../screens/barangay/HistoryScreen';
import BarangayReportScreen from '../screens/barangay/ReportScreen';
import BarangayMessagesScreen from '../screens/barangay/MessagesScreen';
import BarangayProfileScreen from '../screens/barangay/ProfileScreen';

import {
  HomeIcon,
  HistoryIcon,
  PlusIcon,
  MessageIcon,
  ProfileIcon,
} from '../components/common/TabIcons';

const Tab = createBottomTabNavigator<BarangayTabParamList>();

export default function BarangayNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          height: 56,
          borderTopWidth: 0.5,
          borderTopColor: Colors.border,
          backgroundColor: Colors.white,
          paddingBottom: 4,
        },
        tabBarActiveTintColor: Colors.brgy,
        tabBarInactiveTintColor: Colors.grayHint,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="BarangayDashboard"
        component={BarangayDashboardScreen}
        options={{ tabBarLabel: 'Dashboard', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
      />
      <Tab.Screen
        name="BarangayHistory"
        component={BarangayHistoryScreen}
        options={{ tabBarLabel: 'History', tabBarIcon: ({ color }) => <HistoryIcon color={color} /> }}
      />
      <Tab.Screen
        name="BarangayReport"
        component={BarangayReportScreen}
        options={{ tabBarLabel: 'Report', tabBarIcon: ({ color }) => <PlusIcon color={color} /> }}
      />
      <Tab.Screen
        name="BarangayMessages"
        component={BarangayMessagesScreen}
        options={{ tabBarLabel: 'Messages', tabBarIcon: ({ color }) => <MessageIcon color={color} /> }}
      />
      <Tab.Screen
        name="BarangayProfile"
        component={BarangayProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <ProfileIcon color={color} /> }}
      />
    </Tab.Navigator>
  );
}
