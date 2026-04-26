import { describe, expect, it } from 'vitest';
import { resolveMonsterArtAssets } from './monster-art';

describe('resolveMonsterArtAssets', () => {
  it('uses token as portrait and full art as artSrc when both are present', () => {
    const result = resolveMonsterArtAssets('token.png', 'art.png');
    expect(result).toEqual({ portraitSrc: 'token.png', artSrc: 'art.png' });
  });

  it('uses token as portrait with null artSrc when token exists but no full art', () => {
    const result = resolveMonsterArtAssets('token.png', null);
    expect(result).toEqual({ portraitSrc: 'token.png', artSrc: null });
  });

  it('uses full art for both portrait and artSrc when no token is available', () => {
    const result = resolveMonsterArtAssets(null, 'art.png');
    expect(result).toEqual({ portraitSrc: 'art.png', artSrc: 'art.png' });
  });

  it('returns null for both when neither token nor art is available', () => {
    const result = resolveMonsterArtAssets(null, null);
    expect(result).toEqual({ portraitSrc: null, artSrc: null });
  });
});
