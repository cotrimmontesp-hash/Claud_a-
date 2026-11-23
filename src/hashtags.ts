/**
 * Pega as hashtags de uma resposta (ex.: "#futebol #edit #fyp"), sem repetir,
 * na ordem em que aparecem. Ignora títulos do Markdown ("# Título") e cores ("#fff").
 */
export function extractHashtags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /(^|[^\p{L}\p{N}_&/#])#([\p{L}\p{N}_]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    const tag = m[2];
    if (/^\d+$/.test(tag)) continue; // "#1", "#2"…
    if (/^[0-9a-f]{3}([0-9a-f]{3})?$/i.test(tag) && /\d/.test(tag)) continue; // cores tipo #1a2b3c
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push("#" + tag);
  }
  return out;
}
