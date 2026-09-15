// Design System Tokens for Tesla App
// Supports Light/Dark/System themes

export const colors = {
  // Semantic
  success: {
    light: '#10B981',
    dark: '#34D399',
  },
  error: {
    light: '#EF4444',
    dark: '#F87171',
  },
  warning: {
    light: '#F59E0B',
    dark: '#FBBF24',
  },
  info: {
    light: '#3B82F6',
    dark: '#60A5FA',
  },

  // Neutral
  neutral: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#EEEEEE',
    300: '#E0E0E0',
    400: '#BDBDBD',
    500: '#9E9E9E',
    600: '#757575',
    700: '#616161',
    800: '#424242',
    900: '#212121',
  },

  // Brand
  primary: {
    light: '#FF3B30',
    dark: '#FF453A',
  },
  secondary: {
    light: '#5AC8FA',
    dark: '#64B5F6',
  },
}

export const typography = {
  // Weights
  weights: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  // Sizes and line heights
  sizes: {
    display: { size: 56, lineHeight: 1.1 }, // Hero headings
    h1: { size: 40, lineHeight: 1.2 }, // Page titles
    h2: { size: 32, lineHeight: 1.2 }, // Section titles
    h3: { size: 24, lineHeight: 1.3 }, // Subsection titles
    h4: { size: 20, lineHeight: 1.3 }, // Card titles
    h5: { size: 16, lineHeight: 1.4 }, // Small headings
    body: { size: 16, lineHeight: 1.5 }, // Regular body text
    body_sm: { size: 14, lineHeight: 1.5 }, // Small body text
    label: { size: 14, lineHeight: 1.4 }, // Form labels
    caption: { size: 12, lineHeight: 1.4 }, // Captions, helper text
    metric: { size: 48, lineHeight: 1.0 }, // Large metrics (tabular)
  },

  // Font family (includes Cyrillic)
  family: {
    base: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Courier New", monospace',
  },
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  '4xl': 80,
}

export const radius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
}

export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
  '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
}

export const zIndex = {
  hide: -1,
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  fixed: 1200,
  modal: 1300,
  popover: 1400,
  tooltip: 1500,
}

export const breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
}

export const transitions = {
  fast: 'all 0.15s ease-in-out',
  base: 'all 0.2s ease-in-out',
  slow: 'all 0.35s ease-in-out',
}

export const themeConfig = {
  light: {
    background: '#FFFFFF',
    surface: '#F5F5F5',
    text: '#212121',
    textSecondary: '#616161',
    border: '#E0E0E0',
    primary: '#FF3B30',
  },
  dark: {
    background: '#121212',
    surface: '#1E1E1E',
    text: '#FFFFFF',
    textSecondary: '#BDBDBD',
    border: '#424242',
    primary: '#FF453A',
  },
}

