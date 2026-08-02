import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { supabase } from '@/lib/supabase';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

/**
 * Landing point for Supabase auth deep links (email confirmation, password
 * reset). Handles both flows so it works regardless of the project's flowType:
 *
 *   PKCE      -> ?code=...            exchangeCodeForSession
 *   implicit  -> #access_token=...    setSession
 *
 * On success the root session gate takes over and routes into (app), where any
 * pending invite is redeemed.
 */
export default function AuthCallbackScreen() {
  const url = Linking.useURL();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (!url || handled.current) return;
    handled.current = true;

    (async () => {
      const parsed = Linking.parse(url);
      const qp = (parsed.queryParams ?? {}) as Record<string, string | undefined>;

      // Fragment params (implicit flow) aren't part of queryParams — parse by hand.
      const fragment = url.includes('#') ? url.slice(url.indexOf('#') + 1) : '';
      const frag = Object.fromEntries(new URLSearchParams(fragment)) as Record<
        string,
        string | undefined
      >;

      const errDescription = qp.error_description ?? frag.error_description;
      const errCode = qp.error ?? frag.error;
      if (errDescription || errCode) {
        setError(decodeURIComponent(errDescription ?? errCode ?? 'Link is invalid.'));
        return;
      }

      try {
        if (qp.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(qp.code);
          if (error) throw error;
        } else if (frag.access_token && frag.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: frag.access_token,
            refresh_token: frag.refresh_token,
          });
          if (error) throw error;
        } else {
          setError('This confirmation link is missing its sign-in code.');
          return;
        }
        // Session is set; the root gate redirects into (app).
        router.replace('/(app)');
      } catch (e) {
        setError(
          e instanceof Error ? e.message : 'Could not complete sign-in from this link.',
        );
      }
    })();
  }, [url, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {error ? (
          <>
            <Text style={styles.emoji}>😕</Text>
            <Text style={styles.title}>Sign-in link problem</Text>
            <Text style={styles.body}>{error}</Text>
            <Text style={styles.hint}>
              Confirmation links must be opened on the same device you signed up
              on, and they expire after a while. Try signing in directly.
            </Text>
            <View style={styles.actions}>
              <Button title="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} />
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.body}>Confirming your account…</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: {
      flex: 1,
      padding: 32,
      gap: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emoji: { fontSize: 48 },
    title: { fontSize: 24, fontWeight: '800', color: c.text },
    body: { fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 21 },
    hint: { fontSize: 13, color: c.textTertiary, textAlign: 'center', lineHeight: 19 },
    actions: { alignSelf: 'stretch', gap: 12, marginTop: 12 },
  });
