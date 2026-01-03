// @artifactuse/shared/src/theme.js
// Theme utilities for panel artifacts

/**
 * Default theme colors (matches SDK)
 */
export const DEFAULT_COLORS = {
  dark: {
    primary: '99, 102, 241',
    primaryHover: '79, 70, 229',
    background: '17, 24, 39',
    surface: '31, 41, 55',
    surfaceHover: '55, 65, 81',
    text: '243, 244, 246',
    textSecondary: '156, 163, 175',
    textMuted: '107, 114, 128',
    border: '75, 85, 99',
    borderLight: '55, 65, 81',
    success: '34, 197, 94',
    warning: '234, 179, 8',
    error: '239, 68, 68',
    info: '59, 130, 246',
  },
  light: {
    primary: '79, 70, 229',
    primaryHover: '67, 56, 202',
    background: '255, 255, 255',
    surface: '249, 250, 251',
    surfaceHover: '243, 244, 246',
    text: '17, 24, 39',
    textSecondary: '75, 85, 99',
    textMuted: '156, 163, 175',
    border: '229, 231, 235',
    borderLight: '243, 244, 246',
    success: '22, 163, 74',
    warning: '202, 138, 4',
    error: '220, 38, 38',
    info: '37, 99, 235',
  },
};

/**
 * Accent color presets
 */
export const ACCENT_PRESETS = {
  blue: { primary: '59 130 246', hover: '37 99 235' },
  green: { primary: '34 197 94', hover: '22 163 74' },
  purple: { primary: '168 85 247', hover: '147 51 234' },
  rose: { primary: '244 63 94', hover: '225 29 72' },
  orange: { primary: '249 115 22', hover: '234 88 12' },
  cyan: { primary: '6 182 212', hover: '8 145 178' },
  indigo: { primary: '99 102 241', hover: '79 70 229' },
  pink: { primary: '236 72 153', hover: '219 39 119' },
  teal: { primary: '20 184 166', hover: '13 148 136' },
  amber: { primary: '245 158 11', hover: '217 119 6' },
  red: { primary: '239 68 68', hover: '220 38 38' },
};

/**
 * Parse color string to RGB values
 * Supports: hex (#ff6432, #f64), rgb(255, 100, 50), "255 100 50", "255, 100, 50"
 */
export function parseColor(color) {
  if (!color) return null;
  
  const str = color.trim();
  
  // Hex color: #ff6432 or #f64
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
        return `${r} ${g} ${b}`;
      }
    }
    return null;
  }
  
  // RGB function: rgb(255, 100, 50)
  const rgbMatch = str.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return `${rgbMatch[1]} ${rgbMatch[2]} ${rgbMatch[3]}`;
  }
  
  // Space or comma separated: "255 100 50" or "255, 100, 50"
  const parts = str.split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1]} ${parts[2]}`;
  }
  
  return null;
}

/**
 * Darken a color for hover state (reduce by ~15%)
 */
export function darkenColor(rgbString) {
  const parts = rgbString.split(' ').map(Number);
  if (parts.length !== 3) return rgbString;
  
  const darkened = parts.map(v => Math.max(0, Math.round(v * 0.85)));
  return darkened.join(' ');
}

/**
 * Set accent color - accepts preset names or color codes
 * @param {string} accent - Preset name (blue, green, etc.) or color code (#ff6432, rgb(255,100,50))
 */
export function setAccentColor(accent) {
  if (!accent) return;
  
  const root = document.documentElement;
  
  // Check if it's a preset name
  if (ACCENT_PRESETS[accent]) {
    root.style.setProperty('--color-primary', ACCENT_PRESETS[accent].primary);
    root.style.setProperty('--color-primary-hover', ACCENT_PRESETS[accent].hover);
    return;
  }
  
  // Try to parse as color code
  const rgb = parseColor(accent);
  if (rgb) {
    root.style.setProperty('--color-primary', rgb);
    root.style.setProperty('--color-primary-hover', darkenColor(rgb));
  }
}

/**
 * Apply theme CSS variables to document
 */
export function applyTheme(theme = 'dark', customColors = {}) {
  const colors = { ...DEFAULT_COLORS[theme], ...customColors };
  const root = document.documentElement;
  
  // Set theme attribute
  root.setAttribute('data-artifactuse-theme', theme);
  
  // Apply CSS variables
  Object.entries(colors).forEach(([key, value]) => {
    const cssVar = `--artifactuse-${camelToKebab(key)}`;
    root.style.setProperty(cssVar, value);
  });
}

/**
 * Get current theme from parent or system preference
 */
export function detectTheme() {
  // Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const urlTheme = urlParams.get('theme');
  if (urlTheme === 'dark' || urlTheme === 'light') {
    return urlTheme;
  }
  
  // Check system preference
  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light';
  }
  
  return 'dark';
}

/**
 * Listen for theme changes from parent
 */
export function onThemeChange(callback, bridge) {
  if (bridge) {
    bridge.on('theme:change', ({ theme, colors }) => {
      applyTheme(theme, colors);
      callback(theme, colors);
    });
  }
  
  // Also listen for system preference changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const theme = e.matches ? 'dark' : 'light';
    applyTheme(theme);
    callback(theme);
  });
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Get CSS for embedding theme styles
 */
export function getThemeCSS(theme = 'dark') {
  const colors = DEFAULT_COLORS[theme];
  
  return Object.entries(colors)
    .map(([key, value]) => `--artifactuse-${camelToKebab(key)}: ${value};`)
    .join('\n  ');
}

export default {
  DEFAULT_COLORS,
  ACCENT_PRESETS,
  parseColor,
  darkenColor,
  setAccentColor,
  applyTheme,
  detectTheme,
  onThemeChange,
  getThemeCSS,
};
