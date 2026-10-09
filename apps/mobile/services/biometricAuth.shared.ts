/**
 * Cross-platform biometric / device-credential authentication surface.
 *
 * The real implementation lives in `biometricAuth.native.ts` and wraps
 * `expo-local-authentication`. Web and the test (node) environment get the
 * no-op shims below, so importing from `~/services/biometricAuth` is safe on
 * any platform.
 */

export interface BiometricAvailability {
  /** Device has biometric/credential hardware and at least one credential enrolled. */
  available: boolean;
  /** Hardware exists but no biometric is enrolled (user can enable it in OS settings). */
  hardwareWithoutEnrollment: boolean;
}

// Default no-op implementations — overridden by the .native.ts module on iOS/Android.
export const getBiometricAvailability = async (): Promise<BiometricAvailability> => ({
  available: false,
  hardwareWithoutEnrollment: false,
});

/** Human-readable name of the primary biometric ("Face ID", "Touch ID", "Fingerprint"…). */
export const getBiometricLabel = async (): Promise<string> => 'Biometrics';

/** Prompts the OS biometric/credential sheet. Resolves true only on success. */
export const authenticateWithBiometrics = async (_promptMessage?: string): Promise<boolean> =>
  false;
