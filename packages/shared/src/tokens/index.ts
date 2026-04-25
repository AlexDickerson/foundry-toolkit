/**
 * PF2e design token constants for TypeScript consumers.
 *
 * Hex values mirror the CSS custom properties in pf2e.css — keep them
 * in sync when editing either file. Use these wherever inline styles or
 * JS-driven styling (e.g. MapLibre paint properties, React inline styles)
 * need to reference the canonical PF2e palette.
 *
 * Derived from foundryvtt/pf2e (Apache-2.0) — see NOTICE.
 */

/** Core PF2e color palette. */
export const pf2eColors = {
  // Core palette
  primary: '#5e0000',
  primaryDark: '#4a0000',
  primaryLight: '#7a0000',
  secondary: '#171f69',
  secondaryDark: '#0f1547',
  secondaryLight: '#2a358f',
  tertiary: '#e9d7a1',
  tertiaryDark: '#cbb77a',
  tertiaryLight: '#f3e6be',
  alt: '#786452',
  altDark: '#443730',
  altLight: '#9a8471',

  // Surfaces
  bg: '#f8f4f1',
  bgDark: '#e6dfd7',
  sub: '#605856',
  text: '#1c1c1c',
  textMuted: '#605856',
  border: '#baa991',

  // Rarity — semantic, frozen across alternate schemes
  rarityCommon: '#323232',
  rarityUncommon: '#98513d',
  rarityRare: '#002664',
  rarityUnique: '#54166e',

  // Proficiency ranks — semantic, frozen across alternate schemes
  profUntrained: '#424242',
  profTrained: '#171f69',
  profExpert: '#3c005e',
  profMaster: '#664400',
  profLegendary: '#5e0000',

  // Degrees of success — semantic, frozen across alternate schemes
  critSuccess: '#008000',
  success: '#0000ff',
  failure: '#ff4500',
  critFailure: '#ff0000',
} as const;

export type Pf2eColor = (typeof pf2eColors)[keyof typeof pf2eColors];

/** PF2e font-stack strings, matching the CSS custom properties in pf2e.css. */
export const pf2eFonts = {
  sans: 'Roboto, ui-sans-serif, system-ui, sans-serif',
  sansCondensed: "'Roboto Condensed', Roboto, ui-sans-serif, sans-serif",
  serif: "Eczar, Georgia, 'Times New Roman', serif",
  body: "Gelasio, Georgia, 'Times New Roman', serif",
  mono: "'Roboto Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace",
} as const;
