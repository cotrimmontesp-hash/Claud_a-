import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";
import type { Profile } from "./storage";

// No site, a API fica no mesmo endereço. No app (Android/iPhone), usa o endereço da Vercel.
export const API_URL = Platform.OS === "web" ? "" : "https://claude-ia-steel.vercel.app";

export type Role = "user" | "assistant";
export type Message = { role: Role; content: string };
export type Mode = "rapida" | "esperta";

const doFetch: typeof expoFetch =
  Platform.OS === "web" ? (globalThis.fetch as unknown as typeof expoFetch) : expoFetch;

/** O que vai para a IA sobre o usuário (a memória só vai se estiver ligada). */
function profileForServer(p: Profile) {
  return {
    assistantName: p.assistantName,
    userName: p.userName,
    tone: p.tone,
    emojis: p.emojis,
    custom: p.custom,
    memories: p.memoryOn ? p.memories : [],
    dislikes: p.dislikes,
    likes: p.likes,
  };
}

/**
 * Envia a conversa e recebe a resposta aos pedaços (streaming).
 * onChunk é chamado com o texto completo recebido até agora.
 */
export async function askNexa(
  messages: Message[],
  mode: Mode,
  profile: Profile,
  onChunk: (full: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const res = await doFetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: mode, profile: profileForServer(profile) }),
    signal,
  });

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {}
    throw new Error(msg);
  }

  let full = "";
  const reader = res.body?.getReader();
  if (!reader) {
    full = await res.text();
    onChunk(full);
    return full;
  }
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onChunk(full);
  }
  return full;
}

/** Pede para a IA decidir o que guardar na memória depois de uma troca de mensagens. */
export async function updateMemory(
  memories: string[],
  user: string,
  assistant: string
): Promise<{ add: string[]; remove: string[] }> {
  try {
    const res = await doFetch(`${API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "memorizar", memories, user, assistant }),
    });
    if (!res.ok) return { add: [], remove: [] };
    const data = await res.json();
    return {
      add: Array.isArray(data?.add) ? data.add.filter((x: unknown) => typeof x === "string") : [],
      remove: Array.isArray(data?.remove) ? data.remove.filter((x: unknown) => typeof x === "string") : [],
    };
  } catch {
    return { add: [], remove: [] };
  }
}
