import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: Colors.bg },
        headerStyle: { backgroundColor: Colors.bgCard },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold", color: Colors.text },
      }}
    >
      <Stack.Screen name="login" options={{ title: "Sign In" }} />
      <Stack.Screen name="register" options={{ title: "Create Account" }} />
    </Stack>
  );
}
