
import React, { createContext, useState, useEffect, useCallback, useContext, ReactNode } from 'react';
import { themes as defaultThemes, Theme, generateCustomTheme } from '../themes';

const CUSTOM_THEME_STORAGE_KEY = 'qmai-custom-theme-colors';
const THEME_NAME_STORAGE_KEY = 'qmai-theme';

interface CustomThemeColors {
  primary: string;
  accent: string;
}

interface ThemeContextType {
  theme: Theme;
  changeTheme: (themeName: string) => void;
  saveCustomTheme: (primary: string, accent: string) => void;
  availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [availableThemes, setAvailableThemes] = useState<Theme[]>(defaultThemes);
  const [theme, setTheme] = useState<Theme>(defaultThemes[0]);

  const applyTheme = useCallback((selectedTheme: Theme) => {
    if (!selectedTheme) return;
    const root = document.documentElement;
    Object.entries(selectedTheme.colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, []);

  useEffect(() => {
    let currentThemes = [...defaultThemes];
    let themeToApply = defaultThemes[0];
    
    try {
        const savedCustomColorsRaw = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
        if (savedCustomColorsRaw) {
            const savedCustomColors: CustomThemeColors = JSON.parse(savedCustomColorsRaw);
            const customTheme = generateCustomTheme(savedCustomColors.primary, savedCustomColors.accent);
            currentThemes.push(customTheme);
        }
        
        const savedThemeName = localStorage.getItem(THEME_NAME_STORAGE_KEY);
        const savedTheme = currentThemes.find(t => t.name === savedThemeName);

        if (savedTheme) {
            themeToApply = savedTheme;
        }

    } catch (e) {
        console.error("Failed to load themes from localStorage", e);
    }
    
    setAvailableThemes(currentThemes);
    setTheme(themeToApply);
    applyTheme(themeToApply);
  }, [applyTheme]);

  const changeTheme = (themeName: string) => {
    const newTheme = availableThemes.find(t => t.name === themeName);
    if (newTheme) {
      setTheme(newTheme);
      applyTheme(newTheme);
      localStorage.setItem(THEME_NAME_STORAGE_KEY, themeName);
    }
  };
  
  const saveCustomTheme = (primary: string, accent: string) => {
    const newCustomTheme = generateCustomTheme(primary, accent);
    const newThemes = [...defaultThemes, newCustomTheme];

    setAvailableThemes(newThemes);
    setTheme(newCustomTheme);
    applyTheme(newCustomTheme);
    localStorage.setItem(THEME_NAME_STORAGE_KEY, 'Custom');

    try {
        localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify({ primary, accent }));
    } catch(e) {
        console.error("Failed to save custom theme", e);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, changeTheme, saveCustomTheme, availableThemes }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
