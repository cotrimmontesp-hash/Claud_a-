/**
 * Ajuda para narrar respostas (ex.: curiosidade para TikTok).
 * Tira a marcação do Markdown, hashtags e emojis, para a voz ler só o texto.
 */
export function textForSpeech(text: string): string {
  return (text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, " ")
    .replace(/[*#`_>~|]/g, " ")
    .replace(/[\p{Extended_Pictographic}️‍]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Texto pronto para colar na voz do CapCut/TikTok: igual ao da fala,
 * mas mantendo uma frase/parágrafo por linha (fica mais fácil de editar).
 */
export function scriptForNarration(text: string): string {
  return (text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\n+/)
    .map((line) => textForSpeech(line.replace(/^\s*(\d+[.)]|[-*•])\s+/, "")).replace(/\s+([!?.,;:])/g, "$1"))
    .filter((line) => /[\p{L}\p{N}]/u.test(line))
    .join("\n");
}

/** Narração calma em português: cerca de 150 palavras por minuto (2,5 por segundo). */
const WORDS_PER_SECOND = 2.5;

/** Quantos segundos leva para narrar o texto em voz alta (arredondado). */
export function estimateNarrationSeconds(text: string): number {
  const words = textForSpeech(text).split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_SECOND));
}

/** "38s" ou "1min 12s". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}min ${s}s` : `${m}min`;
}
