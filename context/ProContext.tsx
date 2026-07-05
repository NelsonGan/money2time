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

  useEffect(() => {
    setRevenueCatAppUserId(appUserId);
    // RevenueCat's native `Purchases.configure` (triggered lazily by `refresh`)
    // does synchronous StoreKit setup on the main thread. Firing it during the
    // cold-start burst has produced multi-second main-thread App Hangs on
    // constrained devices (Sentry MONEY2TIME-8). Defer past first interactions
    // so it no longer competes with initial render/layout — Pro state is not
    // needed to paint the first screen.
    const task = InteractionManager.runAfterInteractions(() => {
      void refresh();
    });
    return () => task.cancel();
  }, [appUserId, refresh]);

  useEffect(() => {
    const unsubscribe = subscribeToRevenueCatCustomerStateUpdates((nextState) => {
      applyCustomerState(nextState);
    });

    return unsubscribe;
  }, [applyCustomerState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refresh();
      }
    });

    return () => subscription.remove();
  }, [refresh]);

  useEffect(() => {
    if (!customerState?.activeProductIdentifier || !customerState.expirationDate) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const syncExpiration = () => {
      const msUntilExpiration = new Date(customerState.expirationDate!).getTime() - Date.now();

      if (msUntilExpiration <= 0) {
        setIsPro(false);
        void refresh();
        return;
      }

      timeoutId = setTimeout(
        () => {
          const stillActive = isRevenueCatCustomerStateActive(customerState);
          setIsPro(stillActive);

          if (stillActive) {
            syncExpiration();
          } else {
            void refresh();
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
  }, [customerState, refresh]);

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
