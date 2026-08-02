import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { useTheme, useThemedStyles } from '@/lib/theme-context';
import type { Palette } from '@/lib/theme';

type FieldProps = TextInputProps & { label: string };

export function Field({ label, style, ...props }: FieldProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textTertiary}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
};

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: ButtonProps) {
  const styles = useThemedStyles(createStyles);
  const { colors } = useTheme();
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonGhost,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}>
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.onAccent : colors.accent} />
      ) : (
        <Text style={[styles.buttonText, !isPrimary && styles.buttonTextGhost]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    field: { gap: 6 },
    label: { fontSize: 13, fontWeight: '600', color: c.textSecondary },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: c.surface,
      color: c.text,
    },
    button: {
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    buttonPrimary: { backgroundColor: c.accent },
    buttonGhost: { backgroundColor: 'transparent' },
    buttonDisabled: { opacity: 0.5 },
    buttonPressed: { opacity: 0.85 },
    buttonText: { color: c.onAccent, fontSize: 16, fontWeight: '700' },
    buttonTextGhost: { color: c.accent },
  });
