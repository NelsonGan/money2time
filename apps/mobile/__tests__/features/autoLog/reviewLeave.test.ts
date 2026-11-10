import {
  forgetReviewSelections,
  leavePromptButtons,
  rememberedReviewSelections,
  rememberReviewSelections,
} from '~/features/autoLog/lib/reviewLeave';

describe('leavePromptButtons', () => {
  const buttons = { cancel: 'cancel', later: 'later', ignore: 'ignore' };

  it('puts Review later first on iOS, where Cancel is moved last', () => {
    expect(leavePromptButtons('ios', buttons)).toEqual(['cancel', 'later', 'ignore']);
  });

  it('keeps Cancel between Review later and Ignore on Android', () => {
    // Android maps three buttons to neutral, negative, positive.
    expect(leavePromptButtons('android', buttons)).toEqual(['ignore', 'cancel', 'later']);
  });
});

describe('remembered review selections', () => {
  const amount = { amount: 12.5, currency: 'MYR' };
  afterEach(() => forgetReviewSelections());

  it('starts empty', () => {
    expect(rememberedReviewSelections('user-a', 0)).toEqual({});
  });

  it('keeps choices for items still pending only', () => {
    rememberReviewSelections(
      'user-a',
      0,
      { one: { amount, accountId: 'acc' }, done: { amount, accountId: null } },
      ['one'],
    );
    expect(rememberedReviewSelections('user-a', 0)).toEqual({ one: { amount, accountId: 'acc' } });
  });

  it("does not hand one user or a reset history another one's choices", () => {
    rememberReviewSelections('user-a', 0, { one: { amount, accountId: null } }, ['one']);
    expect(rememberedReviewSelections('user-b', 0)).toEqual({});
    expect(rememberedReviewSelections('user-a', 1)).toEqual({});
  });

  it('returns a copy, so the screen cannot change what is kept', () => {
    rememberReviewSelections('user-a', 0, { one: { amount, accountId: null } }, ['one']);
    rememberedReviewSelections('user-a', 0).two = { amount, accountId: null };
    expect(Object.keys(rememberedReviewSelections('user-a', 0))).toEqual(['one']);
  });
});
