import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Colors } from '../constants/colors';
import { AdminTabParamList } from '../types';

import AdminDashboardScreen from '../screens/admin/DashboardScreen';
import AdminAnalyticsScreen from '../screens/admin/AnalyticsScreen';
import AdminHistoryScreen from '../screens/admin/HistoryScreen';
import AdminMessagesScreen from '../screens/admin/MessagesScreen';
import AdminProfileScreen from '../screens/admin/ProfileScreen';

import {
  HomeIcon,
  AnalyticsIcon,
  HistoryIcon,
  MessageIcon,
  ProfileIcon,
} from '../components/common/TabIcons';

const Tab = createBottomTabNavigator<AdminTabParamList>();

export default function AdminNavigator() {
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
        tabBarActiveTintColor: Colors.blue,
        tabBarInactiveTintColor: Colors.grayHint,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{ tabBarLabel: 'Dashboard', tabBarIcon: ({ color }) => <HomeIcon color={color} /> }}
      />
      <Tab.Screen
        name="AdminAnalytics"
        component={AdminAnalyticsScreen}
        options={{ tabBarLabel: 'Analytics', tabBarIcon: ({ color }) => <AnalyticsIcon color={color} /> }}
      />
      <Tab.Screen
        name="AdminHistory"
        component={AdminHistoryScreen}
        options={{ tabBarLabel: 'History', tabBarIcon: ({ color }) => <HistoryIcon color={color} /> }}
      />
      <Tab.Screen
        name="AdminMessages"
        component={AdminMessagesScreen}
        options={{ tabBarLabel: 'Messages', tabBarIcon: ({ color }) => <MessageIcon color={color} /> }}
      />
      <Tab.Screen
        name="AdminProfile"
        component={AdminProfileScreen}
        options={{ tabBarLabel: 'Profile', tabBarIcon: ({ color }) => <ProfileIcon color={color} /> }}
      />
    </Tab.Navigator>
  );
}
