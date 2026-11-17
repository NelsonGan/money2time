import {
  albumIconAfterLocationChange,
  flagEmojiForCountry,
  flagIconForCountry,
  isFlagEmoji,
} from '~/features/albums/lib/flagEmoji';

describe('isFlagEmoji', () => {
  it('accepts country and region flags', () => {
    for (const flag of ['🇨🇳', '🇺🇸', '🇸🇬', '🇲🇾', '🇯🇵', '🇪🇺', '🇺🇳']) {
      expect(isFlagEmoji(flag)).toBe(true);
    }
  });

  it('accepts subdivision flags and the rectangular named flags', () => {
    expect(isFlagEmoji('🏴󠁧󠁢󠁳󠁣󠁴󠁿')).toBe(true); // Scotland
    expect(isFlagEmoji('🏴󠁧󠁢󠁷󠁬󠁳󠁿')).toBe(true); // Wales
    expect(isFlagEmoji('🏳️‍🌈')).toBe(true);
    expect(isFlagEmoji('🏳️‍⚧️')).toBe(true);
    expect(isFlagEmoji('🏴‍☠️')).toBe(true);
  });

  it('rejects flags on poles, other emoji and loose letters', () => {
    for (const glyph of ['🏁', '🚩', '🎌', '🏳️', '🏴', '🍣', '✈️', '🏖️', '🇯', '🇯🇵🇯🇵', 'JP', '']) {
      expect(isFlagEmoji(glyph)).toBe(false);
    }
  });
});

describe('flagEmojiForCountry', () => {
  it('turns a country code into its flag', () => {
    expect(flagEmojiForCountry('JP')).toBe('🇯🇵');
    expect(flagEmojiForCountry('my')).toBe('🇲🇾');
    expect(flagEmojiForCountry(' us ')).toBe('🇺🇸');
    expect(flagIconForCountry('CN')).toBe('emoji:🇨🇳');
  });

  it('gives nothing for a missing or malformed code', () => {
    for (const code of [null, undefined, '', 'J', 'JPN', '12', 'É1']) {
      expect(flagEmojiForCountry(code)).toBeNull();
      expect(flagIconForCountry(code)).toBeNull();
    }
  });

  it('makes flags isFlagEmoji accepts', () => {
    expect(isFlagEmoji(flagEmojiForCountry('SG')!)).toBe(true);
  });
});

describe('albumIconAfterLocationChange', () => {
  it('fills an empty icon with the new place’s flag', () => {
    expect(albumIconAfterLocationChange('', null, 'JP')).toBe('emoji:🇯🇵');
  });

  it('moves a flag that came from the old place to the new one', () => {
    expect(albumIconAfterLocationChange('emoji:🇯🇵', 'JP', 'MY')).toBe('emoji:🇲🇾');
  });

  it('keeps an icon the user picked', () => {
    expect(albumIconAfterLocationChange('plane', 'JP', 'MY')).toBe('plane');
    expect(albumIconAfterLocationChange('emoji:🍣', null, 'JP')).toBe('emoji:🍣');
    expect(albumIconAfterLocationChange('emoji:🇺🇸', 'JP', 'MY')).toBe('emoji:🇺🇸');
  });

  it('takes the flag away with the location, and leaves the icon without a country', () => {
    expect(albumIconAfterLocationChange('emoji:🇯🇵', 'JP', null)).toBe('');
    expect(albumIconAfterLocationChange('plane', 'JP', null)).toBe('plane');
    expect(albumIconAfterLocationChange('', 'JP', null)).toBe('');
    expect(albumIconAfterLocationChange('', null, null)).toBe('');
  });
});
