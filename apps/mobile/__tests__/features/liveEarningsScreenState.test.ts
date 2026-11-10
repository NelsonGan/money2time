import {
  type LiveEarningsScreenInputs,
  liveEarningsScreenState,
} from '~/features/widgets/lib/liveEarningsScreenState';

const READY: LiveEarningsScreenInputs = {
  available: true,
  hydrated: true,
  enabled: true,
  hasWage: true,
  running: false,
};

describe('liveEarningsScreenState', () => {
  it('offers Start and the schedule when everything is in place', () => {
    expect(liveEarningsScreenState(READY)).toEqual({
      canStart: true,
      showActionBar: true,
      blocker: null,
      showSchedule: true,
    });
  });

  it('asks for an hourly value and hides Start when there is none', () => {
    expect(liveEarningsScreenState({ ...READY, hasWage: false })).toEqual({
      canStart: false,
      showActionBar: false,
      blocker: 'wage',
      showSchedule: false,
    });
  });

  it('keeps Stop for a session that outlived the hourly value', () => {
    // The hourly value was deleted while a session was on the Lock Screen.
    expect(liveEarningsScreenState({ ...READY, hasWage: false, running: true })).toEqual({
      canStart: false,
      showActionBar: true,
      blocker: null,
      showSchedule: false,
    });
  });

  it('keeps Stop for a running session when Live Activities are switched off', () => {
    const state = liveEarningsScreenState({ ...READY, enabled: false, running: true });
    expect(state.showActionBar).toBe(true);
    expect(state.blocker).toBeNull();
  });

  it('shows no buttons until ActivityKit has answered', () => {
    const state = liveEarningsScreenState({ ...READY, hydrated: false });
    expect(state.showActionBar).toBe(false);
    expect(state.showSchedule).toBe(false);
    expect(state.blocker).toBeNull();
  });

  it('explains switched-off Live Activities only once hydrated', () => {
    expect(liveEarningsScreenState({ ...READY, enabled: false }).blocker).toBe('disabled');
    expect(
      liveEarningsScreenState({ ...READY, enabled: false, hydrated: false }).blocker,
    ).toBeNull();
  });

  it('says Live Activities are unavailable before asking for a wage', () => {
    expect(liveEarningsScreenState({ ...READY, available: false, hasWage: false }).blocker).toBe(
      'unavailable',
    );
  });
});
