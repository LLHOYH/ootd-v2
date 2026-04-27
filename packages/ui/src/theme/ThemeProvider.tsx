import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { tokens } from './tokens';

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  mode: ThemeMode;
  color: {
    brand: string;
    brandBg: string;
    brandOn: string;
    bg: { primary: string; secondary: string; tertiary: string };
    text: { primary: string; secondary: string; tertiary: string };
    border: { default: string; strong: string };
    palette: typeof tokens.color.palette;
    success: string;
    warning: string;
    danger: string;
  };
  type: typeof tokens.type;
  space: typeof tokens.space;
  radius: typeof tokens.radius;
  motion: typeof tokens.motion;
  shadow: typeof tokens.shadow;
}

function buildTheme(mode: ThemeMode): Theme {
  const surfaces = mode === 'light' ? tokens.color.light : tokens.color.dark;
  const brand = mode === 'light' ? tokens.color.pink[400] : tokens.color.pink[300];
  const brandBg = mode === 'light' ? tokens.color.pink[50] : tokens.color.pink[800];
  const brandOn = mode === 'light' ? tokens.color.pink[800] : tokens.color.pink[100];

  return {
    mode,
    color: {
      brand,
      brandBg,
      brandOn,
      bg: {
        primary: surfaces.bgPrimary,
        secondary: surfaces.bgSecondary,
        tertiary: surfaces.bgTertiary,
      },
      text: {
        primary: surfaces.textPrimary,
        secondary: surfaces.textSecondary,
        tertiary: surfaces.textTertiary,
      },
      border: {
        default: surfaces.borderDefault,
        strong: surfaces.borderStrong,
      },
      palette: tokens.color.palette,
      success: tokens.color.success,
      warning: tokens.color.warning,
      danger: tokens.color.danger,
    },
    type: tokens.type,
    space: tokens.space,
    radius: tokens.radius,
    motion: tokens.motion,
    shadow: tokens.shadow,
  };
}

const ThemeContext = createContext<Theme | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  mode?: ThemeMode;
}

export function ThemeProvider({ children, mode }: ThemeProviderProps) {
  const systemScheme = useColorScheme();
  const resolvedMode: ThemeMode = mode ?? (systemScheme === 'dark' ? 'dark' : 'light');
  const theme = useMemo(() => buildTheme(resolvedMode), [resolvedMode]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
