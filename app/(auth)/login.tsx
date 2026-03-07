import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { Link, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function LoginScreen() {
  const { login } = useAuth();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError("Please fill in all fields");
      return;
    }
    setIsLoading(true);
    setError("");
    try {
      await login(username.trim(), password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissAll();
    } catch (e: any) {
      setError(e.message?.replace(/^\d+: /, "") || "Login failed");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Ionicons name="car-sport" size={40} color={Colors.accent} />
          </View>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to report and track road hazards</Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={16} color={Colors.tier4} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="person-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor={Colors.textMuted}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={18} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8}>
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={18}
                  color={Colors.textMuted}
                />
              </Pressable>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={Colors.bg} />
            ) : (
              <Text style={styles.primaryBtnText}>Sign In</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <Link href="/(auth)/register" asChild>
            <Pressable>
              <Text style={styles.linkText}>Sign Up</Text>
            </Pressable>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, backgroundColor: Colors.bg },
  header: { alignItems: "center", marginTop: 32, marginBottom: 40, gap: 12 },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: Colors.bgElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontSize: 28, fontFamily: "Inter_700Bold", color: Colors.text },
  subtitle: { fontSize: 15, color: Colors.textSecondary, textAlign: "center", fontFamily: "Inter_400Regular" },
  form: { gap: 20 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#450a0a",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.tier4,
  },
  errorText: { color: Colors.tier4, fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  inputGroup: { gap: 8 },
  label: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.bgInput,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    gap: 10,
  },
  inputIcon: { marginRight: 2 },
  input: {
    flex: 1,
    height: 52,
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  primaryBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: Colors.bg, fontSize: 16, fontFamily: "Inter_700Bold" },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 32, gap: 6 },
  footerText: { color: Colors.textSecondary, fontSize: 15, fontFamily: "Inter_400Regular" },
  linkText: { color: Colors.accent, fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
