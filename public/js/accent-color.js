/* ═══════════════════════════════════════════════════════
   DOJO SHOW 2.0 — Accent Color Utility
   Shared across admin.js, display.js, settings.js
   ═══════════════════════════════════════════════════════ */

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Apply accent color to the entire page by updating CSS custom properties.
 * @param {string} hex - Hex color string like '#7b2ff7'
 */
function applyAccentColor(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);

  // Compute variants
  const lightHex = hslToHex(h, Math.min(s + 10, 100), Math.min(l + 15, 85));
  const darkHex = hslToHex(h, s, Math.max(l - 15, 10));
  const { r: lr, g: lg, b: lb } = hexToRgb(lightHex);

  const root = document.documentElement.style;

  // Primary color and variants
  root.setProperty('--purple-primary', hex);
  root.setProperty('--purple', hex);
  root.setProperty('--purple-light', lightHex);
  root.setProperty('--purple-dark', darkHex);

  // RGBA variants
  root.setProperty('--purple-glow', `rgba(${r}, ${g}, ${b}, 0.3)`);
  root.setProperty('--card-purple', `rgba(${r}, ${g}, ${b}, 0.12)`);
  root.setProperty('--card-border', `rgba(${r}, ${g}, ${b}, 0.25)`);
  root.setProperty('--card-border-alt', `rgba(${lr}, ${lg}, ${lb}, 0.25)`);

  // Update DEFAULT_AVATAR if defined (display.js / settings.js)
  if (typeof updateDefaultAvatar === 'function') {
    updateDefaultAvatar(hex);
  }
}

/** Preset accent colors */
const ACCENT_PRESETS = [
  { name: 'Violet', hex: '#7b2ff7' },
  { name: 'Bleu', hex: '#2196f3' },
  { name: 'Cyan', hex: '#00bcd4' },
  { name: 'Vert', hex: '#4caf50' },
  { name: 'Orange', hex: '#ff9800' },
  { name: 'Rouge', hex: '#f44336' },
  { name: 'Rose', hex: '#e91e63' },
  { name: 'Or', hex: '#ffc107' },
];
