import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Message, Mode } from "./api";

export type Feedback = "up" | "down";
export type ChatMessage = Message & {
  feedback?: Feedback;
  /** foto/vídeo que o usuário mandou (só para mostrar) */
  attachment?: { kind: "image" | "video"; uri: string };
  /** imagem criada pela IA */
  image?: string;
};
export type Conversation = { id: string; title: string; messages: ChatMessage[] };

export type Tone = "equilibrada" | "divertida" | "seria" | "girias";

export type Profile = {
  assistantName: string;
  userName: string;
  tone: Tone;
  emojis: boolean;
  custom: string;
  memoryOn: boolean;
  videoMode: boolean;
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
  videoMode: false,
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

// Endereços temporários do navegador (blob:/data:) não sobrevivem; não vale a pena guardar.
const tempUri = (u?: string) => !!u && (u.startsWith("blob:") || u.startsWith("data:"));

export async function saveConversations(convs: Conversation[]): Promise<void> {
  try {
    const clean = convs.slice(0, 60).map((c) => ({
      ...c,
      messages: c.messages.map((m) => {
        const out: ChatMessage = { ...m };
        if (out.attachment && tempUri(out.attachment.uri)) out.attachment = { ...out.attachment, uri: "" };
        if (tempUri(out.image)) delete out.image;
        return out;
      }),
    }));
    await AsyncStorage.setItem(KEY, JSON.stringify(clean));
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
