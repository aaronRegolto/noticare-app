import { Tabs } from 'expo-router';
import React from 'react';

import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1E2D43',
        tabBarInactiveTintColor: '#6E83A2',
        headerShown: false,
        tabBarStyle: { paddingTop: 7, borderTopColor: '#E5EAF0', backgroundColor: '#FFFFFF', position: 'relative' },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', marginTop: -2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="shield-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Manual Scan',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="scan-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Messages',
          tabBarIcon: ({ color }) => <Ionicons size={22} name="chatbubbles-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
