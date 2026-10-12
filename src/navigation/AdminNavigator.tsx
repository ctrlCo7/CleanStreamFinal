import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../hooks/useTheme';
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
import { TabBarIcon } from '../components/common/TabBarIcon';

const Tab = createBottomTabNavigator<AdminTabParamList>();

export default function AdminNavigator() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 66,
          borderTopWidth: 0,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          backgroundColor: colors.white,
          paddingTop: 8,
          paddingBottom: 10,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
          elevation: 8,
        },
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.grayHint,
      }}
    >
      <Tab.Screen
        name="AdminDashboard"
        component={AdminDashboardScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.blueBg} label="Dashboard" icon={<HomeIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminAnalytics"
        component={AdminAnalyticsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.blueBg} label="Analytics" icon={<AnalyticsIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminHistory"
        component={AdminHistoryScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.blueBg} label="History" icon={<HistoryIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminMessages"
        component={AdminMessagesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.blueBg} label="Messages" icon={<MessageIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="AdminProfile"
        component={AdminProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.blueBg} label="Profile" icon={<ProfileIcon color={color} size={22} />} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
