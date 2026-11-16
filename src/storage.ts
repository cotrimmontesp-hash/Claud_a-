import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Message, Mode } from "./api";

export type Feedback = "up" | "down";
export type ChatMessage = Message & { feedback?: Feedback };
export type Conversation = { id: string; title: string; messages: ChatMessage[] };

export type Tone = "equilibrada" | "divertida" | "seria" | "girias";

export type Profile = {
  assistantName: string;
  userName: string;
  tone: Tone;
  emojis: boolean;
  custom: string;
  memoryOn: boolean;
  memories: string[];
  dislikes: string[];
  likes: string[];
};

export const DEFAULT_PROFILE: Profile = {
  assistantName: "Nexa",
  userName: "",
  tone: "equilibrada",
  emojis: true,
  custom: "",
  memoryOn: true,
  memories: [],
  dislikes: [],
  likes: [],
};

const KEY = "nexa_convs_v1";
const MODE_KEY = "nexa_mode";
const PROFILE_KEY = "nexa_profile_v1";

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

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    return { ...DEFAULT_PROFILE, ...(data && typeof data === "object" ? data : {}) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  try {
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {}
}
