import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'bigdeal:theme';

export type Theme = 'light' | 'dark';

function loadStoredTheme(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null; // private-browsing/storage-denied — falls back to the system preference below
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/** Explicit choice always wins and is remembered; with no stored choice yet, follows the OS/browser
 * preference so a dark-mode user isn't greeted with a bright page before ever touching the toggle. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => loadStoredTheme() ?? (systemPrefersDark() ? 'dark' : 'light'));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private-browsing — the theme still applies for this page load, just won't be remembered.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return [theme, toggle];
}
