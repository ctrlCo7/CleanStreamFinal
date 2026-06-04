import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors } from '../constants/colors';
import { CitizenTabParamList } from '../types';

import CitizenHomeScreen from '../screens/citizen/HomeScreen';
import CitizenHistoryScreen from '../screens/citizen/HistoryScreen';
import CitizenMessagesScreen from '../screens/citizen/MessagesScreen';
import CitizenProfileScreen from '../screens/citizen/ProfileScreen';
import CitizenNotificationsScreen from '../screens/citizen/NotificationsScreen';

import {
  HomeIcon,
  HistoryIcon,
  MapIcon,
  MessageIcon,
  ProfileIcon,
} from '../components/common/TabIcons';

const Tab = createBottomTabNavigator<CitizenTabParamList>();

export default function CitizenNavigator() {
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
        tabBarActiveTintColor: Colors.teal,
        tabBarInactiveTintColor: Colors.grayHint,
        tabBarLabelStyle: { fontSize: 9, fontWeight: '500' },
      }}
    >
      <Tab.Screen
        name="CitizenHome"
        component={CitizenHomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <HomeIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="CitizenHistory"
        component={CitizenHistoryScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ color }) => <HistoryIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="MapTab"
        component={MapTabPlaceholder}
        options={{
          tabBarLabel: 'Map',
          tabBarIcon: ({ color }) => <MapIcon color={color} />,
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
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color }) => <MessageIcon color={color} />,
        }}
      />
      <Tab.Screen
        name="CitizenProfile"
        component={CitizenProfileScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

// Placeholder — tab press is intercepted by the listener above
function MapTabPlaceholder() {
  return <View style={{ flex: 1, backgroundColor: Colors.grayBg }} />;
}
