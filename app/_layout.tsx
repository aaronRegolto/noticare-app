import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppSplash } from '@/src/components/AppSplash';
import { AppErrorBoundary } from '@/src/components/AppErrorBoundary';
import { AuthProvider, useAuth } from '@/src/providers/AuthProvider';
import { EventSync } from '@/src/providers/EventSync';
import { OnboardingProvider, useOnboarding } from '@/src/providers/OnboardingProvider';
import { SubscriptionProvider } from '@/src/providers/SubscriptionProvider';
import { AppThemeProvider, useAppTheme } from '@/src/theme/ThemeProvider';

function RootNavigator() {
  const { session, loading: authLoading } = useAuth();
  const { complete, loading: onboardingLoading } = useOnboarding();

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
        <Stack.Screen name="link-phone" options={{ presentation: 'modal' }} />
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
              <ThemedNavigation />
            </OnboardingProvider>
          </SubscriptionProvider>
        </AuthProvider>
      </AppThemeProvider>
    </AppErrorBoundary>
  );
}
