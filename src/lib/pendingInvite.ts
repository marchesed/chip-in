import AsyncStorage from '@react-native-async-storage/async-storage';

// When a signed-out user opens an invite deep link, we stash the token here and
// redeem it once they finish signing in / signing up.
const KEY = 'chipin.pendingInvite';

export async function setPendingInvite(token: string): Promise<void> {
  await AsyncStorage.setItem(KEY, token);
}

export async function getPendingInvite(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
