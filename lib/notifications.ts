import { Platform } from "react-native";
import Constants from "expo-constants";
import { getApiUrl, apiRequest } from "@/lib/query-client";

let notificationsModule: any = null;

async function getNotificationsModule() {
  if (notificationsModule) return notificationsModule;
  if (Platform.OS === "web") return null;
  try {
    notificationsModule = await import("expo-notifications");
    return notificationsModule;
  } catch {
    return null;
  }
}

export async function registerForPushNotifications(): Promise<string | null> {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") return null;

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      (Constants as any)?.easConfig?.projectId;

    if (!projectId) {
      if (__DEV__) {
        console.warn(
          "Push registration skipped: no EAS projectId found in app config."
        );
      }
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    await apiRequest("POST", new URL("/api/push-token", getApiUrl()).toString(), { pushToken: token });

    return token;
  } catch (err) {
    if (__DEV__) console.warn("Push notification registration failed:", err);
    return null;
  }
}

export async function setupNotificationHandler() {
  const Notifications = await getNotificationsModule();
  if (!Notifications) return;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}
