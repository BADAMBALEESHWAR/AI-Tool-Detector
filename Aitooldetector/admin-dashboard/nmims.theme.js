// ─────────────────────────────────────────────────────────────────────────────
// SVKM's NMIMS theme for Tailwind
//
// Brand values are taken from nmims.edu: red #d2232a (hover #da3233), ink
// #231f20, body text #5d5d5d, white surfaces, Lato / Roboto typography.
//
// The pages were originally written for a dark UI (zinc/gray surfaces, white
// text, light accent shades). Instead of rewriting every className, this file
// remaps the palette so the same classes render the NMIMS light theme:
//
//   • zinc / gray are inverted: 950 = page, 900 = card, 800 = input/secondary
//     button, 700 = border/hover; 600 → 100 run from muted grey to ink.
//   • `white` is the ink colour, so `text-white` is primary text and overlays
//     like `bg-white/5` or `border-white/10` become subtle tints on white.
//     Use `paper` wherever a literal white is needed (text on red buttons).
//   • violet / purple / indigo / brand all resolve to NMIMS red.
//   • Status colours have their 100–400 shades darkened so text written as
//     `text-emerald-400` etc. stays readable on a white background, and 950
//     (used only for faint tints) becomes light.
//
// Keep this file identical in admin-dashboard/ and student-dashboard/.
// ─────────────────────────────────────────────────────────────────────────────
import colors from 'tailwindcss/colors';

export const nmims = {
  red: '#d2232a',
  redHover: '#da3233',
  redDark: '#b01b21',
  ink: '#231f20',
  body: '#5d5d5d',
  paper: '#ffffff',
  page: '#f4f4f5',
};

const neutral = {
  50: '#141112',
  100: nmims.ink,
  200: '#2f2b2c',
  300: '#3d3a3b',
  400: '#4f4c4d',
  500: nmims.body,
  600: '#80808a',
  700: '#e2e2e6',
  800: '#f1f1f3',
  900: nmims.paper,
  950: nmims.page,
};

const accent = {
  50: '#fdf3f3',
  100: '#fbe4e5',
  200: '#f6c4c6',
  300: '#b81e25',
  400: '#c42027',
  500: nmims.redHover,
  600: nmims.red,
  700: nmims.redDark,
  800: '#8f161b',
  900: '#6e1115',
  950: '#fbe4e5', // only used for faint background tints / shadows
};

// 100–400 darken (they were text shades on dark); 950 becomes a light tint (it
// was only ever used for faint backgrounds and shadows).
const darkenLight = (c) => ({ ...c, 100: c[800], 200: c[800], 300: c[700], 400: c[600], 950: c[100] });

export const nmimsColors = {
  white: nmims.ink,
  paper: nmims.paper,
  ink: nmims.ink,
  zinc: neutral,
  gray: neutral,
  violet: accent,
  purple: accent,
  indigo: accent,
  brand: accent,
  nmims: accent,
  red: darkenLight(colors.red),
  rose: darkenLight(colors.rose),
  pink: darkenLight(colors.pink),
  orange: darkenLight(colors.orange),
  amber: darkenLight(colors.amber),
  yellow: darkenLight(colors.yellow),
  lime: darkenLight(colors.lime),
  green: darkenLight(colors.green),
  emerald: darkenLight(colors.emerald),
  teal: darkenLight(colors.teal),
  cyan: darkenLight(colors.cyan),
  sky: darkenLight(colors.sky),
  blue: darkenLight(colors.blue),
};

// Preflight takes the default border/divide colour from gray-200, which is ink
// after the inversion above, so pin it to the light border shade explicitly.
export const nmimsBorderColor = { DEFAULT: neutral[700] };

export const nmimsFonts = {
  sans: ['Lato', 'Roboto', 'system-ui', 'sans-serif'],
  display: ['Poppins', 'Lato', 'system-ui', 'sans-serif'],
};
