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
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { LocationProvider } from "@/contexts/LocationContext";
import { Colors } from "@/constants/colors";

SplashScreen.preventAutoHideAsync();

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
          presentation: "formSheet",
          sheetAllowedDetents: [0.85],
          sheetGrabberVisible: true,
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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <AuthProvider>
              <LocationProvider>
                <RootLayoutNav />
              </LocationProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
