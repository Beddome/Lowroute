import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";

export const safeHaptics = {
  impactAsync: async (style?: Haptics.ImpactFeedbackStyle) => {
    try { await Haptics.impactAsync(style); } catch {}
  },
  notificationAsync: async (type?: Haptics.NotificationFeedbackType) => {
    try { await Haptics.notificationAsync(type); } catch {}
  },
  selectionAsync: async () => {
    try { await Haptics.selectionAsync(); } catch {}
  },
  ImpactFeedbackStyle: Haptics.ImpactFeedbackStyle,
  NotificationFeedbackType: Haptics.NotificationFeedbackType,
};

export const safeSpeech = {
  speak: (text: string, options?: Speech.SpeechOptions) => {
    try { Speech.speak(text, options); } catch {}
  },
  stop: async () => {
    try { await Speech.stop(); } catch {}
  },
  isSpeakingAsync: async () => {
    try { return await Speech.isSpeakingAsync(); } catch { return false; }
  },
};
