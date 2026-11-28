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
  {
    name: "hashtags",
    label: "#️⃣ /hashtags",
    hint: "15 hashtags para o post",
    build: (t) =>
      `Liste 15 hashtags para um vídeo de TikTok sobre: ${sobre(t, "futebol")}. ` +
      "Misture 5 bem populares, 5 médias e 5 bem específicas do tema, a maioria em português. Coloque todas juntas em uma linha só, separadas por espaço, prontas para copiar.",
  },
  {
    name: "curiosidade",
    label: "🤯 /curiosidade",
    hint: "curiosidade pronta para narrar",
    build: (t) =>
      `Me conte uma curiosidade real e surpreendente sobre: ${sobre(t, "futebol")}. ` +
      "Escreva o texto pronto para eu narrar em um vídeo de até 40 segundos: comece com um gancho forte, explique de forma simples e termine com uma pergunta para o público comentar. Se não tiver certeza de que o fato é verdadeiro, avise.",
  },
  {
    name: "edit",
    label: "⚽ /edit",
    hint: "plano de edit de futebol",
    build: (t) =>
      `Monte um plano de edit de futebol para TikTok sobre: ${sobre(t, "um craque do futebol")}. ` +
      "Diga quais lances usar e em que ordem, o estilo de música (sem precisar ser uma música específica), onde colocar cortes na batida, efeitos e transições, e um texto curto para a tela.",
  },
  {
    name: "quiz",
    label: "❓ /quiz",
    hint: "quiz para o público responder",
    build: (t) =>
      `Crie um quiz para vídeo de TikTok sobre: ${sobre(t, "futebol")}, com 5 perguntas que ficam mais difíceis a cada uma. ` +
      "Para cada pergunta, dê 3 alternativas (A, B, C) e logo abaixo a resposta certa com uma explicação de uma linha. " +
      "Comece com um gancho tipo \"Só 1% acerta todas\" e termine pedindo para o público comentar quantas acertou. Use só fatos que você tem certeza.",
  },
  {
    name: "top5",
    label: "🏆 /top5",
    hint: "ranking top 5 para narrar",
    build: (t) =>
      `Monte um ranking TOP 5 para vídeo de TikTok sobre: ${sobre(t, "os gols mais bonitos da história")}. ` +
      "Conte do 5º para o 1º, com uma ou duas frases curtas de narração para cada posição, deixando o melhor para o final. " +
      "Comece com um gancho forte e termine perguntando ao público qual seria o top 1 dele. Se não tiver certeza de algum dado, avise.",
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
