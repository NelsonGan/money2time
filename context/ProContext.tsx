import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useApp } from '~/context/AppContext';
import {
  fetchRevenueCatCustomerState,
  fetchRevenueCatOfferings,
  isRevenueCatCustomerStateActive,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  setRevenueCatAppUserId,
  type RevenueCatActionResult,
  type RevenueCatCustomerState,
  type RevenueCatOffering,
  type RevenueCatPackage,
} from '~/services/revenueCat';

interface ProContextValue {
  isPro: boolean;
  customerState: RevenueCatCustomerState | null;
  offering: RevenueCatOffering | null;
  purchasePackage: (packageIdentifier: string) => Promise<RevenueCatActionResult>;
  restorePurchases: () => Promise<RevenueCatActionResult>;
}

const ProContext = createContext<ProContextValue | null>(null);

export function ProProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useApp();
  const appUserId = settings.appUserId?.trim() ? settings.appUserId : null;
  const [isPro, setIsPro] = useState(false);
  const [customerState, setCustomerState] = useState<RevenueCatCustomerState | null>(null);
  const [offering, setOffering] = useState<RevenueCatOffering | null>(null);

  const checkProStatus = useCallback(async () => {
    const state = await fetchRevenueCatCustomerState();
    setCustomerState(state);
    setIsPro(isRevenueCatCustomerStateActive(state));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setRevenueCatAppUserId(appUserId);
      await checkProStatus();
      const fetchedOffering = await fetchRevenueCatOfferings();
      if (!cancelled) {
        setOffering(fetchedOffering);
      }
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [appUserId, checkProStatus]);

  const purchasePackage = useCallback(
    async (packageIdentifier: string): Promise<RevenueCatActionResult> => {
      const result = await purchaseRevenueCatPackage(packageIdentifier);
      if (result.status === 'success') {
        await checkProStatus();
      }
      return result;
    },
    [checkProStatus],
  );

  const restorePurchases = useCallback(async (): Promise<RevenueCatActionResult> => {
    const result = await restoreRevenueCatPurchases();
    if (result.status === 'success') {
      await checkProStatus();
    }
    return result;
  }, [checkProStatus]);

  const value = useMemo<ProContextValue>(
    () => ({
      isPro,
      customerState,
      offering,
      purchasePackage,
      restorePurchases,
    }),
    [isPro, customerState, offering, purchasePackage, restorePurchases],
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
      offering.packages.find((p) => p.packageType === type) ?? null;

    return {
      monthly: findPackage('MONTHLY'),
      annual: findPackage('ANNUAL'),
      lifetime: findPackage('LIFETIME'),
    };
  }, [offering]);
}
