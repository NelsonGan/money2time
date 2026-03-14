import { useEffect, useMemo, useState } from 'react';

import { getAdsCooldownState, type AdsCooldownState } from '~/services/ads';

const HOUR_IN_MS = 60 * 60 * 1000;

function getNextRefreshDelayMs(status: AdsCooldownState) {
  if (!status.isInCooldown || status.remainingMs <= 0) {
    return null;
  }

  const nextHourBoundaryMs = status.remainingMs % HOUR_IN_MS || HOUR_IN_MS;
  return Math.max(250, Math.min(status.remainingMs, nextHourBoundaryMs));
}

export function useAdsCooldownStatus(installStartedAt?: string | null) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setNowMs(Date.now());
  }, [installStartedAt]);

  const status = useMemo(
    () => getAdsCooldownState({ installStartedAt, nowMs }),
    [installStartedAt, nowMs],
  );

  useEffect(() => {
    const nextRefreshDelayMs = getNextRefreshDelayMs(status);

    if (nextRefreshDelayMs === null) {
      return;
    }

    const timer = setTimeout(() => {
      setNowMs(Date.now());
    }, nextRefreshDelayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  return status;
}
