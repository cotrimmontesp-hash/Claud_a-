import { Platform } from "react-native";
import { fetch as expoFetch } from "expo/fetch";

// No site, a API fica no mesmo endereço. No app (Android/iPhone), usa o endereço da Vercel.
export const API_URL = Platform.OS === "web" ? "" : "https://claude-ia-steel.vercel.app";

export type Role = "user" | "assistant";
export type Message = { role: Role; content: string };
export type Mode = "rapida" | "esperta";

/**
 * Envia a conversa e recebe a resposta aos pedaços (streaming).
 * onChunk é chamado com o texto completo recebido até agora.
 */
export async function askNexa(
  messages: Message[],
  mode: Mode,
  onChunk: (full: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const doFetch: typeof expoFetch =
    Platform.OS === "web" ? (globalThis.fetch as unknown as typeof expoFetch) : expoFetch;

  const res = await doFetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: mode }),
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
