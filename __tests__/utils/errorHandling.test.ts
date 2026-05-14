import { getErrorMessage, toError } from '~/utils/errorHandling';

describe('getErrorMessage', () => {
  it('returns the message from a real Error', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns the string when error is a non-empty string', () => {
    expect(getErrorMessage('plain error')).toBe('plain error');
  });

  it('falls back when the Error message is empty', () => {
    expect(getErrorMessage(new Error('   '), 'fallback')).toBe('fallback');
  });

  it('falls back when the value is undefined/null', () => {
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(getErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('falls back to a default i18n-resolved message when not provided', () => {
    expect(getErrorMessage({}, undefined)).toBe('Operation failed');
  });
});

describe('toError', () => {
  it('returns the original Error when it has a message', () => {
    const err = new Error('original');
    expect(toError(err)).toBe(err);
  });

  it('wraps non-Error values', () => {
    const result = toError('failure');
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('failure');
  });

  it('wraps empty errors with the fallback message', () => {
    const result = toError({}, 'fallback message');
    expect(result.message).toBe('fallback message');
  });
});
