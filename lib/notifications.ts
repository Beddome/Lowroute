import { Platform } from "react-native";
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

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: undefined,
    });
    const token = tokenData.data;

    await apiRequest("POST", new URL("/api/push-token", getApiUrl()).toString(), { pushToken: token });

    return token;
  } catch (err) {
    console.log("Push notification registration failed:", err);
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
