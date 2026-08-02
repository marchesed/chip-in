import AsyncStorage from '@react-native-async-storage/async-storage';
import * as QuickActions from 'expo-quick-actions';

// The home-screen shortcut targets whichever group you last opened. That's kept
// on-device rather than on the profile: it's a per-phone convenience, not a
// setting worth syncing.
const RECENT_KEY = 'chipin.recentGroup';
const PENDING_KEY = 'chipin.pendingQuickAction';

/** id of the only action we register; also what comes back on the Action. */
export const ADD_EXPENSE_ACTION = 'add-expense';

export type RecentGroup = { id: string; name: string };

export async function getRecentGroup(): Promise<RecentGroup | null> {
  const raw = await AsyncStorage.getItem(RECENT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.id ? (parsed as RecentGroup) : null;
  } catch {
    return null;
  }
}

/**
 * Record the group the user is looking at, and re-point the shortcut at it.
 * Registration lives here so there is exactly one place the shortcut can drift
 * out of sync with the stored group.
 */
export async function setRecentGroup(group: RecentGroup): Promise<void> {
  await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(group));
  await registerQuickActions(group);
}

export async function clearRecentGroup(): Promise<void> {
  await AsyncStorage.removeItem(RECENT_KEY);
  await registerQuickActions(null);
}

/**
 * Publish (or remove) the home-screen shortcut. Passing null clears it — better
 * than offering a shortcut that leads nowhere, which is what a signed-out or
 * group-less user would otherwise get.
 */
export async function registerQuickActions(group: RecentGroup | null): Promise<void> {
  try {
    if (!(await QuickActions.isSupported())) return;
    if (!group) {
      await QuickActions.setItems([]);
      return;
    }
    await QuickActions.setItems([
      {
        id: ADD_EXPENSE_ACTION,
        title: 'Add expense',
        subtitle: group.name,
        icon: 'symbol:plus.circle.fill',
        params: { groupId: group.id },
      },
    ]);
  } catch {
    // Unsupported platform or no launcher support — the app works fine without.
  }
}

/** Refresh the shortcut from whatever group is currently remembered. */
export async function syncQuickActions(): Promise<void> {
  await registerQuickActions(await getRecentGroup());
}

// Pending intent -------------------------------------------------------------
// A shortcut can fire while signed out, or before the authenticated part of the
// app has mounted. Stash the target and let (app) consume it once it's ready —
// the same pattern invites use.

export async function setPendingQuickAction(groupId: string): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, groupId);
}

export async function getPendingQuickAction(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_KEY);
}

export async function clearPendingQuickAction(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}

/** Pull the group id out of a quick action, if it's one of ours. */
export function groupIdFromAction(action: QuickActions.Action | undefined): string | null {
  if (!action || action.id !== ADD_EXPENSE_ACTION) return null;
  const id = action.params?.groupId;
  return typeof id === 'string' && id ? id : null;
}
