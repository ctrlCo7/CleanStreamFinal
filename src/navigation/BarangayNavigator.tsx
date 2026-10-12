import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../hooks/useTheme';
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
import { TabBarIcon } from '../components/common/TabBarIcon';

const Tab = createBottomTabNavigator<BarangayTabParamList>();

export default function BarangayNavigator() {
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
        tabBarActiveTintColor: colors.brgy,
        tabBarInactiveTintColor: colors.grayHint,
      }}
    >
      <Tab.Screen
        name="BarangayDashboard"
        component={BarangayDashboardScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.brgyLight} label="Dashboard" icon={<HomeIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="BarangayHistory"
        component={BarangayHistoryScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.brgyLight} label="History" icon={<HistoryIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="BarangayReport"
        component={BarangayReportScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.brgyLight} label="Report" icon={<PlusIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="BarangayMessages"
        component={BarangayMessagesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.brgyLight} label="Messages" icon={<MessageIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="BarangayProfile"
        component={BarangayProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.brgyLight} label="Profile" icon={<ProfileIcon color={color} size={22} />} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
