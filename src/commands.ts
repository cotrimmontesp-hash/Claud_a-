// Comandos rápidos: o usuário digita "/roteiro tema" e a Nexa recebe um pedido completo.

export type QuickCommand = {
  name: string;
  label: string;
  hint: string;
  build: (topic: string) => string;
};

const sobre = (t: string, padrao: string) => (t ? t : padrao);

export const COMMANDS: QuickCommand[] = [
  {
    name: "roteiro",
    label: "🎬 /roteiro",
    hint: "roteiro de TikTok de 30s",
    build: (t) =>
      `Crie um roteiro de TikTok de 30 segundos sobre: ${sobre(t, "uma curiosidade surpreendente")}. ` +
      "Comece com um gancho forte nos 2 primeiros segundos, divida em cenas com o texto falado e o que aparece na tela, e termine com uma chamada para seguir o perfil.",
  },
  {
    name: "legenda",
    label: "✍️ /legenda",
    hint: "legenda + hashtags",
    build: (t) =>
      `Escreva 3 opções de legenda curta e chamativa para um vídeo de TikTok sobre: ${sobre(t, "futebol")}. ` +
      "Cada uma com no máximo 150 caracteres, um emoji e de 4 a 6 hashtags relevantes em português.",
  },
  {
    name: "ideias",
    label: "💡 /ideias",
    hint: "10 ideias de vídeo",
    build: (t) =>
      `Me dê 10 ideias de vídeos para TikTok sobre: ${sobre(t, "futebol e curiosidades")}. ` +
      "Para cada ideia, escreva o título e o gancho de abertura em uma linha.",
  },
  {
    name: "gancho",
    label: "🪝 /gancho",
    hint: "5 ganchos de abertura",
    build: (t) =>
      `Crie 5 ganchos de abertura (frases para os 2 primeiros segundos) que prendam a atenção em um vídeo sobre: ${sobre(t, "uma curiosidade")}.`,
  },
  {
    name: "titulo",
    label: "🏷️ /titulo",
    hint: "títulos para a capa",
    build: (t) =>
      `Sugira 5 títulos curtos (até 6 palavras) para colocar na capa de um vídeo sobre: ${sobre(t, "futebol")}.`,
  },
];

const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Comandos que combinam com o que foi digitado (só enquanto a pessoa digita "/algo"). */
export function matchCommands(input: string): QuickCommand[] {
  const m = /^\/(\S*)$/.exec(input.trimStart());
  if (!m) return [];
  const typed = strip(m[1]);
  return COMMANDS.filter((c) => c.name.startsWith(typed));
}

/** Transforma "/roteiro tema" no pedido completo. Se não for comando, devolve o texto igual. */
export function expandCommand(text: string): string {
  const m = /^\/(\S+)\s*([\s\S]*)$/.exec(text.trim());
  if (!m) return text;
  const cmd = COMMANDS.find((c) => c.name === strip(m[1]));
  return cmd ? cmd.build(m[2].trim()) : text;
}
