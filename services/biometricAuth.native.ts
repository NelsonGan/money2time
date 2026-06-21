/**
 * Native (iOS + Android) biometric / device-credential authentication, wrapping
 * `expo-local-authentication`. The shared no-op shims (`biometricAuth.shared`)
 * back this surface on web and in tests.
 */
import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import type { BiometricAvailability } from './biometricAuth.shared';

export type { BiometricAvailability } from './biometricAuth.shared';

export const getBiometricAvailability = async (): Promise<BiometricAvailability> => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      return { available: false, hardwareWithoutEnrollment: false };
    }
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return { available: isEnrolled, hardwareWithoutEnrollment: !isEnrolled };
  } catch {
    return { available: false, hardwareWithoutEnrollment: false };
  }
};

export const getBiometricLabel = async (): Promise<string> => {
  const isIOS = Platform.OS === 'ios';
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return isIOS ? 'Face ID' : 'Face Unlock';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      // Apple brands fingerprint auth "Touch ID"; Android calls it "Fingerprint".
      return isIOS ? 'Touch ID' : 'Fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
  } catch {
    // Fall through to the generic label.
  }
  return 'Biometrics';
};

export const authenticateWithBiometrics = async (promptMessage?: string): Promise<boolean> => {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage ?? 'Unlock Money2Time',
      // Allow the device passcode/pattern as a fallback so users are never
      // permanently locked out if biometrics fail.
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
};
