import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { getGroup, type GroupDetail } from '@/lib/api/groups';
import { listSettlements, type Settlement } from '@/lib/api/settlements';
import { formatCents } from '@/lib/money';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

export default function SettlementsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [g, s] = await Promise.all([getGroup(id), listSettlements(id)]);
      setGroup(g);
      setSettlements(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settlements.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const myId = session?.user.id;
  const currency = group?.currency ?? 'CAD';

  const nameFor = (userId: string) => {
    if (userId === myId) return 'You';
    const m = group?.members.find((x) => x.user_id === userId);
    return m?.profile?.name || m?.profile?.email || 'Member';
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.flex}
      data={settlements}
      keyExtractor={(s) => s.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🤝</Text>
          <Text style={styles.emptyTitle}>No settlements yet</Text>
          <Text style={styles.emptyBody}>
            Payments you mark as settled will show up here.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.desc} numberOfLines={1}>
              <Text style={styles.name}>{nameFor(item.from_user)}</Text>
              {' paid '}
              <Text style={styles.name}>{nameFor(item.to_user)}</Text>
            </Text>
            <Text style={styles.meta}>
              {new Date(item.settled_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Text>
          </View>
          <Text style={styles.amount}>{formatCents(item.amount, currency)}</Text>
        </View>
      )}
    />
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.background,
    },
    list: { padding: 16, gap: 10, flexGrow: 1 },
    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 8 },
    emptyEmoji: { fontSize: 44 },
    emptyTitle: { fontSize: 20, fontWeight: '800', color: c.text },
    emptyBody: { fontSize: 15, color: c.textSecondary, textAlign: 'center' },
    error: { color: c.negative, fontSize: 14, marginTop: 8 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 16,
      gap: 12,
    },
    rowMain: { flex: 1 },
    desc: { fontSize: 16, color: c.textSecondary },
    name: { color: c.text, fontWeight: '700' },
    meta: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    amount: { fontSize: 16, fontWeight: '800', color: c.positive },
  });
