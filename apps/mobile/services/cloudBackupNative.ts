/**
 * The Better Auth client for Cloud Backup. Kept in its own module and only
 * ever reached through a dynamic import from `cloudBackup.native.ts`: it pulls
 * in expo-secure-store, expo-web-browser and expo-linking, native modules a
 * dev client built before Cloud Backup does not have. Loading it lazily keeps
 * such a build working; Cloud Backup just reads as unavailable there.
 */

import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

import { cloudBackupBaseUrl } from './cloudBackup.shared';

export const cloudAuthClient = createAuthClient({
  baseURL: cloudBackupBaseUrl(),
  plugins: [
    expoClient({ scheme: 'money2time', storagePrefix: 'money2time_cloud', storage: SecureStore }),
    emailOTPClient(),
  ],
});

export const secureStore = SecureStore;
