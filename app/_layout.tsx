import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppSplash } from '@/src/components/AppSplash';
import { AppErrorBoundary } from '@/src/components/AppErrorBoundary';
import { AuthProvider, useAuth } from '@/src/providers/AuthProvider';
import { OnboardingProvider, useOnboarding } from '@/src/providers/OnboardingProvider';
import { useColorScheme } from '@/hooks/use-color-scheme';

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
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="guide" options={{ presentation: 'card' }} />
      </Stack.Protected>
      <Stack.Screen name="privacy" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <OnboardingProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootNavigator />
            <StatusBar style="light" />
          </ThemeProvider>
        </OnboardingProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}
