// Better Auth for Cloud Backup: Google and passwordless email (a six-digit
// code rather than a link, which a phone can type without leaving the app).
// One instance per request, because its database and email bindings come from
// the request's `env`.

import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { emailOTP } from 'better-auth/plugins';

import { signInCodeEmail } from './email';
import type { Env } from './env';
import { deleteUserData } from './store';

export function allowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createAuth(env: Env) {
  const googleClientIds = env.GOOGLE_CLIENT_IDS.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const localhost = env.BETTER_AUTH_URL.startsWith('http://localhost');

  return betterAuth({
    appName: 'Money2Time',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: env.MONEY2TIME_D1_CLOUD_BACKUP,
    trustedOrigins: [...allowedOrigins(env), `${env.APP_SCHEME}://`],
    // Codes and sign-in attempts are counted in D1, so the limit holds across
    // isolates rather than per isolate.
    rateLimit: { enabled: true, storage: 'database' },
    session: {
      expiresIn: 60 * 60 * 24 * 60,
      updateAge: 60 * 60 * 24,
    },
    user: {
      deleteUser: {
        enabled: true,
        // The backup goes with the account: R2 object and metadata both.
        beforeDelete: async (user) => {
          await deleteUserData(env, user.id);
        },
      },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ['google', 'email-otp'] },
    },
    advanced: {
      // The Worker and app.money2time.com are siblings under money2time.com;
      // a parent-domain cookie is first party to both.
      crossSubDomainCookies: localhost ? { enabled: false } : { enabled: true, domain: env.COOKIE_DOMAIN },
      useSecureCookies: !localhost,
      // Cloudflare puts the visitor's address here; rate limits key on it.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    socialProviders:
      googleClientIds.length && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              // Web client first; the iOS and Android clients are accepted as
              // ID-token audiences for native sign-in.
              clientId: googleClientIds,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              prompt: 'select_account',
            },
          }
        : {},
    plugins: [
      expo(),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        sendVerificationOTP: async ({ email, otp, type }) => {
          if (type !== 'sign-in' && type !== 'email-verification') return;
          const message = signInCodeEmail(otp);
          await env.EMAIL.send({
            from: { email: env.EMAIL_FROM, name: 'Money2Time' },
            to: email,
            subject: message.subject,
            text: message.text,
            html: message.html,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
