import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
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

export default function SignUpScreen() {
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setError(null);
    setNotice(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { name: name.trim() },
        // Where the confirmation email sends them back to. Must also be listed
        // in Supabase > Authentication > URL Configuration > Redirect URLs.
        emailRedirectTo: Linking.createURL('auth-callback', { isTripleSlashed: true }),
      },
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    // If email confirmation is enabled, there's no session yet.
    if (!data.session) {
      setNotice('Check your email to confirm your account, then sign in.');
    }
    // Otherwise the session gate redirects into (app) automatically.
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>Start splitting in seconds.</Text>
        </View>

        <View style={styles.form}>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoComplete="name"
            placeholder="Alex Rivera"
          />
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="At least 6 characters"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Button title="Create account" onPress={handleSignUp} loading={loading} />

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <Link href="/(auth)/sign-in" style={styles.footerLink}>
              Sign in
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { flex: 1, padding: 24, justifyContent: 'center' },
    header: { marginBottom: 32, alignItems: 'center' },
    title: { fontSize: 30, fontWeight: '800', color: c.text },
    subtitle: { fontSize: 15, color: c.textSecondary, marginTop: 6 },
    form: { gap: 16 },
    error: { color: c.negative, fontSize: 14 },
    notice: { color: c.positive, fontSize: 14 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
    footerText: { color: c.textSecondary },
    footerLink: { color: c.accent, fontWeight: '700' },
  });
