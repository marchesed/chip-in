import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button, Field } from '@/components/form';
import { useAuth } from '@/lib/auth';
import { getGroup, type GroupDetail } from '@/lib/api/groups';
import {
  addExpense,
  deleteExpense,
  getExpense,
  updateExpense,
} from '@/lib/api/expenses';
import { centsToInput, formatCents, parseAmountToCents } from '@/lib/money';
import { evenSplit, splitCentsByPercent, validateSplits } from '@/lib/splits';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

type Mode = 'equal' | 'group' | 'custom';

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function AddExpenseScreen() {
  // `expenseId` present => editing an existing expense, otherwise creating one.
  const { id, expenseId } = useLocalSearchParams<{ id: string; expenseId?: string }>();
  const isEditing = !!expenseId;
  const router = useRouter();
  const { session } = useAuth();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [paidBy, setPaidBy] = useState<string | null>(null);
  const [expenseDate, setExpenseDate] = useState<string>(todayISO());
  const [mode, setMode] = useState<Mode>('group');
  const [customPercents, setCustomPercents] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const g = await getGroup(id);
      setGroup(g);

      if (expenseId) {
        // Prefill from the saved expense. Its stored split may not match any
        // preset, so edit always starts in custom mode showing the real values.
        const e = await getExpense(expenseId);
        setAmountText(centsToInput(e.amount));
        setDescription(e.description);
        setPaidBy(e.paid_by);
        setExpenseDate(e.date);
        setMode('custom');
        setCustomPercents(
          Object.fromEntries(
            g.members.map((m) => [
              m.user_id,
              String(e.shares.find((s) => s.user_id === m.user_id)?.percent ?? 0),
            ]),
          ),
        );
      } else {
        setPaidBy(session?.user.id ?? g.members[0]?.user_id ?? null);
        // Seed custom percents from the group defaults.
        setCustomPercents(
          Object.fromEntries(
            g.members.map((m) => [m.user_id, String(m.default_split_percent)]),
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load expense.');
    } finally {
      setLoading(false);
    }
  }, [id, expenseId, session]);

  // Load once. Deliberately not re-fetching on refocus: this is a form, and
  // refetching would discard whatever the user has typed.
  const loaded = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (loaded.current) return;
      loaded.current = true;
      load();
    }, [load]),
  );

  const amountCents = parseAmountToCents(amountText);
  const currency = group?.currency ?? 'CAD';
  const members = useMemo(() => group?.members ?? [], [group]);

  // Percent per member for the active mode.
  const percentByUser = useMemo<Record<string, number>>(() => {
    if (!members.length) return {};
    if (mode === 'equal') {
      const even = evenSplit(members.length);
      return Object.fromEntries(members.map((m, i) => [m.user_id, even[i]]));
    }
    if (mode === 'group') {
      return Object.fromEntries(members.map((m) => [m.user_id, m.default_split_percent]));
    }
    return Object.fromEntries(
      members.map((m) => [m.user_id, Number(customPercents[m.user_id]) || 0]),
    );
  }, [mode, members, customPercents]);

  const percentList = members.map((m) => percentByUser[m.user_id] ?? 0);
  const validation = validateSplits(percentList);

  // Preview cents per member (only meaningful once amount + split are valid).
  const centsByUser = useMemo<Record<string, number>>(() => {
    if (!amountCents || !validation.valid) return {};
    const cents = splitCentsByPercent(amountCents, percentList);
    return Object.fromEntries(members.map((m, i) => [m.user_id, cents[i]]));
  }, [amountCents, validation.valid, percentList, members]);

  const canSubmit = !!amountCents && !!paidBy && validation.valid && !saving;

  function setCustomPercent(userId: string, value: string) {
    if (value !== '' && !/^\d{0,3}(\.\d{0,2})?$/.test(value)) return;
    setCustomPercents((prev) => ({ ...prev, [userId]: value }));
  }

  /**
   * Leave the form. `back()` alone is not safe here: the screen can be entered
   * from a home-screen shortcut, where there may be nothing beneath it on the
   * stack, and a no-op back would strand the user.
   */
  function leaveForm() {
    if (router.canGoBack()) router.back();
    else router.replace(id ? `/(app)/group/${id}` : '/(app)');
  }

  async function handleSubmit() {
    if (!group || !amountCents || !paidBy) return;
    setSaving(true);
    setError(null);
    try {
      // Only members with a positive share are included.
      const shares = members
        .map((m) => ({
          userId: m.user_id,
          percent: percentByUser[m.user_id] ?? 0,
          amountOwed: centsByUser[m.user_id] ?? 0,
        }))
        .filter((s) => s.amountOwed > 0);

      if (expenseId) {
        await updateExpense({
          expenseId,
          paidBy,
          amount: amountCents,
          description: description.trim(),
          date: expenseDate,
          shares,
        });
      } else {
        await addExpense({
          groupId: group.id,
          paidBy,
          amount: amountCents,
          description: description.trim(),
          date: expenseDate,
          shares,
        });
      }
      leaveForm();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Failed to ${expenseId ? 'save' : 'add'} expense.`,
      );
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!expenseId) return;
    Alert.alert(
      'Delete expense?',
      'This removes it for everyone and updates balances. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            setError(null);
            try {
              await deleteExpense(expenseId);
              leaveForm();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Failed to delete expense.');
              setDeleting(false);
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

  // Reachable when the group has been deleted or left since a home-screen
  // shortcut was pointed at it. Without this the form would render empty and
  // unusable with no explanation.
  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.missingTitle}>Group unavailable</Text>
        <Text style={styles.missingBody}>
          {error ?? "This group may have been deleted, or you're no longer a member."}
        </Text>
        <Button title="Go to groups" onPress={() => router.replace('/(app)')} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit expense' : 'Add expense',
          headerRight: () => (
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.4 : 1 })}>
              {saving ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text
                  style={[styles.headerAction, !canSubmit && styles.headerActionDisabled]}
                  suppressHighlighting>
                  {isEditing ? 'Save' : 'Add'}
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Field
          label="Amount"
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="0.00"
          autoFocus
        />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          placeholder="Groceries, rent, dinner…"
        />

        <View style={styles.block}>
          <Text style={styles.label}>Paid by</Text>
          <View style={styles.chips}>
            {members.map((m) => (
              <Chip
                key={m.user_id}
                label={m.profile?.name || m.profile?.email || 'Member'}
                selected={m.user_id === paidBy}
                onPress={() => setPaidBy(m.user_id)}
              />
            ))}
          </View>
        </View>

        <View style={styles.block}>
          <Text style={styles.label}>Split</Text>
          <View style={styles.chips}>
            <Chip label="Equally" selected={mode === 'equal'} onPress={() => setMode('equal')} />
            <Chip label="Group default" selected={mode === 'group'} onPress={() => setMode('group')} />
            <Chip label="Custom" selected={mode === 'custom'} onPress={() => setMode('custom')} />
          </View>
        </View>

        <View style={styles.previewCard}>
          {members.map((m) => {
            const pct = percentByUser[m.user_id] ?? 0;
            return (
              <View key={m.user_id} style={styles.previewRow}>
                <Text style={styles.previewName} numberOfLines={1}>
                  {m.profile?.name || m.profile?.email || 'Member'}
                </Text>

                {mode === 'custom' ? (
                  <View style={styles.percentBox}>
                    <TextInput
                      value={customPercents[m.user_id] ?? ''}
                      onChangeText={(v) => setCustomPercent(m.user_id, v)}
                      keyboardType="decimal-pad"
                      style={styles.percentInput}
                      selectTextOnFocus
                    />
                    <Text style={styles.percentSign}>%</Text>
                  </View>
                ) : (
                  <Text style={styles.previewPct}>{pct.toFixed(2)}%</Text>
                )}

                <Text style={styles.previewAmount}>
                  {amountCents && validation.valid
                    ? formatCents(centsByUser[m.user_id] ?? 0, currency)
                    : '—'}
                </Text>
              </View>
            );
          })}

          <View style={styles.previewTotal}>
            <Text style={styles.previewName}>Total split</Text>
            <Text style={[styles.previewPct, !validation.valid && styles.bad]}>
              {validation.sum.toFixed(2)}%
            </Text>
            <Text style={styles.previewAmount}>
              {amountCents ? formatCents(amountCents, currency) : '—'}
            </Text>
          </View>
        </View>

        {!validation.valid ? (
          <Text style={styles.hint}>
            Split must total 100% (currently {validation.sum.toFixed(2)}%).
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isEditing ? (
          <Pressable
            onPress={handleDelete}
            disabled={deleting || saving}
            style={({ pressed }) => [
              styles.deleteBtn,
              (pressed || deleting) && styles.deleteBtnPressed,
            ]}>
            {deleting ? (
              <ActivityIndicator color={colors.negative} />
            ) : (
              <Text style={styles.deleteText}>Delete expense</Text>
            )}
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
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
      padding: 32,
      gap: 12,
    },
    missingTitle: { fontSize: 20, fontWeight: '800', color: c.text },
    missingBody: {
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 8,
    },
    container: { padding: 20, gap: 20 },
    block: { gap: 10 },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      maxWidth: 200,
    },
    chipSelected: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { fontSize: 15, color: c.textSecondary },
    chipTextSelected: { color: c.onAccent, fontWeight: '700' },
    previewCard: { backgroundColor: c.surface, borderRadius: 16, padding: 16, gap: 12 },
    previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    previewName: { flex: 1, fontSize: 15, color: c.text },
    previewPct: { width: 72, textAlign: 'right', fontSize: 14, color: c.textSecondary },
    previewAmount: {
      width: 84,
      textAlign: 'right',
      fontSize: 15,
      fontWeight: '700',
      color: c.text,
    },
    percentBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 8,
      width: 72,
    },
    percentInput: {
      flex: 1,
      paddingVertical: 6,
      fontSize: 14,
      textAlign: 'right',
      color: c.text,
    },
    percentSign: { fontSize: 14, color: c.textSecondary, marginLeft: 2 },
    previewTotal: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: c.divider,
      paddingTop: 12,
    },
    bad: { color: c.negative },
    hint: { fontSize: 13, color: c.negative },
    error: { color: c.negative, fontSize: 14 },
    headerAction: { fontSize: 17, fontWeight: '700', color: c.accent },
    headerActionDisabled: { color: c.textDisabled },
    deleteBtn: {
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      borderWidth: 1,
      borderColor: c.negativeBorder,
      backgroundColor: c.surface,
    },
    deleteBtnPressed: { opacity: 0.6 },
    deleteText: { color: c.negative, fontSize: 16, fontWeight: '700' },
  });

