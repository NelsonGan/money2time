export interface AdsVisibilityOptions {
  hasAdFreeEntitlement?: boolean;
  installStartedAt?: string | null;
  nowMs?: number;
}

export interface AdsCooldownState {
  adsUnlocked: boolean;
  cooldownEndsAt: string | null;
  hoursUntilAdsStart: number;
  isInCooldown: boolean;
  remainingMs: number;
}

export const ADS_INITIAL_COOLDOWN_HOURS = 24;

const HOUR_IN_MS = 60 * 60 * 1000;
const ADS_INITIAL_COOLDOWN_MS = ADS_INITIAL_COOLDOWN_HOURS * HOUR_IN_MS;

function parseInstallStartedAt(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getAdsCooldownState(options: AdsVisibilityOptions = {}): AdsCooldownState {
  const installStartedAtMs = parseInstallStartedAt(options.installStartedAt);

  if (installStartedAtMs === null) {
    return {
      adsUnlocked: !options.hasAdFreeEntitlement,
      cooldownEndsAt: null,
      hoursUntilAdsStart: 0,
      isInCooldown: false,
      remainingMs: 0,
    };
  }

  const cooldownEndsAtMs = installStartedAtMs + ADS_INITIAL_COOLDOWN_MS;
  const remainingMs = Math.max(cooldownEndsAtMs - (options.nowMs ?? Date.now()), 0);
  const isInCooldown = remainingMs > 0;

  return {
    adsUnlocked: !options.hasAdFreeEntitlement && !isInCooldown,
    cooldownEndsAt: new Date(cooldownEndsAtMs).toISOString(),
    hoursUntilAdsStart: isInCooldown ? Math.ceil(remainingMs / HOUR_IN_MS) : 0,
    isInCooldown,
    remainingMs,
  };
}

export function areAdsUnlocked(options: AdsVisibilityOptions = {}) {
  return getAdsCooldownState(options).adsUnlocked;
}
