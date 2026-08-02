import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme-context';

type Props = {
  name: string;
  /** Signed URL — expires, so it must not be used as the cache key. */
  imageUrl?: string | null;
  /** Stable object path, used as the cache key so rotating signed URLs still hit cache. */
  cacheKey?: string | null;
  size?: number;
};

/**
 * A group's photo, falling back to a letter tile when none is set. Used in the
 * groups list, the group header, and the settings picker so the fallback stays
 * consistent everywhere.
 */
export function GroupAvatar({ name, imageUrl, cacheKey, size = 44 }: Props) {
  const { colors } = useTheme();
  const dimensions = { width: size, height: size, borderRadius: size / 2 };

  if (imageUrl) {
    return (
      <Image
        // Signed URLs rotate on every fetch, so cache on the stable object path
        // instead — otherwise every render would re-download the same photo.
        source={{ uri: imageUrl, cacheKey: cacheKey ?? undefined }}
        style={[dimensions, { backgroundColor: colors.surfaceMuted }]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
    );
  }

  return (
    <View
      style={[
        dimensions,
        styles.fallback,
        { backgroundColor: colors.accent },
      ]}>
      <Text
        style={[styles.letter, { color: colors.onAccent, fontSize: size * 0.4 }]}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  letter: { fontWeight: '800' },
});
