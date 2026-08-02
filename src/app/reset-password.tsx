import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/form';
import { establishSessionFromUrl } from '@/lib/authLink';
import { supabase } from '@/lib/supabase';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

/**
 * Landing point for password-recovery links.
 *
 * The link carries a one-time code that establishes a short-lived session; that
 * session is what authorises changing the password. So the exchange has to
 * succeed before the form is usable — hence the three states below.
 */
export default function ResetPasswordScreen() {
  const url = Linking.useURL();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const [status, setStatus] = useState<'verifying' | 'ready' | 'invalid'>('verifying');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (!url || handled.current) return;
    handled.current = true;
    (async () => {
      const failure = await establishSessionFromUrl(url);
      if (failure) {
        setLinkError(failure);
        setStatus('invalid');
      } else {
        setStatus('ready');
      }
    })();
  }, [url]);

  async function handleSave() {
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSaving(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    // The recovery session is now a normal one, so go straight into the app.
    router.replace('/(app)');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        {status === 'verifying' ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.body}>Checking your link…</Text>
          </View>
        ) : status === 'invalid' ? (
          <View style={styles.centered}>
            <Text style={styles.emoji}>😕</Text>
            <Text style={styles.title}>Link didn&apos;t work</Text>
            <Text style={styles.body}>{linkError}</Text>
            <Text style={styles.hint}>
              Reset links expire, and can only be opened on the device that
              requested them. Try requesting a new one.
            </Text>
            <View style={styles.actions}>
              <Button
                title="Request a new link"
                onPress={() => router.replace('/(auth)/forgot-password')}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Choose a new password</Text>
            </View>
            <View style={styles.form}>
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
                placeholder="At least 6 characters"
                autoFocus
              />
              <Field
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                autoComplete="new-password"
                placeholder="Type it again"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button title="Save password" onPress={handleSave} loading={saving} />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { flex: 1, padding: 24, justifyContent: 'center' },
    centered: { alignItems: 'center', gap: 12 },
    header: { marginBottom: 28, alignItems: 'center' },
    emoji: { fontSize: 44 },
    title: { fontSize: 26, fontWeight: '800', color: c.text, textAlign: 'center' },
    body: {
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    hint: { fontSize: 13, color: c.textTertiary, textAlign: 'center', lineHeight: 19 },
    actions: { alignSelf: 'stretch', gap: 12, marginTop: 12 },
    form: { gap: 16 },
    error: { color: c.negative, fontSize: 14 },
  });
