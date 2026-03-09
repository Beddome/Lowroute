import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useState, useCallback } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { UnitsProvider } from "@/contexts/UnitsContext";
import { Colors } from "@/constants/colors";
import OfflineBanner from "@/components/OfflineBanner";
import DisclaimerScreen from "@/app/disclaimer";
import { registerForPushNotifications, setupNotificationHandler } from "@/lib/notifications";
import { initializeRevenueCat, SubscriptionProvider } from "@/lib/revenuecat";

const DISCLAIMER_KEY = "lowroute_disclaimer_accepted";

SplashScreen.preventAutoHideAsync();
initializeRevenueCat();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: "Back", contentStyle: { backgroundColor: Colors.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="(auth)"
        options={{
          presentation: "modal",
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="report"
        options={{
          presentation: "fullScreenModal",
          gestureEnabled: false,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="hazard/[id]"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.75],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="paywall"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.9],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      />
      <Stack.Screen
        name="car-profile"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.85],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="event-detail"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.75],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="create-event"
        options={{
          presentation: "fullScreenModal",
          gestureEnabled: false,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="listing-detail"
        options={{
          presentation: "modal",
          gestureEnabled: false,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="create-listing"
        options={{
          presentation: "modal",
          gestureEnabled: false,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="friends"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.85],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bgCard },
        }}
      />
      <Stack.Screen
        name="conversation"
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      />
      <Stack.Screen
        name="new-chat"
        options={{
          presentation: "modal",
          gestureEnabled: false,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      />
      <Stack.Screen
        name="change-password"
        options={{
          presentation: "modal",
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      />
      <Stack.Screen
        name="privacy-policy"
        options={{
          presentation: "modal",
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      />
      <Stack.Screen
        name="terms-of-service"
        options={{
          presentation: "modal",
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      />
      <Stack.Screen
        name="manage-subscription"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.7],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: Colors.bg },
        }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [disclaimerAccepted, setDisclaimerAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(DISCLAIMER_KEY).then((val) => {
      setDisclaimerAccepted(val === "true");
    }).catch(() => setDisclaimerAccepted(false));
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && disclaimerAccepted !== null) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, disclaimerAccepted]);

  useEffect(() => {
    if (disclaimerAccepted) {
      setupNotificationHandler();
    }
  }, [disclaimerAccepted]);

  const handleAcceptDisclaimer = useCallback(() => {
    setDisclaimerAccepted(true);
    AsyncStorage.setItem(DISCLAIMER_KEY, "true").catch(() => {});
  }, []);

  if (!fontsLoaded && !fontError) return null;
  if (disclaimerAccepted === null) return null;

  if (!disclaimerAccepted) {
    return (
      <ErrorBoundary>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <DisclaimerScreen onAccept={handleAcceptDisclaimer} />
        </GestureHandlerRootView>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AuthProvider>
              <SubscriptionProvider>
                <UnitsProvider>
                  <LocationProvider>
                    <OfflineBanner />
                    <RootLayoutNav />
                  </LocationProvider>
                </UnitsProvider>
              </SubscriptionProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
