import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, Field } from '@/components/form';
import { deleteMyAccount } from '@/lib/api/account';
import { useAuth } from '@/lib/auth';
import { unregisterPushNotifications } from '@/lib/push';
import { clearRecentGroup } from '@/lib/quickActions';
import { supabase } from '@/lib/supabase';
import { THEME_LIST, type Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

export default function ProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const styles = useThemedStyles(createStyles);
  const { colors, theme, setTheme } = useTheme();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', userId)
        .single();

      if (!active) return;
      if (error) {
        setError(error.message);
      } else if (data) {
        setName(data.name ?? '');
        setPhone(data.phone ?? '');
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [userId]);

  async function handleSave() {
    if (!userId) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const { error } = await supabase
      .from('profiles')
      .update({ name: name.trim(), phone: phone.trim() || null })
      .eq('id', userId);

    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      setSaved(true);
    }
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          // Drop this device's push token first, or it keeps receiving the
          // previous user's group notifications. Same for the home-screen
          // shortcut, which would otherwise point into their group.
          await unregisterPushNotifications();
          await clearRecentGroup();
          await supabase.auth.signOut();
        },
      },
    ]);
  }

  function handleDeleteAccount() {
    // Two steps on purpose: this is irreversible, and the first screen is where
    // we're honest about what is kept and why.
    Alert.alert(
      'Delete your account?',
      'Your profile, group memberships and notifications will be removed, and ' +
        'you will not be able to sign in again.\n\n' +
        'Expenses you were part of stay in your groups as "Deleted user" — ' +
        'other members\' balances are calculated from them, so removing them ' +
        'would make everyone else\'s totals wrong.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'This cannot be undone',
              'Delete your ChipIn account permanently?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    setError(null);
                    try {
                      await deleteMyAccount();
                      // The root gate sends us to sign-in once the session clears.
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Could not delete account.',
                      );
                      setDeleting(false);
                    }
                  },
                },
              ],
            ),
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(name || session?.user.email || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.email}>{session?.user.email}</Text>

        <View style={styles.form}>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            placeholder="Your name"
          />
          <Field
            label="Phone (optional)"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="+1 555 123 4567"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {saved ? <Text style={styles.saved}>Saved.</Text> : null}

          <Button title="Save changes" onPress={handleSave} loading={saving} />

          <View style={styles.themeBlock}>
            <Text style={styles.themeLabel}>Appearance</Text>
            <View style={styles.themeRow}>
              {THEME_LIST.map((t) => {
                const active = t.name === theme.name;
                return (
                  <Pressable
                    key={t.name}
                    onPress={() => setTheme(t.name)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.themeCard,
                      active && styles.themeCardActive,
                      pressed && { opacity: 0.7 },
                    ]}>
                    {/* Miniature of the palette: surface, accent, text tones. */}
                    <View
                      style={[
                        styles.themeSwatch,
                        { backgroundColor: t.colors.background },
                      ]}>
                      <View style={styles.themeDots}>
                        <View
                          style={[styles.themeDot, { backgroundColor: t.colors.accent }]}
                        />
                        <View
                          style={[
                            styles.themeDot,
                            { backgroundColor: t.colors.positive },
                          ]}
                        />
                        <View
                          style={[
                            styles.themeDot,
                            { backgroundColor: t.colors.negative },
                          ]}
                        />
                      </View>
                      <View
                        style={[styles.themeBar, { backgroundColor: t.colors.text }]}
                      />
                    </View>
                    <Text
                      style={[styles.themeName, active && styles.themeNameActive]}
                      numberOfLines={1}>
                      {active ? `✓ ${t.label}` : t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <Button title="Sign out" variant="ghost" onPress={handleSignOut} />

          <Pressable
            onPress={handleDeleteAccount}
            disabled={deleting}
            style={({ pressed }) => [
              styles.deleteAccount,
              (pressed || deleting) && { opacity: 0.6 },
            ]}>
            {deleting ? (
              <ActivityIndicator color={colors.negative} />
            ) : (
              <Text style={styles.deleteAccountText} suppressHighlighting>
                Delete account
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
    container: { padding: 24, gap: 16, alignItems: 'stretch' },
    avatar: {
      alignSelf: 'center',
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: c.onAccent, fontSize: 34, fontWeight: '800' },
    email: { textAlign: 'center', color: c.textSecondary, fontSize: 15 },
    form: { gap: 16, marginTop: 8 },
    error: { color: c.negative, fontSize: 14 },
    saved: { color: c.positive, fontSize: 14 },

    themeBlock: { gap: 12, marginTop: 8 },
    themeLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    themeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    themeCard: {
      width: 96,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: c.border,
      overflow: 'hidden',
      backgroundColor: c.surface,
    },
    themeCardActive: { borderColor: c.accent },
    themeSwatch: { height: 46, padding: 6, justifyContent: 'space-between' },
    themeDots: { flexDirection: 'row', gap: 4 },
    themeDot: { width: 12, height: 12, borderRadius: 6 },
    themeBar: { height: 5, borderRadius: 3, width: '70%' },
    themeName: {
      fontSize: 12,
      fontWeight: '700',
      color: c.text,
      textAlign: 'center',
      paddingVertical: 6,
    },
    themeNameActive: { color: c.accent },
    deleteAccount: {
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      marginTop: 4,
    },
    deleteAccountText: { color: c.negative, fontSize: 15, fontWeight: '600' },
  });
