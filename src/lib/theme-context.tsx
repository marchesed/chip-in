import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuth } from './auth';
import { supabase } from './supabase';
import {
  DEFAULT_THEME,
  resolveTheme,
  type Palette,
  type Theme,
  type ThemeName,
} from './theme';

// Cached locally so the app paints in the right colours immediately on launch,
// rather than flashing the default while the profile row loads over the network.
const CACHE_KEY = 'chipin.theme';

type ThemeState = {
  theme: Theme;
  colors: Palette;
  setTheme: (name: ThemeName) => void;
};

const ThemeContext = createContext<ThemeState>({
  theme: resolveTheme(DEFAULT_THEME),
  colors: resolveTheme(DEFAULT_THEME).colors,
  setTheme: () => {},
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [name, setName] = useState<ThemeName>(DEFAULT_THEME);

  // 1. Local cache first — instant, works offline and before auth resolves.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(CACHE_KEY).then((cached) => {
      if (active && cached) setName(resolveTheme(cached).name);
    });
    return () => {
      active = false;
    };
  }, []);

  // 2. Then the profile row, which is the cross-device source of truth.
  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('theme')
        .eq('id', userId)
        .single();
      if (!active || error || !data?.theme) return;
      const resolved = resolveTheme(data.theme).name;
      setName(resolved);
      AsyncStorage.setItem(CACHE_KEY, resolved);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const setTheme = useCallback(
    (next: ThemeName) => {
      // Apply immediately; persist in the background so the UI never waits.
      setName(next);
      AsyncStorage.setItem(CACHE_KEY, next);
      if (userId) {
        supabase.from('profiles').update({ theme: next }).eq('id', userId).then();
      }
    },
    [userId],
  );

  const value = useMemo(() => {
    const theme = resolveTheme(name);
    return { theme, colors: theme.colors, setTheme };
  }, [name, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Build a StyleSheet from the active palette, rebuilding only when it changes.
 * Define the factory at module scope so its identity is stable:
 *
 *   const createStyles = (c: Palette) => StyleSheet.create({ ... });
 *   const styles = useThemedStyles(createStyles);
 */
export function useThemedStyles<T>(factory: (colors: Palette) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
