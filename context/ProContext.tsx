import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, InteractionManager } from 'react-native';

import { useApp } from '~/context/AppContext';
import {
  buildProAnalyticsProfile,
  identifyUser,
  setSuperProperties,
  setUserProperties,
} from '~/services/analytics';
import { reportError } from '~/services/errorReporting';
import {
  fetchRevenueCatCustomerState,
  fetchRevenueCatOfferings,
  isRevenueCatCustomerStateActive,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  setRevenueCatAppUserId,
  subscribeToRevenueCatCustomerStateUpdates,
  type RevenueCatActionResult,
  type RevenueCatCustomerState,
  type RevenueCatOffering,
  type RevenueCatPackage,
} from '~/services/revenueCat';

interface ProContextValue {
  isPro: boolean;
  isLoading: boolean;
  customerState: RevenueCatCustomerState | null;
  offering: RevenueCatOffering | null;
  purchasePackage: (packageIdentifier: string) => Promise<RevenueCatActionResult>;
  restorePurchases: () => Promise<RevenueCatActionResult>;
  refresh: () => Promise<void>;
  /** Dev-only override of Pro status. `null` means use the real RevenueCat state. No-op outside __DEV__. */
  devProOverride: boolean | null;
  setDevProOverride: (value: boolean | null) => void;
}

const ProContext = createContext<ProContextValue | null>(null);

