import {
  beforeBreadcrumbFilter,
  beforeSendEvent,
  MAX_EVENTS_PER_WINDOW,
  resetErrorReportingWindow,
  scrubEvent,
} from '~/services/errorReporting';

describe('errorReporting', () => {
  beforeEach(() => resetErrorReportingWindow(0));

  describe('scrubEvent', () => {
    it('reduces the user to just an anonymous id', () => {
      const event = scrubEvent({
        user: { id: 'm2t_123', email: 'a@b.com', ip_address: '1.2.3.4' },
      } as Parameters<typeof scrubEvent>[0]);
      expect(event.user).toEqual({ id: 'm2t_123' });
    });

    it('drops the user entirely when there is no id', () => {
      const event = scrubEvent({ user: { email: 'a@b.com' } } as Parameters<typeof scrubEvent>[0]);
      expect(event.user).toBeUndefined();
    });

    it('removes request payloads', () => {
      const event = scrubEvent({ request: { url: 'x', data: { amount: 42 } } });
      expect('request' in event).toBe(false);
    });
  });

  describe('beforeSendEvent', () => {
    it('dedupes identical errors within a window', () => {
      const make = () => ({ exception: { values: [{ type: 'Error', value: 'boom' }] } });
      expect(beforeSendEvent(make(), 1000)).not.toBeNull();
      expect(beforeSendEvent(make(), 1000)).toBeNull();
    });

    it('caps the number of distinct events per window', () => {
      for (let i = 0; i < MAX_EVENTS_PER_WINDOW; i++) {
        expect(beforeSendEvent({ message: `e${i}` }, 1000)).not.toBeNull();
      }
      expect(beforeSendEvent({ message: 'overflow' }, 1000)).toBeNull();
    });

    it('resets the cap after the window elapses', () => {
      for (let i = 0; i < MAX_EVENTS_PER_WINDOW; i++) {
        beforeSendEvent({ message: `e${i}` }, 1000);
      }
      // Same message that would otherwise be deduped/capped, but a new window.
      expect(beforeSendEvent({ message: 'later' }, 1000 + 6 * 60_000)).not.toBeNull();
    });

    it('scrubs the event it passes through', () => {
      const event = beforeSendEvent({ message: 'x', request: { url: 'y' } }, 1000);
      expect(event).not.toBeNull();
      expect('request' in (event as object)).toBe(false);
    });
  });

  describe('beforeBreadcrumbFilter', () => {
    it('drops console breadcrumbs', () => {
      expect(beforeBreadcrumbFilter({ category: 'console' })).toBeNull();
    });

    it('keeps non-console breadcrumbs', () => {
      expect(beforeBreadcrumbFilter({ category: 'navigation' })).not.toBeNull();
    });
  });
});
