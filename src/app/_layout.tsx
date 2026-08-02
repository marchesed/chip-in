import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider as NavigationThemeProvider,
  useRouter,
  useSegments,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';

import * as QuickActions from 'expo-quick-actions';

import { AuthProvider, useAuth } from '@/lib/auth';
import { groupIdFromAction, setPendingQuickAction } from '@/lib/quickActions';
import { ThemeProvider, useTheme } from '@/lib/theme-context';

SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, initializing } = useAuth();
  const { theme, colors } = useTheme();
  const segments = useSegments();
  const router = useRouter();

  // Capture shortcut taps at the root: one can fire while signed out, or before
  // the authenticated stack exists. Stash the target; (app) routes to it once
  // it's ready. Cold starts come through QuickActions.initial instead.
  useEffect(() => {
    const initialGroup = groupIdFromAction(QuickActions.initial);
    if (initialGroup) setPendingQuickAction(initialGroup);

    const sub = QuickActions.addListener((action) => {
      const groupId = groupIdFromAction(action);
      if (groupId) setPendingQuickAction(groupId);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (initializing) return;
    SplashScreen.hideAsync();

    // Compared as plain strings: typed-route unions only regenerate when the
    // dev server runs, so a freshly added route would otherwise fail to compile.
    const root = segments[0] as string | undefined;

    const inAuthGroup = root === '(auth)';
    // The join route is reachable signed-out: it stashes the invite token and
    // prompts sign-in, then redeems it once authenticated.
    const inJoin = root === 'join';
    // The email-confirmation landing must run signed-out — that's the whole
    // point: it's the thing that establishes the session.
    const inAuthCallback = root === 'auth-callback';
    // Password recovery starts signed-out and then *stays put* once the link
    // creates a session: that session exists so the user can set a new
    // password, so bouncing them into (app) would skip the whole point.
    const inReset = root === 'reset-password';

    if (!session && !inAuthGroup && !inJoin && !inAuthCallback && !inReset) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(app)');
    }
  }, [session, initializing, segments, router]);

  // Feed the palette into React Navigation so screen transitions and any
  // built-in chrome match the selected theme instead of flashing white.
  const navTheme = useMemo(() => {
    const base = theme.dark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.divider,
      },
    };
  }, [theme.dark, colors]);

  if (initializing) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <NavigationThemeProvider value={navTheme}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="join/[token]" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="reset-password" />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </AuthProvider>
  );
}