export function ProProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const appUserId = settings.appUserId?.trim() ? settings.appUserId : null;
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [devProOverride, setDevProOverrideState] = useState<boolean | null>(null);
  const setDevProOverride = useCallback((value: boolean | null) => {
    if (!__DEV__) return;
    setDevProOverrideState(value);
  }, []);
  const [customerState, setCustomerState] = useState<RevenueCatCustomerState | null>(null);
  const [offering, setOffering] = useState<RevenueCatOffering | null>(null);

  const applyCustomerState = useCallback((state: RevenueCatCustomerState | null) => {
    setCustomerState(state);
    setIsPro(isRevenueCatCustomerStateActive(state));
  }, []);

  // Full refresh: subscription status AND the offering catalogue. Only needed
  // where prices are shown (the paywall), because fetching offerings triggers a
  // StoreKit product request that can block for several seconds on its first,
  // uncached call (measured ~6.9s on a cold-started simulator) — see refreshStatus.
  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [nextState, nextOffering] = await Promise.all([
        fetchRevenueCatCustomerState(),
        fetchRevenueCatOfferings(),
      ]);

      applyCustomerState(nextState);
      setOffering(nextOffering);
    } finally {
      setIsLoading(false);
    }
  }, [applyCustomerState]);

  // Status-only refresh: resolves whether Pro is active without touching the
  // offering catalogue. `getCustomerInfo` is fast (~200ms) while `getOfferings`
  // blocks on a StoreKit product fetch. This is what runs on the cold-start and
  // resume paths, where we only need `isPro` and must not stall the launch. The
  // paywall (ProPaywallScreen) calls the full `refresh()` itself, with a loading
  // state, so prices load lazily the first time it opens.
  const refreshStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextState = await fetchRevenueCatCustomerState();
      applyCustomerState(nextState);
    } finally {
      setIsLoading(false);
    }
  }, [applyCustomerState]);

  useEffect(() => {
    setRevenueCatAppUserId(appUserId);
    // `Purchases.configure` does synchronous StoreKit setup on the main thread
    // (Sentry MONEY2TIME-8), so defer past first interactions — Pro state isn't
    // needed to paint the first screen. Use the status-only refresh so we skip
    // the offerings/StoreKit-product fetch (needed only on the paywall).
    const task = InteractionManager.runAfterInteractions(() => {
      void refreshStatus();
    });
    return () => task.cancel();
  }, [appUserId, refreshStatus]);

  useEffect(() => {
    const unsubscribe = subscribeToRevenueCatCustomerStateUpdates((nextState) => {
      applyCustomerState(nextState);
    });

    return unsubscribe;
  }, [applyCustomerState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        // Re-check Pro status on resume, but skip offerings — they rarely change
        // and re-fetching them would re-introduce the StoreKit stall on resume.
        void refreshStatus();
      }
    });

    return () => subscription.remove();
  }, [refreshStatus]);

  useEffect(() => {
    if (!customerState?.activeProductIdentifier || !customerState.expirationDate) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const syncExpiration = () => {
      const msUntilExpiration = new Date(customerState.expirationDate!).getTime() - Date.now();

      if (msUntilExpiration <= 0) {
        setIsPro(false);
        void refreshStatus();
        return;
      }

      timeoutId = setTimeout(
        () => {
          const stillActive = isRevenueCatCustomerStateActive(customerState);
          setIsPro(stillActive);

          if (stillActive) {
            syncExpiration();
          } else {
            void refreshStatus();
          }
        },
        Math.min(msUntilExpiration, 60 * 60 * 1000),
      );
    };

    syncExpiration();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [customerState, refreshStatus]);

  // Mirror Pro state onto the Mixpanel profile (People) and super-properties, so
  // "is this user Pro" is answerable both per-user and per-event.
  //
  // Three things this effect has to get right:
  //
  //  * It reads the raw `isPro`, never `effectiveIsPro` — the __DEV__ override
  //    exists to exercise gated UI locally and must never reach analytics.
  //  * It waits out `isLoading`. Pro starts false and resolves asynchronously,
  //    so writing eagerly would downgrade every returning subscriber to free for
  //    the first few hundred ms of each launch, and Mixpanel would keep the last
  //    write of whichever race won.
  //  * It compares a signature rather than the state object. `refreshStatus`
  //    runs on every foreground and hands back a fresh object each time, so
  //    without this the app would POST an identical profile on every resume.
  //    The signature is scoped to the identity it was written for, so a change
  //    of appUserId re-sends rather than reading as already-sent.
  const proProfileSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || !appUserId) return;

    const profile = buildProAnalyticsProfile({ isPro, ...customerState });
    const signature = `${appUserId}:${profile.signature}`;
    if (signature === proProfileSignatureRef.current) return;
    proProfileSignatureRef.current = signature;

    void (async () => {
      // People updates are attributed to whoever is identified at the time, and
      // effects in this provider run *before* the AppContext effect that calls
      // identify (React commits children first). Identifying here is a cheap
      // no-op once it has already happened, and removes that ordering hazard.
      await identifyUser(appUserId);
      await setUserProperties(profile.userProperties);
      await setSuperProperties(profile.superProperties);
    })().catch((error: unknown) => {
      // Nothing awaits this, so an SDK throw would surface as a global
      // unhandled rejection rather than a scoped report. Drop the signature
      // too: a failed write must not be remembered as sent, or the profile
      // stays wrong until the user's Pro state happens to change again.
      proProfileSignatureRef.current = null;
      reportError(error, { scope: 'analytics_pro_profile' });
    });
  }, [appUserId, customerState, isLoading, isPro]);

  const purchasePackage = useCallback(
    async (packageIdentifier: string): Promise<RevenueCatActionResult> => {
      const result = await purchaseRevenueCatPackage(packageIdentifier);

      if (result.customerState) {
        applyCustomerState(result.customerState);
      }

      if (result.status === 'success' || result.status === 'pending') {
        void refresh();
      }

      return result;
    },
    [applyCustomerState, refresh],
  );

  const restorePurchases = useCallback(async (): Promise<RevenueCatActionResult> => {
    const result = await restoreRevenueCatPurchases();

    if (result.customerState) {
      applyCustomerState(result.customerState);
    }

    if (result.status === 'success') {
      void refresh();
    }

    return result;
  }, [applyCustomerState, refresh]);

  const effectiveIsPro = __DEV__ && devProOverride !== null ? devProOverride : isPro;
  const value = useMemo<ProContextValue>(
    () => ({
      isPro: effectiveIsPro,
      isLoading,
      customerState,
      offering,
      purchasePackage,
      restorePurchases,
      refresh,
      devProOverride,
      setDevProOverride,
    }),
    [
      effectiveIsPro,
      isLoading,
      customerState,
      offering,
      purchasePackage,
      refresh,
      restorePurchases,
      devProOverride,
      setDevProOverride,
    ],
  );

  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro() {
  const context = useContext(ProContext);
  if (!context) {
    throw new Error('usePro must be used within ProProvider');
  }
  return context;
}

export function usePackagesByType(offering: RevenueCatOffering | null) {
  return useMemo(() => {
    if (!offering) return { monthly: null, annual: null, lifetime: null };

    const findPackage = (type: string): RevenueCatPackage | null =>
      offering.packages.find((p) => p.packageType.toUpperCase() === type) ?? null;

    return {
      monthly: findPackage('MONTHLY'),
      annual: findPackage('ANNUAL'),
      lifetime: findPackage('LIFETIME'),
    };
  }, [offering]);
}
