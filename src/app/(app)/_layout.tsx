import * as Notifications from 'expo-notifications';
import { useQuickActionCallback } from 'expo-quick-actions/hooks';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { joinGroup } from '@/lib/api/invites';
import { useAuth } from '@/lib/auth';
import { clearPendingInvite, getPendingInvite } from '@/lib/pendingInvite';
import {
  clearPendingQuickAction,
  getPendingQuickAction,
  groupIdFromAction,
  syncQuickActions,
} from '@/lib/quickActions';
import { registerForPushNotifications } from '@/lib/push';
import { useTheme } from '@/lib/theme-context';

export default function AppLayout() {
  const router = useRouter();
  const { session } = useAuth();
  const { colors } = useTheme();
  const userId = session?.user.id;

  // Register this device for push once the user is authenticated. Idempotent
  // (token is the primary key), and a no-op on simulators or if declined.
  useEffect(() => {
    if (!userId) return;
    registerForPushNotifications(userId);
  }, [userId]);

  // Open the add-expense screen for a shortcut's group, once we know the group
  // is still reachable — it may have been deleted, or left, since the shortcut
  // was pointed at it.
  const handled = useRef<string | null>(null);
  const openQuickAction = useCallback(
    (groupId: string) => {
      // Guards against the mount-time callback and the stored-intent effect
      // both firing for the same launch.
      if (handled.current === groupId) return;
      handled.current = groupId;
      clearPendingQuickAction();

      // Deferred on purpose: navigating while this layout is still mounting is
      // silently dropped by the navigator. expo-quick-actions' own router
      // integration does the same thing for the same reason.
      //
      // Deliberately NOT verifying the group first — a slow or failed network
      // call would leave the shortcut looking broken. If the group has really
      // gone, the add-expense screen says so.
      //
      // push, not replace: replace leaves nothing beneath the screen, so the
      // stack has no back entry and the user is stranded if they change their
      // mind. Pushing keeps the groups list underneath.
      setTimeout(() => {
        router.push(`/(app)/group/${groupId}/add-expense`);
      }, 0);
    },
    [router],
  );

  // Fires immediately with the launching action, and again on every later tap.
  // Living in this layout (not the root) is what the library requires, since it
  // navigates — and it means the user is already authenticated by this point.
  useQuickActionCallback((action) => {
    const groupId = groupIdFromAction(action);
    if (groupId) openQuickAction(groupId);
  });

  // Backstop for a tap that arrived while this layout wasn't mounted — e.g.
  // signed out, then signed in.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const groupId = await getPendingQuickAction();
      if (groupId && active) openQuickAction(groupId);
    })();
    return () => {
      active = false;
    };
  }, [userId, openQuickAction]);

  // Keep the shortcut in step with whatever group is remembered on this device.
  useEffect(() => {
    if (userId) syncQuickActions();
  }, [userId]);

  // Tapping a notification opens the group it refers to.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as
        | { groupId?: string }
        | undefined;
      if (data?.groupId) router.push(`/(app)/group/${data.groupId}`);
    });
    return () => sub.remove();
  }, [router]);

  // Redeem an invite that was opened while signed out, now that we're in (app).
  useEffect(() => {
    let active = true;
    (async () => {
      const token = await getPendingInvite();
      if (!token || !active) return;
      await clearPendingInvite();
      try {
        const groupId = await joinGroup(token);
        if (active) router.replace(`/(app)/group/${groupId}`);
      } catch (e) {
        // Don't strand the user wondering why nothing happened.
        if (active) {
          Alert.alert(
            "Couldn't join that group",
            e instanceof Error ? e.message : 'The invite may have expired.',
          );
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.accent,
        headerTitleStyle: { color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}>
      <Stack.Screen name="index" options={{ title: 'Groups' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="group/new" options={{ title: 'New group' }} />
      <Stack.Screen name="group/[id]/index" options={{ title: 'Group' }} />
      <Stack.Screen name="group/[id]/invite" options={{ title: 'Invite' }} />
      <Stack.Screen name="group/[id]/settings" options={{ title: 'Group settings' }} />
      <Stack.Screen name="group/[id]/settlements" options={{ title: 'Settlements' }} />
      <Stack.Screen name="group/[id]/add-expense" options={{ title: 'Add expense' }} />
    </Stack>
  );
}
