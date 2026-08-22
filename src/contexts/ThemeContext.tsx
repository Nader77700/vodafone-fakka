// سياق الوضع الفاتح/الداكن — كل وضع مستقل تماماً
import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
  isDark: true,
});

// ── useSyncExternalStore snapshot: يقرأ html class مباشرة من DOM ──
function getHtmlTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

// ── MutationObserver store: يستمع لتغييرات class على <html> مباشرة ──
let _listeners: (() => void)[] = [];
let _observer: MutationObserver | null = null;

function subscribeToHtmlClass(cb: () => void) {
  _listeners.push(cb);
  if (!_observer && typeof MutationObserver !== 'undefined') {
    _observer = new MutationObserver(() => _listeners.forEach(l => l()));
    _observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  }
  return () => {
    _listeners = _listeners.filter(l => l !== cb);
    if (_listeners.length === 0 && _observer) {
      _observer.disconnect();
      _observer = null;
    }
  };
}

/**
 * useIsLight — يقرأ html.classList مباشرة عبر MutationObserver.
 * يعمل حتى لو ThemeContext لم يصل للمكوّن أو تأخّر.
 */
export function useIsLight(): boolean {
  const theme = useSyncExternalStore(
    subscribeToHtmlClass,
    getHtmlTheme,
    () => 'dark' as Theme, // server snapshot
  );
  return theme === 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('vfp_theme') as Theme | null;
      return saved === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(theme);
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('vfp_theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'));
  const setTheme    = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme, isDark: theme === 'dark' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
