import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Button } from '@/components/form';
import { buildInviteUrl, getOrCreateInvite, type Invite } from '@/lib/api/invites';
import type { Palette } from '@/lib/theme';
import { useTheme, useThemedStyles } from '@/lib/theme-context';

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setInvite(await getOrCreateInvite(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create invite.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const url = invite ? buildInviteUrl(invite.token) : '';

  async function handleShare() {
    if (!url) return;
    await Share.share({ message: `Join my ChipIn group: ${url}` });
  }

  async function handleCopy() {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (error || !invite) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? 'No invite.'}</Text>
        <Button title="Try again" onPress={load} />
      </View>
    );
  }

  const expires = new Date(invite.expires_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Scan to join</Text>
      <View style={styles.qrCard}>
        <QRCode value={url} size={220} />
      </View>

      <Text style={styles.urlLabel}>Or share this link</Text>
      <Text style={styles.url} selectable numberOfLines={2}>
        {url}
      </Text>

      <View style={styles.actions}>
        <Button title="Share link" onPress={handleShare} />
        <Button
          title={copied ? 'Copied!' : 'Copy link'}
          variant="ghost"
          onPress={handleCopy}
        />
      </View>

      <Text style={styles.expiry}>Link expires {expires}</Text>
    </View>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: 'center',
      padding: 24,
      gap: 16,
    },
    center: {
      flex: 1,
      backgroundColor: c.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: 24,
    },
    heading: { fontSize: 22, fontWeight: '800', color: c.text, marginTop: 8 },
    qrCard: {
      // Always white behind the QR: scanners need the light/dark contrast the
      // code was generated for, which a dark surface would invert.
      backgroundColor: '#ffffff',
      padding: 24,
      borderRadius: 20,
      shadowColor: c.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    urlLabel: { fontSize: 13, fontWeight: '600', color: c.textSecondary, marginTop: 8 },
    url: {
      fontSize: 14,
      color: c.accent,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    actions: { alignSelf: 'stretch', gap: 12, marginTop: 8 },
    expiry: { fontSize: 13, color: c.textTertiary, marginTop: 4 },
    error: { color: c.negative, fontSize: 15, textAlign: 'center' },
  });
