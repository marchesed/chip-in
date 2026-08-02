import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GroupAvatar } from '@/components/group-avatar';
import { listGroups, type GroupSummary } from '@/lib/api/groups';
import { capitalize } from '@/lib/format';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

export default function GroupsHome() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      setGroups(await listGroups());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load groups.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload whenever the screen regains focus (e.g. after creating a group).
  useFocusEffect(
    useCallback(() => {
      load('initial');
    }, [load]),
  );

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/(app)/profile" asChild>
              <Pressable
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1 })}>
                <Text style={styles.headerLink} suppressHighlighting>
                  Profile
                </Text>
              </Pressable>
            </Link>
          ),
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load('refresh')}
              tintColor={colors.textTertiary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>👋</Text>
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptyBody}>
                Create a group for your household, trip, or anything you split.
              </Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/(app)/group/${item.id}`)}>
              <GroupAvatar
                name={item.name}
                imageUrl={item.image_url}
                cacheKey={item.image_path}
                size={44}
              />
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {capitalize(item.type)} · {item.currency.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push('/(app)/group/new')}>
        <Text style={styles.fabText}>+  New group</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerLink: { color: c.accent, fontWeight: '700', fontSize: 16 },
    list: { padding: 16, gap: 12, flexGrow: 1 },
    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
    emptyEmoji: { fontSize: 44 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: c.text },
    emptyBody: {
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    error: { color: c.negative, fontSize: 14, marginTop: 8 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 16,
      gap: 14,
    },
    cardPressed: { opacity: 0.7 },
    cardIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardIconText: { color: c.onAccent, fontSize: 18, fontWeight: '800' },
    cardBody: { flex: 1 },
    cardName: { fontSize: 17, fontWeight: '700', color: c.text },
    cardMeta: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    chevron: { fontSize: 26, color: c.icon },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 32,
      backgroundColor: c.accent,
      paddingHorizontal: 22,
      paddingVertical: 15,
      borderRadius: 28,
      shadowColor: c.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    fabPressed: { opacity: 0.9 },
    fabText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
  });
