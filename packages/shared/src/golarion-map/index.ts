// Golarion-map primitives: MapLibre style, color palette, pin layer helpers,
// game-icon image registration, stars layer, auto-rotate, and optional cloud-wash.
// Shared between the DM tool's editor globe and the player portal's read-only view.

export { DEFAULT_PMTILES_URL, buildMapStyle, colors } from './style.js';
export { PIN_SOURCE, PIN_LAYER, pinDisplaySize, pinsToGeoJson } from './pins.js';
export {
  DEFAULT_FILL_HEX,
  coloredIconKey,
  ensureDefaultImage,
  ensureIconImage,
  getIconBody,
  iconKey,
  iconSvgHtml,
  normalizeIconColor,
  parseIconKey,
  resolvePinIcon,
} from './icons.js';
export { createStarsLayer } from './stars.js';
export type { StarsOptions, ResolvedStarsOptions } from './stars.js';
export { startAutoRotate } from './auto-rotate.js';
export type { AutoRotateOptions } from './auto-rotate.js';
export { createCloudsLayer, mergeCloudsOptions } from './clouds.js';
export type { CloudsOptions } from './clouds.js';
export { createHaloLayer, mergeHaloOptions } from './halo.js';
export type { HaloOptions, ResolvedHaloOptions } from './halo.js';
export { createLimbDarkeningLayer, mergeLimbOptions } from './limb.js';
export type { LimbOptions, ResolvedLimbOptions } from './limb.js';
