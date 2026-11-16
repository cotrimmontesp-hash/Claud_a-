import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Reminder = { id: string; when: string; text: string; notifId?: string };

const KEY = "nexa_reminders_v1";

if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function loadReminders(): Promise<Reminder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list: Reminder[] = raw ? JSON.parse(raw) : [];
    // tira os que já passaram há mais de 1 dia
    const limit = Date.now() - 24 * 3600 * 1000;
    return Array.isArray(list) ? list.filter((r) => new Date(r.when).getTime() > limit) : [];
  } catch {
    return [];
  }
}

export async function saveReminders(list: Reminder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(-100)));
  } catch {}
}

/** Agenda a notificação. No site, só avisa se a aba estiver aberta. */
export async function scheduleReminder(text: string, date: Date): Promise<string | undefined> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && "Notification" in window) {
      // pede permissão sem travar o app (o navegador mostra o pedido e a pessoa responde quando quiser)
      try {
        if (Notification.permission === "default") void Notification.requestPermission().catch(() => {});
      } catch {}
      const ms = date.getTime() - Date.now();
      if (ms > 0 && ms < 2 ** 31 - 1) {
        setTimeout(() => {
          try {
            if (Notification.permission === "granted") new Notification("⏰ Lembrete da Nexa", { body: text, icon: "/icon-192.png" });
            else alert("⏰ Lembrete da Nexa: " + text);
          } catch {}
        }, ms);
      }
    }
    return undefined;
  }

  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) {
    throw new Error("Permita as notificações da Nexa nas configurações do celular para receber lembretes.");
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("lembretes", {
      name: "Lembretes",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
  }
  return Notifications.scheduleNotificationAsync({
    content: { title: "⏰ Lembrete da Nexa", body: text, sound: "default" },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: "lembretes" },
  });
}

export async function cancelReminder(r: Reminder): Promise<void> {
  if (Platform.OS !== "web" && r.notifId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(r.notifId);
    } catch {}
  }
}

const TAG = /\[\[LEMBRETE\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})\|([^\]\n]{1,200})\]\]/g;

/** Separa os pedidos de lembrete que a IA colocou no fim da resposta. */
export function extractReminders(text: string): { clean: string; found: { date: Date; text: string }[] } {
  const found: { date: Date; text: string }[] = [];
  const clean = text
    .replace(TAG, (_m, when: string, what: string) => {
      const date = new Date(when); // sem "Z": horário local do aparelho
      if (!isNaN(date.getTime())) found.push({ date, text: what.trim() });
      return "";
    })
    .trim();
  return { clean, found };
}

/** Esconde um pedido de lembrete ainda chegando aos pedaços. */
export function hidePartialTag(text: string): string {
  return text.replace(TAG, "").replace(/\[\[(L(E(M(B(R(E(T(E[^\]]*)?)?)?)?)?)?)?)?\]?$/, "").trimEnd();
}

export function formatWhen(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Data e hora local, no formato que a IA entende. */
export function nowLocal(): { now: string; tz: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dias = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  let tz = "";
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {}
  return {
    now: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())} (${dias[d.getDay()]})`,
    tz,
  };
}
