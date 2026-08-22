// سياق الوضع الفاتح/الداكن — كل وضع مستقل تماماً
import React, { createContext, useContext, useEffect, useState } from 'react';

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
    // أزل الكلاسين أولاً
    root.classList.remove('dark', 'light');
    // أضف الكلاس الصحيح
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
