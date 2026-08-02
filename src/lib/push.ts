import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Show a banner even when the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Ask for permission, get this device's Expo push token, and store it against
 * the signed-in user. Safe to call on every sign-in: the token is the primary
 * key, so re-registering just refreshes it.
 *
 * Returns the token, or null if push isn't available (simulator, permission
 * denied, or running in Expo Go — remote push needs a real build).
 */
export async function registerForPushNotifications(
  userId: string,
): Promise<string | null> {
  // Push only works on physical hardware.
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    // Only prompts the first time; afterwards the OS answers from settings.
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return null;

  let token: string;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    token = result.data;
  } catch {
    // No push credentials (e.g. Expo Go) — not fatal, just no notifications.
    return null;
  }

  const { error } = await supabase.from('device_tokens').upsert(
    {
      token,
      user_id: userId,
      platform: Platform.OS,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );
  if (error) return null;

  return token;
}

/**
 * Drop this device's token so a signed-out phone stops receiving the previous
 * user's group notifications. Call before supabase.auth.signOut().
 */
export async function unregisterPushNotifications(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;
    if (!projectId) return;

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.from('device_tokens').delete().eq('token', data);
  } catch {
    // Best effort: never block sign-out on this.
  }
}
