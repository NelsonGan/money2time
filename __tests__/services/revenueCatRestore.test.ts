import type { CustomerInfo } from 'react-native-purchases';

jest.mock('expo-constants', () => ({ executionEnvironment: 'standalone' }));
jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (values: Record<string, unknown>) => values.android,
  },
}));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    logIn: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    syncPurchasesForResult: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(),
  },
  PURCHASES_ERROR_CODE: {
    PURCHASE_CANCELLED_ERROR: '1',
    PRODUCT_ALREADY_PURCHASED_ERROR: '6',
  },
  INTRO_ELIGIBILITY_STATUS: {
    INTRO_ELIGIBILITY_STATUS_UNKNOWN: 0,
    INTRO_ELIGIBILITY_STATUS_INELIGIBLE: 1,
    INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2,
    INTRO_ELIGIBILITY_STATUS_NO_INTRO_OFFER_EXISTS: 3,
  },
  RECURRENCE_MODE: {
    INFINITE_RECURRING: 1,
    FINITE_RECURRING: 2,
    NON_RECURRING: 3,
  },
}));
jest.mock('~/services/errorReporting', () => ({ reportError: jest.fn() }));

function customerInfo(options: { active?: boolean; expirationDate?: string | null } = {}) {
  const entitlement = {
    productIdentifier: options.expirationDate ? 'pro_monthly' : 'pro_lifetime',
    originalPurchaseDate: '2026-01-01T00:00:00Z',
    latestPurchaseDate: '2026-01-01T00:00:00Z',
    expirationDate: options.expirationDate ?? null,
    isActive: options.active ?? true,
  };
  return {
    entitlements: {
      active: entitlement.isActive ? { pro: entitlement } : {},
      all: { pro: entitlement },
    },
    activeSubscriptions: [],
  } as unknown as CustomerInfo;
}

function emptyCustomerInfo() {
  return {
    entitlements: { active: {}, all: {} },
    activeSubscriptions: [],
  } as unknown as CustomerInfo;
}

function setup(platform = 'android') {
  jest.resetModules();
  const { Platform } = jest.requireMock('react-native');
  Platform.OS = platform;
  Platform.select = (values: Record<string, unknown>) => values[platform];
  const sdk = jest.requireMock('react-native-purchases').default;
  const reportError = jest.requireMock('~/services/errorReporting').reportError;
  const service = jest.requireActual<typeof import('~/services/revenueCat.native')>(
    '~/services/revenueCat.native',
  );
  sdk.restorePurchases.mockResolvedValue(customerInfo());
  sdk.syncPurchasesForResult.mockResolvedValue({ customerInfo: emptyCustomerInfo() });
  sdk.getCustomerInfo.mockResolvedValue(emptyCustomerInfo());
  service.setRevenueCatAppUserId('m2t_second_device');
  return { sdk, service, reportError };
}

const originalEnv = { ...process.env };
const originalDevDescriptor = Object.getOwnPropertyDescriptor(global, '__DEV__');
beforeEach(() => {
  process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY = 'goog_unit_test';
  process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY = 'appl_unit_test';
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID = 'pro';
  delete process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID;
  Object.assign(global, { __DEV__: false });
});
afterAll(() => {
  process.env = originalEnv;
  if (originalDevDescriptor) {
    Object.defineProperty(global, '__DEV__', originalDevDescriptor);
  } else {
    Reflect.deleteProperty(global, '__DEV__');
  }
});

