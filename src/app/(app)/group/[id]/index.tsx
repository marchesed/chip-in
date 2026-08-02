import { Link, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth';
import { getGroupBalances } from '@/lib/api/balances';
import { recordSettlement } from '@/lib/api/settlements';
import { getGroup, type GroupDetail } from '@/lib/api/groups';
import { listExpenses, type ExpenseListItem } from '@/lib/api/expenses';
import { formatCents } from '@/lib/money';
import { setRecentGroup } from '@/lib/quickActions';
import { simplify, type Balance } from '@/lib/simplify';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [expenses, setExpenses] = useState<ExpenseListItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettled, setShowSettled] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      const [g, xs, bs] = await Promise.all([
        getGroup(id),
        listExpenses(id),
        getGroupBalances(id),
      ]);
      setGroup(g);
      setExpenses(xs);
      setBalances(bs);
      // Opening a group makes it the target of the home-screen shortcut.
      setRecentGroup({ id: g.id, name: g.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const currency = group?.currency ?? 'CAD';
  const myId = session?.user.id;
  const net = balances.find((b) => b.userId === myId)?.netCents ?? 0;

  // Fewest-transactions settle-up plan for the whole group.
  const transfers = useMemo(() => simplify(balances), [balances]);

  // Settled expenses are collapsed out of the list by default; balances still
  // count them, so this is purely about keeping the list focused on what's live.
  const activeExpenses = useMemo(
    () => expenses.filter((e) => !e.settled_at),
    [expenses],
  );
  const settledExpenses = useMemo(
    () => expenses.filter((e) => !!e.settled_at),
    [expenses],
  );
  const visibleExpenses = showSettled
    ? [...activeExpenses, ...settledExpenses]
    : activeExpenses;

  const nameFor = useCallback(
    (userId: string) => {
      if (userId === myId) return 'You';
      const m = group?.members.find((x) => x.user_id === userId);
      return m?.profile?.name || m?.profile?.email || 'Member';
    },
    [group, myId],
  );

  function confirmSettle(t: { from: string; to: string; cents: number }) {
    if (!group || settling) return;
    const label = `${nameFor(t.from)} → ${nameFor(t.to)}`;
    Alert.alert(
      'Mark as settled?',
      `${label} · ${formatCents(t.cents, currency)}\n\nThis records the payment and updates balances.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark settled',
          onPress: async () => {
            setSettling(true);
            setError(null);
            try {
              await recordSettlement({
                groupId: group.id,
                fromUser: t.from,
                toUser: t.to,
                amountCents: t.cents,
              });
              await load();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not record settlement.');
            } finally {
              setSettling(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'Group not found.'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: group.name,
          headerRight: () => (
            <Link href={`/(app)/group/${group.id}/settings`} asChild>
              <Pressable
                hitSlop={12}
                accessibilityLabel="Group settings"
                accessibilityRole="button"
                style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1 })}>
                <SymbolView
                  name="gearshape.fill"
                  size={22}
                  tintColor={colors.accent}
                  fallback={
                    <Text style={styles.headerLink} suppressHighlighting>
                      Settings
                    </Text>
                  }
                />
              </Pressable>
            </Link>
          ),
        }}
      />

      <FlatList
        data={visibleExpenses}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.textTertiary}
          />
        }
        ListHeaderComponent={
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Your balance</Text>
            <Text
              style={[
                styles.balanceValue,
                net > 0 && styles.positive,
                net < 0 && styles.negative,
              ]}>
              {net === 0 ? 'Settled up' : formatCents(Math.abs(net), currency)}
            </Text>
            <Text style={styles.balanceSub}>
              {net > 0
                ? "you're owed"
                : net < 0
                  ? 'you owe'
                  : 'nothing to settle right now'}
            </Text>

            {transfers.length > 0 ? (
              <View style={styles.settleBlock}>
                <Text style={styles.settleTitle}>Settle up</Text>
                {transfers.map((t) => (
                  <Pressable
                    key={`${t.from}-${t.to}`}
                    onPress={() => confirmSettle(t)}
                    disabled={settling}
                    style={({ pressed }) => [
                      styles.settleRow,
                      pressed && styles.settleRowPressed,
                    ]}>
                    <Text style={styles.settleText} numberOfLines={1}>
                      <Text style={styles.settleName}>{nameFor(t.from)}</Text>
                      {' → '}
                      <Text style={styles.settleName}>{nameFor(t.to)}</Text>
                    </Text>
                    <Text style={styles.settleAmount}>
                      {formatCents(t.cents, currency)}
                    </Text>
                    <Text style={styles.settleChevron}>›</Text>
                  </Pressable>
                ))}
                <Text style={styles.settleHint}>
                  {settling
                    ? 'Recording payment…'
                    : `Tap a payment to mark it settled · ${
                        transfers.length === 1
                          ? '1 payment settles the group'
                          : `${transfers.length} payments settle the group`
                      }`}
                </Text>
              </View>
            ) : null}

            <Link href={`/(app)/group/${group.id}/settlements`} asChild>
              <Pressable hitSlop={8} style={styles.historyLink}>
                <Text style={styles.historyLinkText} suppressHighlighting>
                  Settlement history
                </Text>
              </Pressable>
            </Link>

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>
              {settledExpenses.length > 0 ? '🎉' : '💸'}
            </Text>
            <Text style={styles.emptyTitle}>
              {settledExpenses.length > 0 ? 'All settled up' : 'No expenses yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {settledExpenses.length > 0
                ? 'Nothing outstanding. New expenses will show up here.'
                : 'Add the first one to start splitting.'}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        }
        ListFooterComponent={
          settledExpenses.length > 0 ? (
            <Pressable
              onPress={() => setShowSettled((v) => !v)}
              hitSlop={8}
              style={({ pressed }) => [
                styles.settledToggle,
                pressed && styles.settledTogglePressed,
              ]}>
              <Text style={styles.settledToggleText} suppressHighlighting>
                {showSettled
                  ? 'Hide settled expenses'
                  : `Show ${settledExpenses.length} settled ${
                      settledExpenses.length === 1 ? 'expense' : 'expenses'
                    }`}
              </Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push(
                `/(app)/group/${group.id}/add-expense?expenseId=${item.id}`,
              )
            }
            style={({ pressed }) => [
              styles.row,
              !!item.settled_at && styles.rowSettled,
              pressed && styles.rowPressed,
            ]}>
            <View style={styles.rowMain}>
              <Text style={styles.desc} numberOfLines={1}>
                {item.description || 'Expense'}
              </Text>
              <Text style={styles.meta}>
                {item.payer?.name || item.payer?.email || 'Someone'} paid ·{' '}
                {new Date(item.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
                {item.settled_at ? ' · settled' : ''}
              </Text>
            </View>
            <Text style={styles.amount}>{formatCents(item.amount, currency)}</Text>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>
        )}
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={() => router.push(`/(app)/group/${group.id}/add-expense`)}>
        <Text style={styles.fabText}>+  Add expense</Text>
      </Pressable>
    </View>
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
    headerLink: { color: c.accent, fontWeight: '700', fontSize: 16 },
    list: { padding: 16, gap: 10, flexGrow: 1, paddingBottom: 100 },
    balanceCard: {
      backgroundColor: c.surface,
      borderRadius: 16,
      padding: 20,
      alignItems: 'center',
      gap: 4,
      marginBottom: 6,
    },
    balanceLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    balanceValue: { fontSize: 32, fontWeight: '800', color: c.text },
    positive: { color: c.positive },
    negative: { color: c.negative },
    balanceSub: { fontSize: 14, color: c.textSecondary },
    settleBlock: {
      alignSelf: 'stretch',
      marginTop: 14,
      paddingTop: 14,
      borderTopWidth: 1,
      borderTopColor: c.divider,
      gap: 8,
    },
    settleTitle: { fontSize: 13, fontWeight: '700', color: c.textSecondary },
    settleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 6,
    },
    settleRowPressed: { opacity: 0.5 },
    settleChevron: { fontSize: 20, color: c.icon, marginLeft: -4 },
    historyLink: { alignSelf: 'center', marginTop: 14 },
    historyLinkText: { color: c.accent, fontWeight: '700', fontSize: 14 },
    settleText: { flex: 1, fontSize: 15, color: c.textSecondary },
    settleName: { color: c.text, fontWeight: '700' },
    settleAmount: { fontSize: 15, fontWeight: '800', color: c.text },
    settleHint: { fontSize: 12, color: c.textTertiary, marginTop: 2 },
    empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 32, gap: 8 },
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
    rowPressed: { opacity: 0.6 },
    rowSettled: { opacity: 0.55, backgroundColor: c.surfaceMuted },
    settledToggle: { alignSelf: 'center', paddingVertical: 14 },
    settledTogglePressed: { opacity: 0.5 },
    settledToggleText: { color: c.accent, fontWeight: '700', fontSize: 14 },
    rowChevron: { fontSize: 22, color: c.icon, marginLeft: -4 },
    rowMain: { flex: 1 },
    desc: { fontSize: 16, fontWeight: '700', color: c.text },
    meta: { fontSize: 13, color: c.textSecondary, marginTop: 2 },
    amount: { fontSize: 16, fontWeight: '800', color: c.text },
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
