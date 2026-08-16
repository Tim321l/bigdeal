import type { Theme } from '../hooks/useTheme';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/** Fixed-position toggle rendered on every screen (landing, lobby, board, dashboard) — theme is a
 * global preference, not something tied to any one screen. */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={onToggle}
      title={theme === 'dark' ? '切換去淺色模式' : '切換去深色模式'}
      aria-label={theme === 'dark' ? '切換去淺色模式' : '切換去深色模式'}
    >
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  );
}
