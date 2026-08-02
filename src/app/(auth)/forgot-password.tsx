import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field } from '@/components/form';
import { supabase } from '@/lib/supabase';
import type { Palette } from '@/lib/theme';
import { useThemedStyles } from '@/lib/theme-context';

export default function ForgotPasswordScreen() {
  const styles = useThemedStyles(createStyles);
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter the email you signed up with.');
      return;
    }
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      // A dedicated route rather than the shared auth-callback: it makes the
      // recovery case unambiguous without depending on Supabase preserving a
      // marker query param through the redirect.
      redirectTo: Linking.createURL('reset-password', { isTripleSlashed: true }),
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        {sent ? (
          <View style={styles.form}>
            <Text style={styles.emoji}>📮</Text>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.body}>
              If an account exists for {email.trim()}, we&apos;ve sent a link to
              reset your password. Open it on this device.
            </Text>
            <Button title="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
          </View>
        ) : (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Reset password</Text>
              <Text style={styles.body}>
                We&apos;ll email you a link to choose a new one.
              </Text>
            </View>

            <View style={styles.form}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
                autoFocus
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Button title="Send reset link" onPress={handleSend} loading={loading} />

              <View style={styles.footer}>
                <Text style={styles.footerText}>Remembered it? </Text>
                <Link href="/(auth)/sign-in" style={styles.footerLink}>
                  Sign in
                </Link>
              </View>
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
    header: { marginBottom: 32, alignItems: 'center', gap: 6 },
    emoji: { fontSize: 44, textAlign: 'center' },
    title: { fontSize: 28, fontWeight: '800', color: c.text, textAlign: 'center' },
    body: {
      fontSize: 15,
      color: c.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    form: { gap: 16 },
    error: { color: c.negative, fontSize: 14 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
    footerText: { color: c.textSecondary },
    footerLink: { color: c.accent, fontWeight: '700' },
  });
