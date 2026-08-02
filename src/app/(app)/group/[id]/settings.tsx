import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Button } from '@/components/form';
import { GroupAvatar } from '@/components/group-avatar';
import { getGroupBalances } from '@/lib/api/balances';
import {
  getGroup,
  leaveGroup,
  removeGroupImage,
  updateMemberSplits,
  uploadGroupImage,
  type GroupDetail,
} from '@/lib/api/groups';
import { useAuth } from '@/lib/auth';
import { capitalize } from '@/lib/format';
import { formatCents } from '@/lib/money';
import { clearRecentGroup } from '@/lib/quickActions';
import { evenSplit, validateSplits } from '@/lib/splits';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const { session } = useAuth();

  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [percents, setPercents] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // The caller's own net, so the screen can explain *why* leaving is blocked
  // rather than only failing when they tap it.
  const [net, setNet] = useState(0);

  function handleLeave() {
    if (!id || !group) return;
    const soleMember = group.members.length === 1;
    Alert.alert(
      soleMember ? 'Leave and delete this group?' : 'Leave this group?',
      soleMember
        ? 'You are the only member, so the group and all of its expense history will be permanently deleted.'
        : 'You will lose access to this group. Expenses you were part of stay behind for the other members.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: soleMember ? 'Delete group' : 'Leave',
          style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            setError(null);
            try {
              await leaveGroup(id);
              await clearRecentGroup();
              router.replace('/(app)');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not leave group.');
              setLeaving(false);
            }
          },
        },
      ],
    );
  }

  async function handlePickImage() {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is needed to set a group picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      // Compress on-device: these are shown at ~88px, so full resolution would
      // waste the user's bandwidth and storage for no visible gain.
      quality: 0.7,
      base64: true,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (!asset?.base64 || !id) {
      setError('Could not read that image.');
      return;
    }

    setUploading(true);
    try {
      const { path, url } = await uploadGroupImage(id, {
        base64: asset.base64,
        mimeType: asset.mimeType,
      });
      setGroup((g) => (g ? { ...g, image_path: path, image_url: url } : g));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload photo.');
    } finally {
      setUploading(false);
    }
  }

  function handleRemoveImage() {
    if (!id) return;
    Alert.alert('Remove photo?', 'The group will go back to its letter icon.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setUploading(true);
          setError(null);
          try {
            await removeGroupImage(id);
            setGroup((g) => (g ? { ...g, image_path: null, image_url: null } : g));
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to remove photo.');
          } finally {
            setUploading(false);
          }
        },
      },
    ]);
  }

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [detail, balances] = await Promise.all([
        getGroup(id),
        getGroupBalances(id),
      ]);
      setGroup(detail);
      setNet(balances.find((b) => b.userId === session?.user.id)?.netCents ?? 0);
      setPercents(
        Object.fromEntries(
          detail.members.map((m) => [m.user_id, String(m.default_split_percent)]),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load group.');
    } finally {
      setLoading(false);
    }
  }, [id, session?.user.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const validation = useMemo(() => {
    if (!group) return { valid: false, sum: 0, remaining: 100 };
    return validateSplits(group.members.map((m) => Number(percents[m.user_id]) || 0));
  }, [group, percents]);

  function setPercent(userId: string, value: string) {
    if (value !== '' && !/^\d{0,3}(\.\d{0,2})?$/.test(value)) return;
    setSaved(false);
    setPercents((prev) => ({ ...prev, [userId]: value }));
  }

  function applyEvenSplit() {
    if (!group) return;
    const even = evenSplit(group.members.length);
    setSaved(false);
    setPercents(
      Object.fromEntries(group.members.map((m, i) => [m.user_id, String(even[i])])),
    );
  }

  async function handleSave() {
    if (!group || !validation.valid) return;
    setSaving(true);
    setError(null);
    try {
      await updateMemberSplits(
        group.id,
        group.members.map((m) => ({
          userId: m.user_id,
          percent: Number(percents[m.user_id]) || 0,
        })),
      );
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save splits.');
    } finally {
      setSaving(false);
    }
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
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={[styles.section, styles.identity]}>
        <Pressable
          onPress={handlePickImage}
          disabled={uploading}
          accessibilityLabel="Change group photo"
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <GroupAvatar
            name={group.name}
            imageUrl={group.image_url}
            cacheKey={group.image_path}
            size={88}
          />
          {uploading ? (
            <View style={styles.avatarOverlay}>
              <ActivityIndicator color={colors.onAccent} />
            </View>
          ) : null}
        </Pressable>

        <Text style={styles.sectionTitle}>{group.name}</Text>
        <Text style={styles.meta}>
          {capitalize(group.type)} · {group.currency.toUpperCase()} ·{' '}
          {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
        </Text>

        <View style={styles.photoActions}>
          <Pressable onPress={handlePickImage} disabled={uploading} hitSlop={8}>
            <Text style={styles.photoAction} suppressHighlighting>
              {group.image_url ? 'Change photo' : 'Add photo'}
            </Text>
          </Pressable>
          {group.image_url ? (
            <Pressable onPress={handleRemoveImage} disabled={uploading} hitSlop={8}>
              <Text style={[styles.photoAction, styles.photoActionDanger]} suppressHighlighting>
                Remove
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Button
        title="Invite people"
        onPress={() => router.push(`/(app)/group/${group.id}/invite`)}
      />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Default split</Text>
          <Pressable onPress={applyEvenSplit} hitSlop={8}>
            <Text style={styles.evenLink} suppressHighlighting>
              Even split
            </Text>
          </Pressable>
        </View>
        <Text style={styles.sectionHint}>
          Used as the starting split when adding an expense.
        </Text>

        {group.members.map((m) => (
          <View key={m.user_id} style={styles.memberRow}>
            <View style={styles.memberAvatar}>
              <Text style={styles.memberAvatarText}>
                {(m.profile?.name || m.profile?.email || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.memberName} numberOfLines={1}>
              {m.profile?.name || m.profile?.email || 'Unknown'}
            </Text>
            <View style={styles.percentBox}>
              <TextInput
                value={percents[m.user_id] ?? ''}
                onChangeText={(v) => setPercent(m.user_id, v)}
                keyboardType="decimal-pad"
                style={styles.percentInput}
                selectTextOnFocus
              />
              <Text style={styles.percentSign}>%</Text>
            </View>
          </View>
        ))}

        <View style={styles.sumRow}>
          <Text style={styles.sumLabel}>Total</Text>
          <Text style={[styles.sumValue, !validation.valid && styles.sumValueBad]}>
            {validation.sum.toFixed(2)}%
          </Text>
        </View>
        {!validation.valid ? (
          <Text style={styles.hint}>
            {validation.remaining > 0
              ? `${validation.remaining.toFixed(2)}% left to allocate`
              : `${Math.abs(validation.remaining).toFixed(2)}% over 100%`}
          </Text>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {saved ? <Text style={styles.saved}>Splits saved.</Text> : null}

        <Button
          title="Save splits"
          onPress={handleSave}
          loading={saving}
          disabled={!validation.valid}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Leave group</Text>
        <Text style={styles.sectionHint}>
          {net === 0
            ? group.members.length === 1
              ? "You're the only member, so the group and its history will be deleted."
              : 'Your past expenses stay with the group.'
            : `You need to settle up first — ${
                net > 0 ? "you're owed" : 'you owe'
              } ${formatCents(Math.abs(net), group.currency)}.`}
        </Text>
        <Pressable
          onPress={handleLeave}
          disabled={leaving || net !== 0}
          style={({ pressed }) => [
            styles.leaveBtn,
            (pressed || leaving) && { opacity: 0.6 },
            net !== 0 && styles.leaveBtnDisabled,
          ]}>
          {leaving ? (
            <ActivityIndicator color={colors.negative} />
          ) : (
            <Text
              style={[styles.leaveText, net !== 0 && styles.leaveTextDisabled]}
              suppressHighlighting>
              {group.members.length === 1 ? 'Leave and delete group' : 'Leave group'}
            </Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
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
    container: { padding: 20, gap: 20 },
    section: { backgroundColor: c.surface, borderRadius: 16, padding: 18, gap: 12 },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    identity: { alignItems: 'center', gap: 10 },
    avatarOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#00000066',
      borderRadius: 44,
    },
    photoActions: { flexDirection: 'row', gap: 20, marginTop: 2 },
    photoAction: { color: c.accent, fontWeight: '700', fontSize: 14 },
    photoActionDanger: { color: c.negative },
    leaveBtn: {
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      borderWidth: 1,
      borderColor: c.negativeBorder,
      backgroundColor: c.surface,
    },
    leaveBtnDisabled: { borderColor: c.border, opacity: 0.6 },
    leaveText: { color: c.negative, fontSize: 16, fontWeight: '700' },
    leaveTextDisabled: { color: c.textDisabled },
    sectionTitle: { fontSize: 18, fontWeight: '800', color: c.text },
    sectionHint: { fontSize: 13, color: c.textSecondary, marginTop: -4 },
    meta: { fontSize: 14, color: c.textSecondary },
    evenLink: { color: c.accent, fontWeight: '700' },
    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    memberAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberAvatarText: { color: c.onAccent, fontWeight: '800' },
    memberName: { flex: 1, fontSize: 16, color: c.text },
    percentBox: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 10,
      backgroundColor: c.surface,
    },
    percentInput: {
      width: 56,
      paddingVertical: 8,
      fontSize: 16,
      textAlign: 'right',
      color: c.text,
    },
    percentSign: { fontSize: 16, color: c.textSecondary, marginLeft: 2 },
    sumRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: c.divider,
      paddingTop: 12,
    },
    sumLabel: { fontSize: 15, fontWeight: '600', color: c.textSecondary },
    sumValue: { fontSize: 15, fontWeight: '800', color: c.positive },
    sumValueBad: { color: c.negative },
    hint: { fontSize: 13, color: c.negative },
    error: { color: c.negative, fontSize: 14 },
    saved: { color: c.positive, fontSize: 14 },
  });
