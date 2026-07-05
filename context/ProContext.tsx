import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, InteractionManager } from 'react-native';

import { useApp } from '~/context/AppContext';
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
import { perfMark } from '~/utils/perfDebug';

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

// Hold RevenueCat init until the cold-start tab-preload burst has settled, so
// its (auto) offerings/StoreKit-product fetch can't stall the launch sequence.
// Pro state defaults to false until this resolves, which is fine for the first
// couple of seconds after launch.
const REVENUECAT_INIT_DELAY_MS = 4000;

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
    perfMark('ProContext.refreshStatus: start');
    try {
      const nextState = await fetchRevenueCatCustomerState();
      applyCustomerState(nextState);
    } finally {
      setIsLoading(false);
      perfMark('ProContext.refreshStatus: end');
    }
  }, [applyCustomerState]);

  useEffect(() => {
    setRevenueCatAppUserId(appUserId);
    // `Purchases.configure` does synchronous StoreKit setup and then RevenueCat
    // *auto-prefetches offerings* — which on a cold cache issues a StoreKit
    // product request. On a simulator with no StoreKit config that request stalls
    // ~6s, and running it during the cold-start burst starves the tab-preload
    // chain (Sentry MONEY2TIME-8). Pro state isn't needed to paint the first
    // screens, so hold the whole init until after the launch preloads settle,
    // then still use the status-only refresh. `perfMark` traces when it fires.
    let task: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null;
    const timer = setTimeout(() => {
      perfMark('ProContext: init deferred timer fired');
      task = InteractionManager.runAfterInteractions(() => {
        void refreshStatus();
      });
    }, REVENUECAT_INIT_DELAY_MS);
    return () => {
      clearTimeout(timer);
      task?.cancel();
    };
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
