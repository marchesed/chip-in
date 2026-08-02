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

export default function SignInScreen() {
  const styles = useThemedStyles(createStyles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) setError(error.message);
    // On success, the root session gate redirects into (app).
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>ChipIn</Text>
          <Text style={styles.subtitle}>Split costs without the awkward math.</Text>
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
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            placeholder="••••••••"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button title="Sign in" onPress={handleSignIn} loading={loading} />

          <Link href="/(auth)/forgot-password" style={styles.forgotLink}>
            Forgot password?
          </Link>

          <View style={styles.footer}>
            <Text style={styles.footerText}>New here? </Text>
            <Link href="/(auth)/sign-up" style={styles.footerLink}>
              Create an account
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
    title: { fontSize: 36, fontWeight: '800', color: c.accent },
    subtitle: { fontSize: 15, color: c.textSecondary, marginTop: 6 },
    form: { gap: 16 },
    error: { color: c.negative, fontSize: 14 },
    footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
    footerText: { color: c.textSecondary },
    footerLink: { color: c.accent, fontWeight: '700' },
    forgotLink: {
      color: c.accent,
      fontWeight: '600',
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: 4,
    },
  });