describe('native Pro restore', () => {
  it('retries configuration after a synchronous SDK failure', async () => {
    const { sdk, service } = setup();
    sdk.configure.mockImplementationOnce(() => {
      throw new Error('Configuration failed');
    });
    expect((await service.restoreRevenueCatPurchases()).status).toBe('error');
    expect(sdk.restorePurchases).not.toHaveBeenCalled();
    expect((await service.restoreRevenueCatPurchases()).status).toBe('success');
    expect(sdk.configure).toHaveBeenCalledTimes(2);
  });

  it('configures once when startup and restore run concurrently', async () => {
    const { sdk, service } = setup();
    await Promise.all([
      service.fetchRevenueCatCustomerState(),
      service.restoreRevenueCatPurchases(),
    ]);
    expect(sdk.configure).toHaveBeenCalledTimes(1);
    expect(sdk.logIn).not.toHaveBeenCalled();
  });

  it('finishes switching identity before restoring if settings change during login', async () => {
    const { sdk, service } = setup();
    await service.fetchRevenueCatCustomerState();
    service.setRevenueCatAppUserId('m2t_intermediate');
    let finishLogin!: () => void;
    let startedLogin!: () => void;
    const loginStarted = new Promise<void>((resolve) => {
      startedLogin = resolve;
    });
    sdk.logIn.mockImplementationOnce(() => {
      startedLogin();
      return new Promise<void>((resolve) => {
        finishLogin = resolve;
      });
    });
    const restore = service.restoreRevenueCatPurchases();
    await loginStarted;
    service.setRevenueCatAppUserId('m2t_final');
    finishLogin();
    await restore;
    expect(sdk.logIn.mock.calls).toEqual([['m2t_intermediate'], ['m2t_final']]);
    expect(sdk.logIn.mock.invocationCallOrder[1]).toBeLessThan(
      sdk.restorePurchases.mock.invocationCallOrder[0],
    );
  });

  it('does not start duplicate logins when a refresh overlaps a restore', async () => {
    const { sdk, service } = setup();
    await service.fetchRevenueCatCustomerState();
    service.setRevenueCatAppUserId('m2t_changed');
    await Promise.all([
      service.fetchRevenueCatCustomerState(),
      service.restoreRevenueCatPurchases(),
    ]);
    expect(sdk.logIn).toHaveBeenCalledTimes(1);
  });

  it('waits for an in-flight login even when settings switch back to the original ID', async () => {
    const { sdk, service } = setup();
    await service.fetchRevenueCatCustomerState();
    service.setRevenueCatAppUserId('m2t_intermediate');
    let finishLogin!: () => void;
    let startedLogin!: () => void;
    const loginStarted = new Promise<void>((resolve) => {
      startedLogin = resolve;
    });
    sdk.logIn.mockImplementationOnce(() => {
      startedLogin();
      return new Promise<void>((resolve) => {
        finishLogin = resolve;
      });
    });
    const refresh = service.fetchRevenueCatCustomerState();
    await loginStarted;
    service.setRevenueCatAppUserId('m2t_second_device');
    const restore = service.restoreRevenueCatPurchases();
    // Let the configured SDK path run up to its login wait.
    await Promise.resolve();
    await Promise.resolve();
    expect(sdk.restorePurchases).not.toHaveBeenCalled();
    finishLogin();
    await Promise.all([refresh, restore]);
    expect(sdk.logIn.mock.calls).toEqual([['m2t_intermediate'], ['m2t_second_device']]);
  });

  it('can retry a failed identity switch', async () => {
    const { sdk, service } = setup();
    await service.fetchRevenueCatCustomerState();
    service.setRevenueCatAppUserId('m2t_changed');
    sdk.logIn.mockRejectedValueOnce(new Error('Login offline'));
    expect((await service.restoreRevenueCatPurchases()).status).toBe('error');
    expect(sdk.restorePurchases).not.toHaveBeenCalled();
    expect((await service.restoreRevenueCatPurchases()).status).toBe('success');
    expect(sdk.logIn).toHaveBeenCalledTimes(2);
  });

  it('does not contact the SDK when the Android build is missing its API key', async () => {
    const { sdk, service } = setup();
    delete process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
    expect((await service.restoreRevenueCatPurchases()).status).toBe('not_available');
    expect(sdk.configure).not.toHaveBeenCalled();
    expect(sdk.restorePurchases).not.toHaveBeenCalled();
  });

  it.each(['android', 'ios'])('restores lifetime on a new %s installation', async (platform) => {
    const { sdk, service } = setup(platform);
    const result = await service.restoreRevenueCatPurchases();
    expect(sdk.configure).toHaveBeenCalledWith({
      apiKey: platform === 'android' ? 'goog_unit_test' : 'appl_unit_test',
      appUserID: 'm2t_second_device',
    });
    expect(result.status).toBe('success');
    expect(service.isRevenueCatCustomerStateActive(result.customerState)).toBe(true);
    expect(sdk.restorePurchases).toHaveBeenCalledTimes(1);
    // Background sync uses a different isRestore policy for identified users.
    // The button must always perform the explicit store restore.
    expect(sdk.syncPurchasesForResult).not.toHaveBeenCalled();
  });

  it('does not skip explicit restore when sync would return cached Pro', async () => {
    const { sdk, service } = setup();
    sdk.syncPurchasesForResult.mockResolvedValue({ customerInfo: customerInfo() });
    sdk.restorePurchases.mockResolvedValue(emptyCustomerInfo());
    const result = await service.restoreRevenueCatPurchases();
    expect(service.isRevenueCatCustomerStateActive(result.customerState)).toBe(false);
    expect(sdk.restorePurchases).toHaveBeenCalledTimes(1);
  });

  it('restores an active subscription', async () => {
    const { sdk, service } = setup();
    sdk.restorePurchases.mockResolvedValue(
      customerInfo({ expirationDate: '2099-01-01T00:00:00Z' }),
    );
    const result = await service.restoreRevenueCatPurchases();
    expect(service.isRevenueCatCustomerStateSubscriber(result.customerState)).toBe(true);
  });

  it.each([null, '2099-01-01T00:00:00Z', '2020-01-01T00:00:00Z'])(
    'does not unlock an inactive historical entitlement with expiry %s',
    async (expirationDate) => {
      const { sdk, service } = setup();
      sdk.restorePurchases.mockResolvedValue(customerInfo({ active: false, expirationDate }));
      const result = await service.restoreRevenueCatPurchases();
      expect(service.isRevenueCatCustomerStateActive(result.customerState)).toBe(false);
    },
  );

  it('leaves Pro locked when Play returns no recoverable purchase', async () => {
    const { sdk, service } = setup();
    sdk.restorePurchases.mockResolvedValue(emptyCustomerInfo());
    const result = await service.restoreRevenueCatPurchases();
    expect(result.status).toBe('success');
    expect(service.isRevenueCatCustomerStateActive(result.customerState)).toBe(false);
  });

  it.each(['Network unavailable', 'Purchase belongs to another app user'])(
    'returns and reports restore failures: %s',
    async (message) => {
      const { sdk, service, reportError } = setup();
      const error = Object.assign(new Error(message), { code: '7' });
      sdk.restorePurchases.mockRejectedValue(error);
      expect(await service.restoreRevenueCatPurchases()).toEqual({
        status: 'error',
        message,
        customerState: null,
      });
      expect(reportError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          context: 'revenueCat.restore',
          platform: 'android',
        }),
      );
    },
  );

  it('preserves a cancellation without reporting a failure', async () => {
    const { sdk, service, reportError } = setup('ios');
    sdk.restorePurchases.mockRejectedValue({ code: '1', userCancelled: true });
    expect((await service.restoreRevenueCatPurchases()).status).toBe('cancelled');
    expect(reportError).not.toHaveBeenCalled();
  });

  it('recovers an already-owned purchase through the same restore path', async () => {
    const { sdk, service } = setup();
    sdk.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [{ identifier: 'lifetime' }],
      },
    });
    sdk.purchasePackage.mockRejectedValue({ code: '6', message: 'Already owned' });
    const result = await service.purchaseRevenueCatPackage('lifetime');
    expect(result.status).toBe('success');
    expect(service.isRevenueCatCustomerStateActive(result.customerState)).toBe(true);
    expect(sdk.restorePurchases).toHaveBeenCalledTimes(1);
  });

  it('surfaces the restore error after an already-owned purchase', async () => {
    const { sdk, service } = setup();
    sdk.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [{ identifier: 'lifetime' }],
      },
    });
    sdk.purchasePackage.mockRejectedValue({ code: '6', message: 'Already owned' });
    sdk.restorePurchases.mockRejectedValue(new Error('Transfer blocked'));
    expect((await service.purchaseRevenueCatPackage('lifetime')).message).toBe('Transfer blocked');
  });
});

