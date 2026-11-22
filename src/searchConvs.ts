import type { Conversation } from "./storage";

/** Deixa o texto em minúsculas e sem acentos, para a busca achar "acao" em "Ação". */
export function normalize(t: string): string {
  return (t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export type ConvHit = { conv: Conversation; snippet?: string };

/**
 * Filtra as conversas pelo título e pelo texto das mensagens.
 * Quando a palavra aparece só dentro da conversa, devolve um trechinho para mostrar.
 */
export function searchConversations(convs: Conversation[], query: string): ConvHit[] {
  const q = normalize(query.trim());
  if (!q) return convs.map((conv) => ({ conv }));
  const hits: ConvHit[] = [];
  for (const conv of convs) {
    if (normalize(conv.title).includes(q)) {
      hits.push({ conv });
      continue;
    }
    for (const m of conv.messages) {
      const text = m.content || "";
      const i = normalize(text).indexOf(q);
      if (i >= 0) {
        const start = Math.max(0, i - 20);
        const piece = text.slice(start, i + q.length + 30).replace(/\s+/g, " ").trim();
        hits.push({ conv, snippet: (start > 0 ? "…" : "") + piece + "…" });
        break;
      }
    }
  }
  return hits;
}
