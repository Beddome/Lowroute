import * as storage from "./storage";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string;
}

export async function sendPushNotification(
  recipientUserId: string,
  title: string,
  body: string,
  data?: Record<string, any>
) {
  try {
    const tokens = await storage.getPushTokensForUsers([recipientUserId]);
    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
      to: t.push_token,
      title,
      body,
      data,
      sound: "default",
    }));

    await sendExpoPushNotifications(messages);
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

export async function sendPushToMultiple(
  recipientUserIds: string[],
  title: string,
  body: string,
  data?: Record<string, any>
) {
  try {
    const tokens = await storage.getPushTokensForUsers(recipientUserIds);
    if (tokens.length === 0) return;

    const messages: ExpoPushMessage[] = tokens.map((t: any) => ({
      to: t.push_token,
      title,
      body,
      data,
      sound: "default",
    }));

    await sendExpoPushNotifications(messages);
  } catch (err) {
    console.error("Push notification error:", err);
  }
}

async function sendExpoPushNotifications(messages: ExpoPushMessage[]) {
  if (messages.length === 0) return;

  const chunks = chunkArray(messages, 100);
  for (const chunk of chunks) {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        console.error("Expo push API error:", response.status, await response.text());
      }
    } catch (err) {
      console.error("Failed to send push chunk:", err);
    }
  }
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