describe('native Pro offering trials', () => {
  function storePackage(options: {
    introPrice?: Record<string, unknown> | null;
    defaultOption?: Record<string, unknown> | null;
  }) {
    return {
      identifier: 'annual',
      packageType: 'ANNUAL',
      product: {
        identifier: 'money2time_pro_annual',
        priceString: '$24.99',
        pricePerMonthString: '$2.08',
        price: 24.99,
        currencyCode: 'USD',
        subscriptionPeriod: 'P1Y',
        introPrice: options.introPrice ?? null,
        defaultOption: options.defaultOption ?? null,
      },
    };
  }

  it('exposes an eligible zero-price iOS introductory period as a free trial', async () => {
    const { sdk, service } = setup('ios');
    sdk.getOfferings.mockResolvedValue({
      current: {
        identifier: 'default',
        availablePackages: [
          storePackage({
            introPrice: {
              price: 0,
              period: 'P1W',
              periodUnit: 'WEEK',
              periodNumberOfUnits: 1,
              cycles: 1,
            },
          }),
        ],
      },
      all: {},
    });
    sdk.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      money2time_pro_annual: { status: 2, description: 'eligible' },
    });

    const offering = await service.fetchRevenueCatOfferings();

    expect(sdk.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledWith([
      'money2time_pro_annual',
    ]);
    expect(offering?.packages[0]?.freeTrial).toEqual({
      durationIso8601: 'P1W',
      durationCount: 1,
      durationUnit: 'week',
    });
  });

  it.each([0, 1, 3])(
    'does not advertise an iOS introductory period with eligibility status %s',
    async (status) => {
      const { sdk, service } = setup('ios');
      sdk.getOfferings.mockResolvedValue({
        current: {
          identifier: 'default',
          availablePackages: [
            storePackage({
              introPrice: {
                price: 0,
                period: 'P1M',
                periodUnit: 'MONTH',
                periodNumberOfUnits: 1,
                cycles: 1,
              },
            }),
          ],
        },
        all: {},
      });
      sdk.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
        money2time_pro_annual: { status, description: 'not eligible' },
      });

      expect((await service.fetchRevenueCatOfferings())?.packages[0]?.freeTrial).toBeNull();
    },
  );

  it('keeps the offering but suppresses iOS trial copy when eligibility lookup fails', async () => {
    const { sdk, service } = setup('ios');
    sdk.getOfferings.mockResolvedValue({
      current: {
        identifier: 'default',
        availablePackages: [
          storePackage({
            introPrice: {
              price: 0,
              period: 'P3D',
              periodUnit: 'DAY',
              periodNumberOfUnits: 3,
              cycles: 1,
            },
          }),
        ],
      },
      all: {},
    });
    sdk.checkTrialOrIntroductoryPriceEligibility.mockRejectedValue(new Error('offline'));

    const offering = await service.fetchRevenueCatOfferings();

    expect(offering?.packages).toHaveLength(1);
    expect(offering?.packages[0]?.freeTrial).toBeNull();
  });

  it('uses the eligible Android default option free phase and includes every billing cycle', async () => {
    const { sdk, service } = setup('android');
    sdk.getOfferings.mockResolvedValue({
      current: {
        identifier: 'default',
        availablePackages: [
          storePackage({
            defaultOption: {
              freePhase: {
                billingPeriod: { iso8601: 'P1W', unit: 'WEEK', value: 1 },
                billingCycleCount: 2,
                price: { amountMicros: 0 },
                offerPaymentMode: 'FREE_TRIAL',
              },
            },
          }),
        ],
      },
      all: {},
    });

    const offering = await service.fetchRevenueCatOfferings();

    expect(sdk.checkTrialOrIntroductoryPriceEligibility).not.toHaveBeenCalled();
    expect(offering?.packages[0]?.freeTrial).toEqual({
      durationIso8601: 'P2W',
      durationCount: 2,
      durationUnit: 'week',
    });
  });

  it.each([
    [1, null],
    [3, 'P1W'],
  ] as const)(
    'handles a null Android cycle count with recurrence mode %s',
    async (recurrenceMode, expectedIso) => {
      const { sdk, service } = setup('android');
      sdk.getOfferings.mockResolvedValue({
        current: {
          identifier: 'default',
          availablePackages: [
            storePackage({
              defaultOption: {
                freePhase: {
                  billingPeriod: { iso8601: 'P1W', unit: 'WEEK', value: 1 },
                  billingCycleCount: null,
                  recurrenceMode,
                  price: { amountMicros: 0 },
                },
              },
            }),
          ],
        },
        all: {},
      });

      expect(
        (await service.fetchRevenueCatOfferings())?.packages[0]?.freeTrial?.durationIso8601 ?? null,
      ).toBe(expectedIso);
    },
  );

  it('does not advertise simple renewal terms for a mixed Android free-and-paid intro offer', async () => {
    const { sdk, service } = setup('android');
    sdk.getOfferings.mockResolvedValue({
      current: {
        identifier: 'default',
        availablePackages: [
          storePackage({
            defaultOption: {
              freePhase: {
                billingPeriod: { iso8601: 'P1W', unit: 'WEEK', value: 1 },
                billingCycleCount: 1,
                price: { amountMicros: 0 },
              },
              introPhase: {
                billingPeriod: { iso8601: 'P1M', unit: 'MONTH', value: 1 },
                billingCycleCount: 1,
                price: { amountMicros: 1000000 },
              },
            },
          }),
        ],
      },
      all: {},
    });

    expect((await service.fetchRevenueCatOfferings())?.packages[0]?.freeTrial).toBeNull();
  });

  it('suppresses a trial when the store period disagrees with its unit/count metadata', async () => {
    const { sdk, service } = setup('ios');
    sdk.getOfferings.mockResolvedValue({
      current: {
        identifier: 'default',
        availablePackages: [
          storePackage({
            introPrice: {
              price: 0,
              period: 'P1W',
              periodUnit: 'MONTH',
              periodNumberOfUnits: 1,
              cycles: 1,
            },
          }),
        ],
      },
      all: {},
    });
    sdk.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      money2time_pro_annual: { status: 2, description: 'eligible' },
    });

    expect((await service.fetchRevenueCatOfferings())?.packages[0]?.freeTrial).toBeNull();
  });

  it('does not describe a paid introductory phase or unknown unit as a free trial', async () => {
    const { sdk, service } = setup('android');
    sdk.getOfferings.mockResolvedValue({
      current: {
        identifier: 'default',
        availablePackages: [
          storePackage({
            defaultOption: {
              freePhase: {
                billingPeriod: { iso8601: 'PT12H', unit: 'UNKNOWN', value: 12 },
                billingCycleCount: 1,
                price: { amountMicros: 1000 },
                offerPaymentMode: 'SINGLE_PAYMENT',
              },
            },
          }),
        ],
      },
      all: {},
    });

    expect((await service.fetchRevenueCatOfferings())?.packages[0]?.freeTrial).toBeNull();
  });
});
