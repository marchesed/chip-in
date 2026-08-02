import * as Linking from 'expo-linking';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/form';
import { useAuth } from '@/lib/auth';
import { joinGroup } from '@/lib/api/invites';
import { setPendingInvite } from '@/lib/pendingInvite';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

/** Reject rather than hang forever if the network/RPC stalls. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Timed out joining the group. Check your connection and try again.')), ms),
    ),
  ]);
}

export default function JoinScreen() {
  const { token: routeToken } = useLocalSearchParams<{ token?: string }>();
  const url = Linking.useURL();
  const { session, initializing } = useAuth();
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();

  const [error, setError] = useState<string | null>(null);
  const [linkTimedOut, setLinkTimedOut] = useState(false);
  const attempted = useRef(false);

  // The route param is the normal path. The URL fallback covers links shaped
  // `chipin://join/<token>`, where `join` parses as the host and the router can
  // end up with no token at all.
  const token = useMemo(() => {
    if (routeToken) return routeToken;
    if (!url) return undefined;
    try {
      const parsed = Linking.parse(url);
      const parts = [parsed.hostname, parsed.path]
        .filter(Boolean)
        .join('/')
        .split('/')
        .filter(Boolean);
      const i = parts.indexOf('join');
      return i >= 0 ? parts[i + 1] : undefined;
    } catch {
      return undefined;
    }
  }, [routeToken, url]);

  // Never sit on a spinner forever waiting for a token that isn't coming.
  useEffect(() => {
    if (token) return;
    const t = setTimeout(() => setLinkTimedOut(true), 2500);
    return () => clearTimeout(t);
  }, [token]);

  useEffect(() => {
    if (initializing || !token) return;

    // Signed out: remember the invite so it can be redeemed after auth.
    if (!session) {
      setPendingInvite(token);
      return;
    }

    if (attempted.current) return;
    attempted.current = true;

    withTimeout(joinGroup(token), 15000)
      .then((groupId) => router.replace(`/(app)/group/${groupId}`))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not join group.'));
  }, [initializing, token, session, router]);

  const invalidLink = !token && linkTimedOut;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {invalidLink ? (
          <>
            <Text style={styles.emoji}>🔗</Text>
            <Text style={styles.title}>Invite link didn&apos;t open</Text>
            <Text style={styles.body}>
              We couldn&apos;t read the invite code from this link. Ask for a
              fresh invite, or open the link again from the message.
            </Text>
            {url ? <Text style={styles.debug}>{url}</Text> : null}
            <View style={styles.actions}>
              <Button title="Go home" onPress={() => router.replace('/(app)')} />
            </View>
          </>
        ) : error ? (
          <>
            <Text style={styles.emoji}>😕</Text>
            <Text style={styles.title}>Couldn&apos;t join</Text>
            <Text style={styles.body}>{error}</Text>
            <View style={styles.actions}>
              <Button title="Go home" onPress={() => router.replace('/(app)')} />
            </View>
          </>
        ) : !session && !initializing ? (
          <>
            <Text style={styles.emoji}>🎟️</Text>
            <Text style={styles.title}>You&apos;re invited</Text>
            <Text style={styles.body}>
              Sign in or create an account to join this group. We&apos;ll add you
              as soon as you&apos;re in.
            </Text>
            <View style={styles.actions}>
              <Button title="Sign in" onPress={() => router.replace('/(auth)/sign-in')} />
              <Link href="/(auth)/sign-up" style={styles.link}>
                Create an account
              </Link>
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.body}>
              {initializing ? 'Checking your account…' : 'Joining group…'}
            </Text>
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
    debug: {
      fontSize: 11,
      color: c.textTertiary,
      textAlign: 'center',
      fontFamily: 'Courier',
    },
    actions: { alignSelf: 'stretch', gap: 12, marginTop: 12 },
    link: { color: c.accent, fontWeight: '700', fontSize: 16, textAlign: 'center' },
  });
