import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button, Field } from '@/components/form';
import { createGroup } from '@/lib/api/groups';
import { capitalize } from '@/lib/format';
import type { Palette } from '@/lib/theme';
import { useThemedStyles } from '@/lib/theme-context';

const TYPES = ['household', 'trip', 'couple', 'other'] as const;
const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP'] as const;

export default function NewGroupScreen() {
  const router = useRouter();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [type, setType] = useState<(typeof TYPES)[number]>('household');
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>('CAD');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) {
      setError('Give your group a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const group = await createGroup({ name: name.trim(), type, currency });
      // Replace so back returns to the list, not the create form.
      router.replace(`/(app)/group/${group.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create group.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        <Field
          label="Group name"
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          placeholder="Apartment 4B"
          autoFocus
        />

        <View style={styles.group}>
          <Text style={styles.label}>Type</Text>
          <View style={styles.chips}>
            {TYPES.map((t) => (
              <Chip
                key={t}
                label={capitalize(t)}
                selected={t === type}
                onPress={() => setType(t)}
              />
            ))}
          </View>
        </View>

        <View style={styles.group}>
          <Text style={styles.label}>Currency</Text>
          <View style={styles.chips}>
            {CURRENCIES.map((c) => (
              <Chip
                key={c}
                label={c}
                selected={c === currency}
                onPress={() => setCurrency(c)}
              />
            ))}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button title="Create group" onPress={handleCreate} loading={saving} />
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
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: c.background },
    container: { padding: 24, gap: 24 },
    group: { gap: 10 },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipSelected: { backgroundColor: c.accent, borderColor: c.accent },
    chipText: { fontSize: 15, color: c.textSecondary },
    chipTextSelected: { color: c.onAccent, fontWeight: '700' },
    error: { color: c.negative, fontSize: 14 },
  });
