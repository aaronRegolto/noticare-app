import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { AppSplash } from '@/src/components/AppSplash';
import { AppErrorBoundary } from '@/src/components/AppErrorBoundary';
import { UpdatePrompt } from '@/src/components/update-prompt';
import { AppUpdateProvider } from '@/src/providers/AppUpdateProvider';
import { AuthProvider, useAuth } from '@/src/providers/AuthProvider';
import { EventSync } from '@/src/providers/EventSync';
import { OnboardingProvider, useOnboarding } from '@/src/providers/OnboardingProvider';
import { SubscriptionProvider } from '@/src/providers/SubscriptionProvider';
import { AppThemeProvider, useAppTheme } from '@/src/theme/ThemeProvider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function RootNavigator() {
  const { session, loading: authLoading } = useAuth();
  const { complete, loading: onboardingLoading } = useOnboarding();

  useEffect(() => {
    if (authLoading || onboardingLoading || !session || !complete) return;
    const openCommunity = (response: Notifications.NotificationResponse) => {
      if (response.notification.request.content.data?.screen !== 'community') return;
      router.push('/community');
      Notifications.clearLastNotificationResponse();
    };
    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) openCommunity(lastResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener(openCommunity);
    return () => subscription.remove();
  }, [authLoading, complete, onboardingLoading, session]);

  if (authLoading || onboardingLoading) return <AppSplash />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && !complete}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session) && complete}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="about" options={{ presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="guide" options={{ presentation: 'card' }} />
      </Stack.Protected>
      <Stack.Screen name="privacy" options={{ presentation: 'card' }} />
    </Stack>
  );
}

function ThemedNavigation() {
  const { scheme } = useAppTheme();
  return (
    <NavigationThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <RootNavigator />
      <UpdatePrompt />
      {/* App headers use a fixed dark surface in both modes, so status-bar content stays light. */}
      <StatusBar style="light" />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <AppThemeProvider>
        <AuthProvider>
          <SubscriptionProvider>
            <EventSync />
            <OnboardingProvider>
              <AppUpdateProvider>
                <ThemedNavigation />
              </AppUpdateProvider>
            </OnboardingProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </AppThemeProvider>
    </AppErrorBoundary>
  );
}
