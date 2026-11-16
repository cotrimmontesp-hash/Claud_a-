import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Message, Mode } from "./api";

export type Conversation = { id: string; title: string; messages: Message[] };

const KEY = "nexa_convs_v1";
const MODE_KEY = "nexa_mode";

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function saveConversations(convs: Conversation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(convs.slice(0, 60)));
  } catch {}
}

export async function loadMode(): Promise<Mode> {
  try {
    const m = await AsyncStorage.getItem(MODE_KEY);
    return m === "esperta" ? "esperta" : "rapida";
  } catch {
    return "rapida";
  }
}

export async function saveMode(mode: Mode): Promise<void> {
  try {
    await AsyncStorage.setItem(MODE_KEY, mode);
  } catch {}
}
