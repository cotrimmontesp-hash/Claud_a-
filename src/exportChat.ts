import { Platform, Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { Conversation } from "./storage";

/** Monta a conversa como texto simples (bom para colar em notas, WhatsApp, roteiro...). */
export function conversationToText(conv: Conversation, aiName: string, userLabel = "Você"): string {
  const title = conv.title?.trim() || "Conversa";
  const lines: string[] = [`💬 ${title}`, ""];
  for (const m of conv.messages) {
    const who = m.role === "user" ? userLabel : aiName;
    let body = (m.content || "").trim();
    if (m.attachment) body = `[${m.attachment.kind === "video" ? "vídeo" : "foto"} anexado] ${body}`.trim();
    if (m.image) body = `${body}\n[imagem criada]`.trim();
    if (!body) continue;
    lines.push(`${who}:`, body, "");
  }
  lines.push(`— exportado da ${aiName}`);
  return lines.join("\n");
}

/**
 * Compartilha a conversa. No celular abre o menu de compartilhar do sistema;
 * no navegador usa o compartilhar do navegador ou copia para a área de transferência.
 * Retorna "copiado" quando o texto foi só copiado.
 */
export async function exportConversation(conv: Conversation, aiName: string, userLabel?: string): Promise<"compartilhado" | "copiado"> {
  const text = conversationToText(conv, aiName, userLabel);
  if (Platform.OS === "web") {
    const nav: any = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ title: conv.title || "Conversa", text });
        return "compartilhado";
      } catch {
        // usuário cancelou ou não suportado: cai para copiar
      }
    }
    await Clipboard.setStringAsync(text);
    return "copiado";
  }
  await Share.share({ message: text, title: conv.title || "Conversa" });
  return "compartilhado";
}
