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

const webTimers = new Map<string, ReturnType<typeof setTimeout>>();
const MAX_WEB_DELAY = 2 ** 30;
let webPermAsked = false;

function askWebPermission() {
  if (Platform.OS !== "web" || webPermAsked || typeof Notification === "undefined") return;
  webPermAsked = true;
  try {
    if (Notification.permission === "default") void Notification.requestPermission().catch(() => {});
  } catch {}
}

function clearWeb(id: string) {
  const timer = webTimers.get(id);
  if (timer) clearTimeout(timer);
  webTimers.delete(id);
}

function fireWeb(r: Reminder) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("⏰ Lembrete da Nexa", { body: r.text, icon: "/icon-192.png" });
    } else alert("⏰ Lembrete da Nexa: " + r.text);
  } catch {}
}

function armWeb(r: Reminder) {
  clearWeb(r.id);
  const ms = new Date(r.when).getTime() - Date.now();
  if (ms <= 500) {
    if (ms > -60 * 1000) fireWeb(r);
    return;
  }
  const delay = Math.min(ms, MAX_WEB_DELAY);
  const timer = setTimeout(() => {
    webTimers.delete(r.id);
    armWeb(r);
  }, delay);
  webTimers.set(r.id, timer);
}

/** No site, o aviso some quando a aba fecha. Isto reativa os que ainda vão acontecer. */
export function ensureWebReminders(list: Reminder[]) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  askWebPermission();
  const ids = new Set(list.map((r) => r.id));
  for (const id of [...webTimers.keys()]) if (!ids.has(id)) clearWeb(id);
  for (const r of list) {
    if (new Date(r.when).getTime() > Date.now() + 500) armWeb(r);
    else clearWeb(r.id);
  }
}

/** Agenda a notificação. No site, só avisa se a aba estiver aberta. */
export async function scheduleReminder(text: string, date: Date, id?: string): Promise<string | undefined> {
  if (Platform.OS === "web") {
    askWebPermission();
    return id ? `web:${id}` : undefined;
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
  clearWeb(r.id);
  if (Platform.OS !== "web" && r.notifId) {
    try {
      await Notifications.cancelScheduledNotificationAsync(r.notifId);
    } catch {}
  }
}

const TAG = /\[\[LEMBRETE\|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)\|([^\]\n]{1,200})\]\]/g;

/** Horário local, mesmo se o texto vier com segundos. Não usa o fuso UTC. */
export function parseLocalDate(when: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(when.trim());
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] || 0), 0);
}

/** Separa os pedidos de lembrete que a IA colocou no fim da resposta. */
export function extractReminders(text: string): { clean: string; found: { date: Date; text: string }[] } {
  const found: { date: Date; text: string }[] = [];
  const clean = text
    .replace(TAG, (_m, when: string, what: string) => {
      const date = parseLocalDate(when);
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
  const year = d.getFullYear() !== new Date().getFullYear() ? `/${d.getFullYear()}` : "";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${year} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
