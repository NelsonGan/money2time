import {
  beforeSendException,
  MAX_EVENTS_PER_WINDOW,
  resetErrorReportingWindow,
  scrubExceptionProperties,
  toExceptionProperties,
} from '~/services/errorReporting';

const exception = (type: string, value: string, extra: Record<string, unknown> = {}) => ({
  event: '$exception',
  properties: { $exception_list: [{ type, value }], ...extra },
});

describe('errorReporting', () => {
  beforeEach(() => resetErrorReportingWindow(0));

  describe('scrubExceptionProperties', () => {
    it('keeps PostHog fields, the component stack and short scalar context', () => {
      const stack = 'at Screen\n'.repeat(200);
      expect(
        scrubExceptionProperties({
          $exception_list: [{ type: 'Error', value: 'boom' }],
          $session_id: 'session',
          component_stack: stack,
          scope: 'app_load',
          retry: 2,
          fatal: false,
        }),
      ).toEqual({
        $exception_list: [{ type: 'Error', value: 'boom' }],
        $session_id: 'session',
        component_stack: stack,
        scope: 'app_load',
        retry: 2,
        fatal: false,
      });
    });

    it('drops objects and long free text that could carry user data', () => {
      const scrubbed = scrubExceptionProperties({
        transaction: { amount: 42, note: 'dinner with Sam' },
        note: 'x'.repeat(500),
      });
      expect(scrubbed).toEqual({});
    });
  });

  describe('beforeSendException', () => {
    it('dedupes identical errors within a window', () => {
      expect(beforeSendException(exception('Error', 'boom'), 1000)).not.toBeNull();
      expect(beforeSendException(exception('Error', 'boom'), 1000)).toBeNull();
      expect(beforeSendException(exception('Error', 'other'), 1000)).not.toBeNull();
    });

    it('caps the number of distinct events per window', () => {
      for (let i = 0; i < MAX_EVENTS_PER_WINDOW; i++) {
        expect(beforeSendException(exception('Error', `e${i}`), 1000)).not.toBeNull();
      }
      expect(beforeSendException(exception('Error', 'overflow'), 1000)).toBeNull();
    });

    it('resets the cap after the window elapses', () => {
      for (let i = 0; i < MAX_EVENTS_PER_WINDOW; i++) {
        beforeSendException(exception('Error', `e${i}`), 1000);
      }
      expect(beforeSendException(exception('Error', 'later'), 1000 + 6 * 60_000)).not.toBeNull();
    });

    it('scrubs the event it passes through', () => {
      const event = beforeSendException(
        exception('Error', 'x', { payload: { amount: 12 }, scope: 'sync' }),
        1000,
      );
      expect(event?.properties).toEqual({
        $exception_list: [{ type: 'Error', value: 'x' }],
        scope: 'sync',
      });
    });
  });

  describe('toExceptionProperties', () => {
    it('snake-cases keys and keeps scalar values only', () => {
      expect(
        toExceptionProperties({
          componentStack: 'at App',
          autoLogEntryId: 7,
          scope: 'autolog',
          nested: { a: 1 },
          missing: undefined,
        }),
      ).toEqual({ component_stack: 'at App', auto_log_entry_id: 7, scope: 'autolog' });
      expect(toExceptionProperties()).toEqual({});
    });
  });
});
