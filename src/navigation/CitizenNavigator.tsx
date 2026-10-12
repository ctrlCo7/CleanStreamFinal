import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { CitizenTabParamList } from '../types';

import CitizenHomeScreen from '../screens/citizen/HomeScreen';
import CitizenHistoryScreen from '../screens/citizen/HistoryScreen';
import CitizenMessagesScreen from '../screens/citizen/MessagesScreen';
import CitizenProfileScreen from '../screens/citizen/ProfileScreen';

import {
  HomeIcon,
  HistoryIcon,
  MapIcon,
  MessageIcon,
  ProfileIcon,
} from '../components/common/TabIcons';
import { TabBarIcon } from '../components/common/TabBarIcon';

const Tab = createBottomTabNavigator<CitizenTabParamList>();

export default function CitizenNavigator() {
  const { colors } = useTheme();

  // Placeholder — tab press is intercepted by the listener below
  const MapTabPlaceholder = () => <View style={{ flex: 1, backgroundColor: colors.grayBg }} />;

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
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.grayHint,
      }}
    >
      <Tab.Screen
        name="CitizenHome"
        component={CitizenHomeScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.tealLight} label="Home" icon={<HomeIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="CitizenHistory"
        component={CitizenHistoryScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.tealLight} label="History" icon={<HistoryIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapTabPlaceholder}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.tealLight} label="Map" icon={<MapIcon color={color} size={22} />} />
          ),
        }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('Map' as never);
          },
        })}
      />
      <Tab.Screen
        name="CitizenMessages"
        component={CitizenMessagesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.tealLight} label="Messages" icon={<MessageIcon color={color} size={22} />} />
          ),
        }}
      />
      <Tab.Screen
        name="CitizenProfile"
        component={CitizenProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <TabBarIcon focused={focused} color={color} activeBg={colors.tealLight} label="Profile" icon={<ProfileIcon color={color} size={22} />} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
