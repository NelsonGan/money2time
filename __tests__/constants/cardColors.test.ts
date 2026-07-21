import {
  CARD_COLORS,
  getCardColorById,
  getDefaultCardColorForLogo,
  resolveCardColor,
} from '~/constants/cardColors';

describe('cardColors', () => {
  it('getCardColorById returns the matching def or null', () => {
    expect(getCardColorById('midnight')?.id).toBe('midnight');
    expect(getCardColorById(null)).toBeNull();
    expect(getCardColorById(undefined)).toBeNull();
    expect(getCardColorById('does-not-exist')).toBeNull();
  });

  it('getDefaultCardColorForLogo is deterministic and returns a valid color id', () => {
    const ids = new Set(CARD_COLORS.map((c) => c.id));
    const a = getDefaultCardColorForLogo('malaysia/maybank');
    const b = getDefaultCardColorForLogo('malaysia/maybank');
    expect(a).toBe(b);
    expect(ids.has(a)).toBe(true);
  });

  it('maps known brands to a color analyzed from their palette', () => {
    // From the generated LOGO_CARD_COLORS map (brand-hue matched).
    expect(getDefaultCardColorForLogo('malaysia/cimb')).toBe('crimson');
    expect(getDefaultCardColorForLogo('malaysia/grabpay')).toBe('emerald');
    expect(getDefaultCardColorForLogo('malaysia/gxbank')).toBe('plum');
  });

  it('falls back to a stable valid color for unmapped/custom logos', () => {
    const ids = new Set(CARD_COLORS.map((c) => c.id));
    const a = getDefaultCardColorForLogo('custom:some-uploaded-logo-id');
    const b = getDefaultCardColorForLogo('custom:some-uploaded-logo-id');
    expect(a).toBe(b);
    expect(ids.has(a)).toBe(true);
  });

  it('resolveCardColor honours an explicit valid cardColor', () => {
    const color = resolveCardColor({ id: 'acc1', logoId: null, cardColor: 'ocean' });
    expect(color.id).toBe('ocean');
  });

  it('resolveCardColor falls back to a stable auto color from logo then id', () => {
    const fromLogo = resolveCardColor({ id: 'acc1', logoId: 'usa/chase', cardColor: null });
    expect(fromLogo.id).toBe(getDefaultCardColorForLogo('usa/chase'));

    // Invalid/unknown explicit id → treated as auto.
    const invalid = resolveCardColor({ id: 'acc1', logoId: 'usa/chase', cardColor: 'bogus' });
    expect(invalid.id).toBe(fromLogo.id);

    // No logo → stable per account id.
    const first = resolveCardColor({ id: 'acc-xyz', logoId: null, cardColor: null });
    const second = resolveCardColor({ id: 'acc-xyz', logoId: null, cardColor: null });
    expect(first.id).toBe(second.id);
  });
});
