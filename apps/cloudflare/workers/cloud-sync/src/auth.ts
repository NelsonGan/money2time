import { betterAuth } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';

import { signInCodeEmail } from './email';
import { csv, type Env } from './env';

// Better Auth on D1. The app never uses cookies: every sign-in returns a
// session token (bearer plugin) that the app keeps in the secure store and
// sends as `Authorization: Bearer …`.
//
// Sign-in methods, all without passwords:
// - Apple and Google: the app signs in natively and posts the ID token to
//   /api/auth/sign-in/social; Better Auth checks it against Apple's and
//   Google's keys and the audiences below. No redirect, no client secret.
// - Email: a 6-digit code (email-otp plugin), sent with Email Service.
//
// The same verified email address signing in with another method joins the
// existing user instead of creating a second one (account linking), so a
// person who used Google on one phone and Apple on the next still reaches one
// cloud copy. Apple's private-relay addresses cannot match, which is expected.

const OTP_TTL_SECONDS = 10 * 60;

let cached: { env: Env; auth: Auth } | null = null;

/** One Better Auth instance per isolate: `env` is the same object for every request in it. */
export function getAuth(env: Env): Auth {
  if (cached?.env !== env) cached = { env, auth: createAuth(env) };
  return cached.auth;
}

function createAuth(env: Env) {
  return betterAuth({
    appName: 'Money2Time',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    database: env.AUTH_DB,
    // The app's requests carry no Origin header; the checks below are for
    // browsers, which this Worker does not serve.
    trustedOrigins: ['money2time://'],
    advanced: {
      disableCSRFCheck: true,
      // Rate limits key on the real client address. Without this Better Auth
      // reads X-Forwarded-For, which a client can stuff to share one bucket.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    session: {
      // A phone stays signed in; each use within the update window extends it.
      expiresIn: 60 * 60 * 24 * 365,
      updateAge: 60 * 60 * 24 * 7,
    },
    // No Better Auth delete-user endpoint: DELETE /v1/account also removes the
    // Turso database and the images, which Better Auth alone would orphan.
    account: {
      // Links only when the provider vouches for the email (email_verified);
      // no provider is trusted blindly, so an unverified Google address
      // cannot take over an existing account.
      accountLinking: {
        enabled: true,
        trustedProviders: [],
      },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 30,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 10 },
      },
    },
    socialProviders: {
      google: {
        clientId: csv(env.GOOGLE_CLIENT_IDS),
        // Only ID-token sign-in is used, which needs no secret.
        clientSecret: '',
      },
      apple: {
        clientId: csv(env.APPLE_CLIENT_IDS),
        clientSecret: '',
        appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER,
        audience: csv(env.APPLE_CLIENT_IDS),
      },
    },
    plugins: [
      bearer(),
      emailOTP({
        otpLength: 6,
        expiresIn: OTP_TTL_SECONDS,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        async sendVerificationOTP({ email, otp, type }) {
          // Only sign-in codes exist here (index.ts refuses other requests);
          // never email a code for another purpose.
          if (type !== 'sign-in') return;
          await sendCodeEmail(env, email, otp);
        },
      }),
    ],
  });
}

type Auth = ReturnType<typeof createAuth>;

async function sendCodeEmail(env: Env, to: string, code: string): Promise<void> {
  if (!env.EMAIL) {
    // Local development only (`wrangler dev` with LOCAL_SYNC_URL): print the
    // code so it can be typed in. Anywhere else a code must never reach logs.
    if (!env.LOCAL_SYNC_URL) throw new Error('email_not_configured');
    console.log(`[cloud-sync] sign-in code for ${to}: ${code}`);
    return;
  }
  const { subject, text, html } = signInCodeEmail(code, Math.round(OTP_TTL_SECONDS / 60));
  await env.EMAIL.send({
    from: { email: env.EMAIL_FROM, name: 'Money2Time' },
    to,
    subject,
    text,
    html,
  });
}
