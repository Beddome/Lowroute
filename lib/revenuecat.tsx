import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases, {
  type PurchasesOfferings,
  type CustomerInfo,
  type PurchasesPackage,
} from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

const REVENUECAT_API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS,
  android: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID,
  default: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS,
});

export const ENTITLEMENT_ID = "Lowroute Pro";

let rcConfigured = false;
let rcInitError: string | null = null;

export function isRevenueCatConfigured() {
  return rcConfigured;
}

export function getRevenueCatInitError() {
  return rcInitError;
}

export function initializeRevenueCat() {
  if (!REVENUECAT_API_KEY) {
    rcInitError = "Subscription service not configured (missing API key).";
    if (__DEV__) console.warn("[RevenueCat] API key not found, skipping initialization");
    return;
  }

  try {
    try {
      if (Purchases.LOG_LEVEL?.WARN !== undefined) {
        Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
      }
    } catch (logErr) {
      if (__DEV__) console.warn("[RevenueCat] setLogLevel failed (non-fatal):", logErr);
    }
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    rcConfigured = true;
    rcInitError = null;
    if (__DEV__) console.log("[RevenueCat] configured");
  } catch (e: any) {
    rcInitError = e?.message ?? "Failed to initialize subscription service.";
    if (__DEV__) console.warn("[RevenueCat] initialization failed:", e);
    rcConfigured = false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function loginRevenueCat(appUserId: string) {
  if (!rcConfigured) return;
  try {
    await Purchases.logIn(appUserId);
    queryClient.invalidateQueries({ queryKey: ["revenuecat"] });
  } catch (e) {
    if (__DEV__) console.warn("RevenueCat logIn failed:", e);
  }
}

export async function logoutRevenueCat() {
  if (!rcConfigured) return;
  try {
    await Purchases.logOut();
    queryClient.invalidateQueries({ queryKey: ["revenuecat"] });
  } catch (e) {
    if (__DEV__) console.warn("RevenueCat logOut failed:", e);
  }
}

function useSubscriptionContext() {
  const customerInfoQuery = useQuery<CustomerInfo>({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: async () => {
      try {
        const info = await withTimeout(
          Purchases.getCustomerInfo(),
          12000,
          "getCustomerInfo"
        );
        return info;
      } catch (e) {
        if (__DEV__) console.warn("[RevenueCat] getCustomerInfo failed:", e);
        throw e;
      }
    },
    staleTime: 60 * 1000,
    retry: 1,
    enabled: rcConfigured,
  });

  const offeringsQuery = useQuery<PurchasesOfferings>({
    queryKey: ["revenuecat", "offerings"],
    queryFn: async () => {
      if (!rcConfigured) {
        throw new Error(rcInitError ?? "Subscription service not configured.");
      }
      try {
        const offerings = await withTimeout(
          Purchases.getOfferings(),
          12000,
          "getOfferings"
        );
        if (__DEV__) {
          const pkgCount = offerings?.current?.availablePackages?.length ?? 0;
          console.log(`[RevenueCat] offerings loaded (${pkgCount} packages)`);
        }
        return offerings;
      } catch (e) {
        if (__DEV__) console.warn("[RevenueCat] getOfferings failed:", e);
        throw e;
      }
    },
    staleTime: 300 * 1000,
    retry: 1,
    enabled: rcConfigured,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (packageToPurchase: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      return customerInfo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      return Purchases.restorePurchases();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["revenuecat", "customer-info"] });
    },
  });

  const isSubscribed =
    customerInfoQuery.data?.entitlements.active?.[ENTITLEMENT_ID] !== undefined;

  return {
    customerInfo: customerInfoQuery.data ?? null,
    offerings: offeringsQuery.data ?? null,
    isSubscribed,
    isLoading: customerInfoQuery.isLoading || offeringsQuery.isLoading,
    isOfferingsLoading: offeringsQuery.isLoading,
    offeringsError: offeringsQuery.error as Error | null,
    refetchOfferings: offeringsQuery.refetch,
    purchase: purchaseMutation.mutateAsync,
    restore: restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring: restoreMutation.isPending,
    purchaseError: purchaseMutation.error,
    isConfigured: rcConfigured,
    initError: rcInitError,
  };
}

type SubscriptionContextValue = ReturnType<typeof useSubscriptionContext>;
const Context = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const value = useSubscriptionContext();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSubscription() {
  const ctx = useContext(Context);
  if (!ctx) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return ctx;
}
