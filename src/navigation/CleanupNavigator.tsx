import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from '../hooks/useTheme';
import { useCleanupReminders } from '../hooks/useCleanupReminders';
import { useAppSelector } from '../store/hooks';
import { CleanupTabParamList } from '../types';

import CleanupTasksScreen from '../screens/cleanup/CleanupTasksScreen';
import CleanupProfileScreen from '../screens/cleanup/CleanupProfileScreen';

import { HomeIcon, ProfileIcon } from '../components/common/TabIcons';
import { TabBarIcon } from '../components/common/TabBarIcon';

const Tab = createBottomTabNavigator<CleanupTabParamList>();

/** What a cleanup crew leader sees: their assigned tasks, and their profile. */
export default function CleanupNavigator() {
  const { colors } = useTheme();
  // "Cleanup tomorrow" and "in 1 hour" reminders for this crew's approved tasks.
  useCleanupReminders(useAppSelector((st) => st.auth.user));
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Let the icon + label pill use the whole tab, not the small fixed icon box (which cut labels to "Hist…").
        tabBarIconStyle: { width: '100%', height: 48 },
        tabBarItemStyle: { paddingHorizontal: 2 },
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
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.grayHint,
      }}
    >
      <Tab.Screen
        name="CleanupTasks"
        component={CleanupTasksScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.greenBg} label="Tasks" icon={<HomeIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="CleanupProfile"
        component={CleanupProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.greenBg} label="Profile" icon={<ProfileIcon color={color} size={22} />} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
