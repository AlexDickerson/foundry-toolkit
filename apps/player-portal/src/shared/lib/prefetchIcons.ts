import type { PreparedCharacter } from '@/features/characters/types';

/**
 * Kicks off browser-side prefetching of every icon the character sheet
 * will render. Populates the browser image cache that `<img>` elements
 * draw from, eliminating the waterfall of icon loads when the player
 * first visits each tab.
 *
 * `new Image()` is the correct mechanism — `fetch()` only hits the HTTP
 * cache, which `<img>` elements do not share. Setting `.src` on a hidden
 * Image object causes the browser to issue the GET and cache the response
 * in the image cache that subsequent `<img src="...">` reads hit directly.
 *
 * Fire-and-forget: no awaiting, no error handling. A missing icon is a
 * cosmetic issue; a prefetch failure must not affect the sheet.
 */
export function prefetchIcons(actor: PreparedCharacter): void {
  const paths = new Set<string>();

  // Feats, spells, weapons, armor, consumables, actions, class features —
  // every owned item carries an img.
  for (const item of actor.items) {
    if (item.img) paths.add(item.img);
  }

  // Shield slot uses a different field name.
  const shieldIcon = actor.system.attributes.shield.icon;
  if (shieldIcon) paths.add(shieldIcon);

  // Strikes on system.actions — the img lives on the embedded item source.
  for (const strike of actor.system.actions) {
    if (strike.item.img) paths.add(strike.item.img);
  }

  for (const path of paths) {
    const img = new Image();
    img.src = path;
  }
}
