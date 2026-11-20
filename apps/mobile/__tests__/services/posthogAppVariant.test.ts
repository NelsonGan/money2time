const mockPlatform = { OS: 'android' as string };
const mockUtils = { isRunningInTestLab: false as boolean | undefined };
let mockUtilsThrows = false;
const mockExtra: { appVariant?: string } = { appVariant: 'production' };

jest.mock('react-native', () => ({ Platform: mockPlatform }));
jest.mock('@react-native-firebase/app', () => ({
  getUtils: () => {
    if (mockUtilsThrows) throw new Error('native module missing');
    return mockUtils;
  },
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));
jest.mock('posthog-react-native', () => ({ PostHog: jest.fn() }));
jest.mock('~/constants/posthog', () => ({ POSTHOG_HOST: 'h', POSTHOG_PROJECT_TOKEN: 't' }));
jest.mock('~/services/analytics.shared', () => ({ POSTHOG_EVENT_NAMES: new Set() }));
jest.mock('~/services/errorReporting.shared', () => ({ beforeSendException: jest.fn() }));

import { getAppVariant } from '~/services/posthog.native';

describe('getAppVariant', () => {
  beforeEach(() => {
    mockPlatform.OS = 'android';
    mockUtils.isRunningInTestLab = false;
    mockUtilsThrows = false;
    mockExtra.appVariant = 'production';
  });

  it('reports the EAS build profile on a real device', () => {
    expect(getAppVariant()).toBe('production');
    mockExtra.appVariant = 'preview';
    expect(getAppVariant()).toBe('preview');
  });

  it('reports test_lab on a Google Play pre-launch (Firebase Test Lab) device', () => {
    mockUtils.isRunningInTestLab = true;
    expect(getAppVariant()).toBe('test_lab');
  });

  it('never asks Firebase on iOS', () => {
    mockPlatform.OS = 'ios';
    mockUtils.isRunningInTestLab = true;
    expect(getAppVariant()).toBe('production');
  });

  it('treats a failed check as a real device', () => {
    mockUtilsThrows = true;
    expect(getAppVariant()).toBe('production');
  });
});
