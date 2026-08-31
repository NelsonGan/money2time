import { resolveNoteChange } from '~/features/transactions/lib/noteSuggestionPick';

describe('resolveNoteChange', () => {
  it('applies ordinary typing when nothing was just picked', () => {
    expect(resolveNoteChange('gr', null)).toEqual({ kind: 'apply', note: 'gr' });
  });

  it('drops the IME commit that follows a pick', () => {
    // The user typed "g" on a Pinyin keyboard and tapped "Grab". Blurring the
    // field commits the marked "g", which arrives as one more change.
    expect(resolveNoteChange('g', 'Grab')).toEqual({ kind: 'keepPick', note: 'Grab' });
  });

  it('accepts a change that already matches the pick', () => {
    expect(resolveNoteChange('Grab', 'Grab')).toEqual({ kind: 'apply', note: 'Grab' });
  });

  it('treats clearing the field after a pick as the commit, not an edit', () => {
    // An IME can commit an empty string; the pick must survive it.
    expect(resolveNoteChange('', 'Grab')).toEqual({ kind: 'keepPick', note: 'Grab' });
  });

  it('applies edits once the latch has been released', () => {
    expect(resolveNoteChange('Grab Pay', null)).toEqual({ kind: 'apply', note: 'Grab Pay' });
  });
});
