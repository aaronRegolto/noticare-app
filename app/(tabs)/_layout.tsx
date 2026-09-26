import { PlatformPressable } from '@react-navigation/elements';
import { Tabs } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Ionicons from '@expo/vector-icons/Ionicons';

import { getActiveTourTab, messagesTabRef, subscribeToActiveTourTab } from '@/src/navigation/tabBarRefs';
import { useAppTheme } from '@/src/theme/ThemeProvider';

export default function TabLayout() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const activeTourTab = React.useSyncExternalStore(subscribeToActiveTourTab, getActiveTourTab, getActiveTourTab);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        headerShown: false,
        tabBarStyle: {
          height: 56 + insets.bottom,
          paddingTop: 7,
          paddingBottom: Math.max(insets.bottom, 8),
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
          position: 'relative',
        },
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
          // PlatformPressable is not a dependable measurement anchor on Android. The non-collapsed
          // native wrapper gives the Dashboard tour stable bounds for the complete Messages button.
          tabBarButton: (props) => (
            <View
              ref={messagesTabRef}
              collapsable={false}
              style={[
                { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
                activeTourTab === 'messages' && {
                  backgroundColor: colors.accentSoft,
                  borderColor: colors.accent,
                  borderWidth: 2,
                  elevation: 60,
                  zIndex: 60,
                },
              ]}
            >
              <PlatformPressable {...props} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
