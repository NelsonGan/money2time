// Cloudflare Turnstile in front of sending a sign-in code
// (POST /api/auth/email-otp/send-verification-otp), so a script cannot use
// the Worker to mail codes to addresses it does not own.
//
// The app runs the widget in a hidden WebView whose page origin is
// https://money2time.com and sends the token in the `x-turnstile-token`
// header. Rollout, so builds made before the app sent a token keep working:
//
//   no TURNSTILE_SECRET_KEY          no check at all
//   secret, TURNSTILE_ENFORCE unset  a missing token passes; a token that is
//                                    present must verify
//   secret, TURNSTILE_ENFORCE=true   every request needs a token that verifies
//
// Siteverify being unreachable counts as no token: let through unless enforced.

export const TURNSTILE_HEADER = 'x-turnstile-token';
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Turnstile tokens are at most 2048 characters. */
const MAX_TOKEN_LENGTH = 2048;
const SITEVERIFY_TIMEOUT_MS = 5_000;

export interface TurnstileCheck {
  /** The request's `x-turnstile-token`, if any. */
  token: string | null;
  /** TURNSTILE_SECRET_KEY. */
  secret: string | undefined;
  /** TURNSTILE_ENFORCE === 'true'. */
  enforce: boolean;
  /** cf-connecting-ip, passed on to Cloudflare as `remoteip`. */
  remoteIp: string | null;
  /** Hostnames the widget's page may be on (TURNSTILE_HOSTNAMES); empty skips the check. */
  hostnames: readonly string[];
  fetcher?: typeof fetch;
}

type TurnstileResult =
  | { ok: true; reason: 'not_configured' | 'no_token' | 'unreachable' | 'verified' }
  | { ok: false; reason: 'missing' | 'invalid' | 'hostname' | 'unreachable'; codes?: string[] };

interface SiteverifyResponse {
  success?: boolean;
  hostname?: string;
  'error-codes'?: string[];
}

/** Whether the code request may go on, and why (for logs and tests). */
export async function checkTurnstile(check: TurnstileCheck): Promise<TurnstileResult> {
  const { secret, enforce, hostnames } = check;
  if (!secret) return { ok: true, reason: 'not_configured' };
  const token = check.token?.trim() ?? '';
  if (!token) return enforce ? { ok: false, reason: 'missing' } : { ok: true, reason: 'no_token' };
  if (token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: 'invalid', codes: ['too_long'] };

  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  if (check.remoteIp) form.append('remoteip', check.remoteIp);

  let outcome: SiteverifyResponse;
  try {
    const response = await (check.fetcher ?? fetch)(SITEVERIFY_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`siteverify ${response.status}`);
    outcome = (await response.json()) as SiteverifyResponse;
  } catch {
    return enforce ? { ok: false, reason: 'unreachable' } : { ok: true, reason: 'unreachable' };
  }

  if (outcome.success !== true) {
    return { ok: false, reason: 'invalid', codes: outcome['error-codes'] ?? [] };
  }
  if (hostnames.length > 0 && !hostnames.includes((outcome.hostname ?? '').toLowerCase())) {
    return { ok: false, reason: 'hostname', codes: [outcome.hostname ?? ''] };
  }
  return { ok: true, reason: 'verified' };
}
