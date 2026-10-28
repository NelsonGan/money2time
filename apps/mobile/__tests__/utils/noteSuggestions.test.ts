import { escapeLike, noteMatchRank, rankNoteSuggestions } from '~/utils/noteSuggestions';

describe('noteMatchRank', () => {
  it('matches the start of the note', () => {
    expect(noteMatchRank('Mcd Burger', 'mcd')).toBe(0);
    expect(noteMatchRank('Mcd Burger', 'Mcd Bur')).toBe(0);
  });

  it('matches the start of a later word', () => {
    expect(noteMatchRank('Mcd Burger', 'burger')).toBe(1);
    expect(noteMatchRank('Mcd Burger', 'BUR')).toBe(1);
    expect(noteMatchRank('Lunch (burger)', 'burger')).toBe(1);
    expect(noteMatchRank('Grab-food', 'food')).toBe(1);
  });

  it('does not match inside a word', () => {
    expect(noteMatchRank('Mcd Burger', 'urger')).toBeNull();
    expect(noteMatchRank('Cheeseburger', 'burger')).toBeNull();
  });

  it('matches anywhere in scripts written without spaces', () => {
    expect(noteMatchRank('麦当劳汉堡', '汉堡')).toBe(1);
    expect(noteMatchRank('マクドナルドのバーガー', 'バーガー')).toBe(1);
  });

  it('ignores an empty query', () => {
    expect(noteMatchRank('Mcd Burger', '  ')).toBeNull();
  });
});

describe('rankNoteSuggestions', () => {
  it('puts start-of-note matches first and keeps recency within each group', () => {
    const newestFirst = ['Mcd Burger', 'Burger King', 'Cheeseburger', 'KFC burger', 'Burgers'];
    expect(rankNoteSuggestions(newestFirst, 'burger')).toEqual([
      'Burger King',
      'Burgers',
      'Mcd Burger',
      'KFC burger',
    ]);
  });

  it('caps the list', () => {
    const notes = ['a x', 'b x', 'c x', 'd x', 'e x', 'f x'];
    expect(rankNoteSuggestions(notes, 'x')).toHaveLength(5);
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
  });
});
