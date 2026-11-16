// Função da Vercel que conversa com a IA.
// Hoje usa o Google Gemini grátis (variável GEMINI_APK_KEY ou GEMINI_API_KEY).
// Sem essa variável, usa o Vercel AI Gateway (Claude), que precisa de créditos.

// Modelos grátis do Google (com reserva caso o principal falhe)
const GEMINI = {
  rapida: ["gemini-3.5-flash-lite", "gemini-flash-lite-latest"],
  esperta: ["gemini-3.5-flash", "gemini-3.5-flash-lite"],
};

// Modelos Claude (só se usar o Vercel AI Gateway com créditos)
const CLAUDE = {
  rapida: ["anthropic/claude-sonnet-5.5"],
  esperta: ["anthropic/claude-opus-5.5"],
};

// Modelos de imagem do Google (testados em ordem)
const IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-2.5-flash-image", "gemini-3.1-flash-image-preview"];

const VIDEO_PROMPT = `

MODO VÍDEO LIGADO: você é uma especialista em criação e edição de vídeos curtos (TikTok, Reels, Shorts) e em CapCut.
- Roteiros: sempre com gancho forte nos 2 primeiros segundos, cenas numeradas com tempo (ex.: 0–2s, 2–6s), fala/narração, texto na tela, o que aparece na imagem e música/efeito sonoro sugerido.
- Edição no CapCut: dê passo a passo com o nome real dos botões e menus do CapCut em português (ex.: Dividir, Velocidade > Curva, Animação, Efeitos, Legendas automáticas, Keyframe, Remover fundo, Ajustar), e valores sugeridos quando fizer sentido.
- Pense em ritmo e retenção: cortes a cada 1–3 segundos, zoom em momentos fortes, legenda grande e legível, loop no final quando der.
- Dê também: legenda do post, 3 a 5 hashtags, melhor duração e ideia de capa.
- Se o usuário mandar uma imagem ou vídeo, analise de verdade o que aparece (enquadramento, luz, ritmo, texto, gancho) e diga o que manter e o que mudar, em ordem de prioridade.
- Seja prática: o usuário quer sair da conversa sabendo exatamente o que gravar e editar.
- O app tem um editor próprio (botão Editor): presets 9:16 (Futebol, Curiosidade, Gancho e Limpo), corte no ritmo da música, legenda grande estilo TikTok, punch-in, zoom lento, tremor e transições (flash, fade, wipe). O botão Montar edit junta de 3 a 10 lances num vídeo de cerca de 30 segundos. Quando a pessoa for editar, indique esse editor e o preset certo, além do CapCut se ela pedir.`;

const TONS = {
  equilibrada: "leve e simpática, bem-humorada quando cabe, mas sem enrolar",
  divertida: "bem divertida e animada, com piadas e brincadeiras leves, mas sempre útil",
  seria: "séria, objetiva e profissional, sem piadas",
  girias: "descontraída, falando como um jovem brasileiro, com gírias naturais (sem exagerar e sem palavrão)",
};

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v, maxItems, maxLen) =>
  Array.isArray(v) ? v.map((x) => str(x, maxLen)).filter(Boolean).slice(-maxItems) : [];

function buildSystemPrompt(p = {}) {
  const nome = str(p.assistantName, 30) || "Nexa";
  const usuario = str(p.userName, 40);
  const tom = TONS[p.tone] || TONS.equilibrada;
  const emojis = p.emojis === false ? "Não use emojis." : "Pode usar alguns emojis quando combinar.";
  const custom = str(p.custom, 1500);
  const memories = list(p.memories, 60, 300);
  const dislikes = list(p.dislikes, 20, 300);
  const likes = list(p.likes, 3, 400);

  let s = `Você é "${nome}", uma assistente de inteligência artificial brasileira, inteligente e direta.
- Responda sempre em português do Brasil, a menos que o usuário peça outro idioma.
- Jeito de falar: ${tom}. ${emojis}
- Você ajuda com qualquer assunto: tirar dúvidas, estudar, explicar coisas, conselhos práticos, finanças, edição de vídeo, CapCut, TikTok, programação, jogos, ideias.
- Você também cria: roteiros de vídeo, legendas, ganchos para TikTok, textos, posts, histórias, nomes, listas de ideias.
- Vá direto ao ponto. Use formatação simples (listas, **negrito**, títulos curtos) quando ajudar a ler no celular.
- Seja honesta: se não souber algo ou se a informação puder estar desatualizada, diga isso. Não invente fatos.
- Nunca ajude com coisas perigosas ou ilegais.`;

  if (usuario) s += `\n- O nome do usuário é ${usuario}. Chame-o assim de vez em quando, sem exagero.`;
  if (custom) s += `\n\nInstruções do usuário sobre como você deve ser:\n${custom}`;
  if (memories.length)
    s += `\n\nO que você já sabe sobre o usuário (use só quando ajudar a resposta, sem ficar repetindo que lembra):\n${memories.map((m) => "- " + m).join("\n")}`;
  if (dislikes.length)
    s += `\n\nO usuário NÃO gostou destas coisas em respostas antigas. Evite repetir:\n${dislikes.map((m) => "- " + m).join("\n")}`;
  if (likes.length)
    s += `\n\nExemplos de respostas que o usuário curtiu (siga um estilo parecido):\n${likes.map((m) => "- " + m).join("\n")}`;
  if (p.videoMode) s += VIDEO_PROMPT;
  const agora = str(p.now, 40);
  if (agora) {
    s += `\n\nData e hora agora para o usuário: ${agora}${p.tz ? ` (fuso ${str(p.tz, 40)})` : ""}.
LEMBRETES: o app consegue criar lembretes com notificação no celular. Se o usuário pedir para lembrar, avisar ou alarmar algo em um horário, confirme em uma frase curta e coloque na ÚLTIMA linha, exatamente neste formato (horário local dele, 24h):
[[LEMBRETE|AAAA-MM-DDTHH:MM|texto curto do lembrete]]
Use um bloco desses para cada lembrete. Se faltar o horário, pergunte antes de criar. Nunca use esse formato em outras situações.`;
  }
  return s;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
}

function getProvider(req) {
  const gemini = (process.env.GEMINI_APK_KEY || process.env.GEMINI_API_KEY || "").trim();
  const token =
    gemini || req.headers["x-vercel-oidc-token"] || process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY;
  const endpoint = gemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://ai-gateway.vercel.sh/v1/chat/completions";
  return { gemini: !!gemini, key: gemini, token, endpoint };
}

// API própria do Gemini (aceita imagem, vídeo e gerar imagens)
function nativeUrl(model, stream) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${
    stream ? "streamGenerateContent?alt=sse" : "generateContent"
  }`;
}

async function readSse(body, onJson) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const handle = (line) => {
    const l = line.trim();
    if (!l.startsWith("data:")) return;
    const data = l.slice(5).trim();
    if (!data || data === "[DONE]") return;
    try {
      onJson(JSON.parse(data));
    } catch {}
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) handle(line);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer);
}

async function callNative(prov, models, payload, stream, timeoutMs) {
  let lastErr = "";
  let lastStatus = 0;
  for (const model of models) {
    try {
      const r = await fetch(nativeUrl(model, stream), {
        method: "POST",
        headers: { "x-goog-api-key": prov.key, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(payload),
      });
      if (r.ok && r.body) {
        console.log("native using", model);
        return { r, model };
      }
      lastStatus = r.status;
      lastErr = (await r.text().catch(() => "")).slice(0, 500);
      console.error("native error", model, r.status, lastErr);
    } catch (e) {
      lastErr = e.name + ": " + e.message;
      console.error("native fail", model, lastErr);
    }
  }
  return { lastErr, lastStatus };
}

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|heic|heif)|video\/(mp4|quicktime|webm|3gpp|x-m4v)|audio\/(wav|wave|x-wav|mpeg|mp3|mp4|webm|aac|ogg))$/;

function cleanAttachment(a) {
  if (!a || typeof a !== "object") return null;
  const mime = str(a.mime, 40).toLowerCase();
  const data = typeof a.data === "string" ? a.data.replace(/^data:[^,]+,/, "") : "";
  if (!ALLOWED_MIME.test(mime) || !data || data.length > 4_300_000) return null;
  return { mime, data };
}

// Conversa pela API própria do Gemini (com anexo e/ou pesquisa no Google), em streaming.
async function chatNative(prov, body, trimmed, modelKey, attachment, search, res, isTest) {
  const contents = trimmed.map((m, i) => {
    const parts = [{ text: m.content || "." }];
    if (attachment && i === trimmed.length - 1 && m.role === "user") {
      parts.push({ inline_data: { mime_type: attachment.mime, data: attachment.data } });
    }
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
  const models = isTest && body.testModels
    ? body.testModels
    : search
    ? SEARCH_MODELS
    : modelKey === "esperta"
    ? ["gemini-3.5-flash", "gemini-3.5-flash-lite"]
    : ["gemini-3.5-flash-lite", "gemini-3.5-flash"];
  const out = await callNative(
    prov,
    models,
    {
      systemInstruction: {
        parts: [
          {
            text:
              buildSystemPrompt(body.profile) +
              (search
                ? "\n\nVocê pode pesquisar no Google. Use a pesquisa para informações atuais (notícias, trends, preços, resultados, datas) e responda com o que encontrou, sem inventar."
                : ""),
          },
        ],
      },
      contents,
      ...(search ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { maxOutputTokens: 8192 },
    },
    true,
    40000
  );
  if (!out.r) {
    res.status(502).json({ error: errorMessage(out.lastErr, out.lastStatus), detail: out.lastErr });
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  let full = "";
  const sources = new Map();
  const write = (t) => {
    full += t;
    if (!isTest) res.write(t);
  };
  await readSse(out.r.body, (json) => {
    const cand = json.candidates?.[0];
    const parts = cand?.content?.parts || [];
    for (const part of parts) if (part.text && !part.thought) write(part.text);
    for (const ch of cand?.groundingMetadata?.groundingChunks || []) {
      if (ch.web?.uri && sources.size < 5) sources.set(ch.web.uri, ch.web.title || ch.web.uri);
    }
  });
  if (sources.size) {
    write("\n\n**Fontes:**\n" + [...sources].map(([uri, title]) => `- [${title}](${uri})`).join("\n"));
  }
  if (isTest) {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, model: out.model, sources: sources.size, text: full.slice(0, 600) }));
    return;
  }
  res.end();
}

// ---------- Pesquisa grátis na internet (DuckDuckGo + Wikipédia, sem chave) ----------
const decodeHtml = (t) =>
  t
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function searchNews(q) {
  const r = await fetch(
    "https://news.google.com/rss/search?hl=pt-BR&gl=BR&ceid=BR:pt-419&q=" + encodeURIComponent(q),
    { headers: { "User-Agent": "Mozilla/5.0 NexaIA" }, signal: AbortSignal.timeout(8000) }
  );
  if (!r.ok) throw new Error("news " + r.status);
  const xml = await r.text();
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 6) {
    const it = m[1];
    const get = (tag) => {
      const x = it.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">"));
      return x ? decodeHtml(x[1].replace(/<!\[CDATA\[|\]\]>/g, "")) : "";
    };
    const date = get("pubDate");
    items.push({
      title: get("title"),
      url: get("link"),
      snippet: (get("source") ? get("source") + " • " : "") + (date ? new Date(date).toLocaleDateString("pt-BR") : ""),
    });
  }
  return items;
}

async function searchMojeek(q) {
  const r = await fetch("https://www.mojeek.com/search?lb=pt&q=" + encodeURIComponent(q), {
    headers: { "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36", "Accept-Language": "pt-BR,pt;q=0.9" },
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) throw new Error("mojeek " + r.status);
  const html = await r.text();
  const out = [];
  const re = /<a class="title" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p class="s">([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html)) && out.length < 5) out.push({ title: decodeHtml(m[2]), url: m[1], snippet: decodeHtml(m[3]) });
  return out;
}

async function searchQuotes(q) {
  const pairs = [];
  if (/d[óo]lar|usd/i.test(q)) pairs.push("USD-BRL");
  if (/euro|eur\b/i.test(q)) pairs.push("EUR-BRL");
  if (/bitcoin|btc/i.test(q)) pairs.push("BTC-BRL");
  if (!pairs.length) return [];
  const r = await fetch("https://economia.awesomeapi.com.br/json/last/" + pairs.join(","), { signal: AbortSignal.timeout(6000) });
  if (!r.ok) return [];
  const j = await r.json();
  return Object.values(j).map((x) => ({
    title: `Cotação ${x.name}`,
    url: "https://economia.awesomeapi.com.br",
    snippet: `Compra R$ ${x.bid} • Venda R$ ${x.ask} • Variação ${x.pctChange}% • Atualizado em ${x.create_date}`,
  }));
}

async function searchWiki(q) {
  const r = await fetch(
    "https://pt.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=2&utf8=1&srsearch=" + encodeURIComponent(q),
    { headers: { "User-Agent": "NexaIA/1.0 (claude-ia-steel.vercel.app)" }, signal: AbortSignal.timeout(6000) }
  );
  if (!r.ok) return [];
  const j = await r.json();
  return (j.query?.search || []).map((x) => ({
    title: x.title + " – Wikipédia",
    url: "https://pt.wikipedia.org/wiki/" + encodeURIComponent(x.title.replace(/ /g, "_")),
    snippet: decodeHtml(x.snippet || ""),
  }));
}

// Transforma a pergunta em poucas palavras-chave de pesquisa.
async function searchKeywords(prov, q) {
  const fallback = q.replace(/[?!.]/g, " ").replace(/\s+/g, " ").slice(0, 120);
  if (!prov.token) return fallback;
  const out = await callModel(
    prov,
    prov.gemini ? GEMINI.rapida : CLAUDE.rapida,
    {
      stream: false,
      max_tokens: 40,
      messages: [{ role: "user", content: `Escreva só as palavras-chave (2 a 6 palavras, em português) para pesquisar isto no Google. Sem aspas, sem explicação.\n\n${q.slice(0, 500)}` }],
    },
    8000
  );
  if (!out.r) return fallback;
  try {
    const j = await out.r.json();
    const t = (j.choices?.[0]?.message?.content || "").replace(/["\n]/g, " ").trim();
    return t ? t.slice(0, 120) : fallback;
  } catch {
    return fallback;
  }
}

async function webSearch(prov, q) {
  const query = await searchKeywords(prov, q);
  console.log("search query", query);
  const [quotes, news, web, wiki] = await Promise.all([
    searchQuotes(q).catch(() => []),
    searchNews(query).catch((e) => (console.error("news fail", e.message), [])),
    searchMojeek(query).catch((e) => (console.error("mojeek fail", e.message), [])),
    searchWiki(query).catch(() => []),
  ]);
  const seen = new Set();
  return [...quotes, ...news.slice(0, 4), ...web.slice(0, 3), ...wiki.slice(0, 1)]
    .filter((x) => x.url && x.title && !seen.has(x.title) && seen.add(x.title))
    .slice(0, 9);
}

// Modelos usados na pesquisa (o plano grátis só libera a pesquisa em alguns).
const SEARCH_MODELS = ["gemini-flash-latest", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

// Perguntas que pedem informação de hoje: liga a pesquisa sozinha.
const PRECISA_PESQUISA =
  /\b(hoje|ontem|agora|atual|atualmente|recente|últim[oa]s?|noticias?|notícias?|trend(s|ing)?|em alta|viral|lançamento|lançou|preço|cotação|placar|resultado|jogo de hoje|quem ganhou|tempo em|previsão|2025|2026|2027)\b/i;

// Transforma o pedido do usuário num prompt de imagem em inglês, fiel ao que ele pediu.
async function englishImagePrompt(prov, prompt) {
  if (!prov.token) return prompt;
  const out = await callModel(
    prov,
    prov.gemini ? GEMINI.rapida : CLAUDE.rapida,
    {
      stream: false,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `Rewrite this request as a detailed English prompt for an image generator.
Rules: start with the main subject; keep exactly the subject, objects, colors and style the user asked for; do not add people, faces or characters unless the user asked for them (write "no people" in that case); family-friendly; if the user wants text in the image, put it in quotes; max 35 words. Output only the prompt.

Request: ${prompt}`,
        },
      ],
    },
    15000
  );
  if (!out.r) return prompt;
  try {
    const j = await out.r.json();
    const t = (j.choices?.[0]?.message?.content || "").trim().replace(/^"|"$/g, "");
    return t ? t.slice(0, 900) : prompt;
  } catch {
    return prompt;
  }
}

// Gerador grátis de imagens (pollinations.ai). O pedido vai em inglês para sair melhor.
function pollinationsUrl(prompt, seed) {
  const q = new URLSearchParams({ width: "768", height: "768", seed: String(seed), safe: "true" });
  return "https://image.pollinations.ai/prompt/" + encodeURIComponent(prompt.slice(0, 700)) + "?" + q;
}

function retryWaitMs(res, body) {
  const header = Number(res.headers.get("retry-after"));
  if (Number.isFinite(header) && header > 0) return Math.min(48, header + 1) * 1000;
  const m = String(body || "").match(/retry[- ]after[^\d]{0,20}(\d+)/i);
  if (m) return Math.min(48, Number(m[1]) + 1) * 1000;
  return 16000;
}

async function pollinations(prompt, res, googleErr, prov) {
  try {
    if (prov) prompt = await englishImagePrompt(prov, prompt);
    console.log("image prompt", prompt);
    let seed = Math.floor(Math.random() * 1e9);
    let r = await fetch(pollinationsUrl(prompt, seed), { signal: AbortSignal.timeout(55000) });
    let type = r.headers.get("content-type") || "";
    if (!type.startsWith("image/") && (r.status === 402 || r.status === 429 || r.status === 503)) {
      // O plano grátis pede cerca de 45 s entre imagens e avisa no cabeçalho Retry-After.
      const t = await r.text().catch(() => "");
      const wait = retryWaitMs(r, t);
      console.log("image retry in", wait);
      await new Promise((ok) => setTimeout(ok, wait));
      seed = Math.floor(Math.random() * 1e9);
      r = await fetch(pollinationsUrl(prompt, seed), { signal: AbortSignal.timeout(55000) });
      type = r.headers.get("content-type") || "";
    }
    if (!r.ok || !type.startsWith("image/")) {
      const t = (await r.text().catch(() => "")).slice(0, 300);
      console.error("pollinations", r.status, type, t);
      res.status(502).json({ error: "Não consegui criar a imagem agora. Tente de novo daqui a pouco.", detail: t || googleErr });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.status(200).json({ mime: type.split(";")[0], data: buf.toString("base64"), text: "", model: "pollinations" });
  } catch (e) {
    console.error("pollinations fail", e.name, e.message);
    res.status(502).json({ error: "A criação de imagem demorou demais. Tente de novo.", detail: e.message });
  }
}

// Cria uma imagem a partir de um pedido em texto.
async function createImage(prov, body, res) {
  const prompt = str(body.prompt, 2000);
  if (!prompt) {
    res.status(400).json({ error: "Descreva a imagem que você quer." });
    return;
  }
  // 1) Tenta o Google (só funciona se a conta tiver cota de imagem).
  // 2) Se não der, usa o Pollinations (gerador de imagens grátis, sem chave).
  if (!prov.key || process.env.GOOGLE_IMAGES !== "1") {
    // No plano grátis do Google o limite de imagens é zero; para usar o Google,
    // crie a variável GOOGLE_IMAGES=1 na Vercel depois de ativar o faturamento.
    await pollinations(prompt, res, "", prov);
    return;
  }
  const parts = [{ text: `Crie uma imagem: ${prompt}` }];
  const ref = cleanAttachment(body.attachment);
  if (ref && ref.mime.startsWith("image/")) parts.push({ inline_data: { mime_type: ref.mime, data: ref.data } });
  const out = await callNative(
    prov,
    IMAGE_MODELS,
    {
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    },
    false,
    55000
  );
  if (!out.r) {
    await pollinations(prompt, res, out.lastErr, prov);
    return;
  }
  try {
    const j = await out.r.json();
    const outParts = j.candidates?.[0]?.content?.parts || [];
    const img = outParts.find((x) => x.inlineData || x.inline_data);
    const text = outParts.filter((x) => x.text && !x.thought).map((x) => x.text).join("\n").trim();
    if (!img) {
      res.status(502).json({ error: text || "A IA não devolveu imagem. Tente descrever de outro jeito." });
      return;
    }
    const d = img.inlineData || img.inline_data;
    res.status(200).json({ mime: d.mimeType || d.mime_type || "image/png", data: d.data, text, model: out.model });
  } catch (e) {
    console.error("image parse", e.message);
    res.status(502).json({ error: "Não consegui ler a imagem criada." });
  }
}

async function callModel(prov, models, payload, timeoutMs) {
  let lastErr = "";
  let lastStatus = 0;
  for (const model of models) {
    try {
      const r = await fetch(prov.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${prov.token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({ model, ...payload }),
      });
      if (r.ok && r.body) {
        console.log("using", model);
        return { r };
      }
      lastStatus = r.status;
      lastErr = (await r.text().catch(() => "")).slice(0, 500);
      console.error("AI error", model, r.status, lastErr);
    } catch (e) {
      lastErr = e.name + ": " + e.message;
      console.error("AI fail", model, lastErr);
    }
  }
  return { lastErr, lastStatus };
}

function errorMessage(lastErr, lastStatus) {
  if (lastErr.includes("credit card")) return "A IA ainda não foi ativada";
  if (lastStatus === 429) return "Limite de uso atingido, tente daqui a pouco";
  return "A IA demorou ou falhou, tente de novo";
}

// Lê a conversa e decide o que vale guardar na memória sobre o usuário.
async function memorize(prov, body, res) {
  const current = list(body.memories, 60, 300);
  const user = str(body.user, 3000);
  const assistant = str(body.assistant, 3000);
  if (!user) {
    res.status(200).json({ add: [], remove: [] });
    return;
  }
  const prompt = `Você cuida da memória de uma assistente de IA. Leia a última troca de mensagens e decida o que guardar sobre o USUÁRIO para conversas futuras.

Guarde só fatos duradouros que o próprio usuário disse: nome, idade aproximada se ele disser, cidade, trabalho, projetos, objetivos, gostos, jeito que prefere as respostas.
NÃO guarde: perguntas comuns, coisas passageiras do dia, o que a assistente disse, senhas, documentos, dados de cartão ou banco, saúde, religião, política, vida sexual, crimes.
Cada memória: uma frase curta em português, em terceira pessoa ("Tem um canal de TikTok de futebol").
Se algo novo contradiz uma memória antiga, coloque a antiga em "remove".
Se não houver nada novo, devolva listas vazias. Na dúvida, não guarde.

Memórias atuais:
${current.length ? current.map((m) => "- " + m).join("\n") : "(nenhuma)"}

Última mensagem do usuário:
${user}

Resposta da assistente:
${assistant}

Responda só com JSON no formato {"add": ["..."], "remove": ["texto exato de uma memória atual"]}.`;

  const out = await callModel(
    prov,
    prov.gemini ? GEMINI.rapida : CLAUDE.rapida,
    {
      stream: false,
      max_tokens: 600,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    },
    20000
  );
  if (!out.r) {
    res.status(200).json({ add: [], remove: [], error: errorMessage(out.lastErr, out.lastStatus) });
    return;
  }
  try {
    const j = await out.r.json();
    let txt = j.choices?.[0]?.message?.content || "{}";
    txt = txt.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const data = JSON.parse(txt);
    res.status(200).json({
      add: list(data.add, 5, 300),
      remove: list(data.remove, 10, 300),
    });
  } catch (e) {
    console.error("memorize parse", e.message);
    res.status(200).json({ add: [], remove: [] });
  }
}

function asSegments(data) {
  const arr = Array.isArray(data && data.segments) ? data.segments : Array.isArray(data) ? data : [];
  return arr
    .slice(0, 40)
    .map((s) => ({
      start: Math.max(0, Number(s && s.start) || 0),
      end: Number(s && s.end) || 0,
      text: str(s && s.text, 80),
    }))
    .filter((s) => s.text && s.end > s.start)
    .slice(0, 24);
}

// Legenda automática: o editor manda só um wav curto, pela mesma chave grátis do Gemini.
async function transcribe(prov, body, res) {
  if (!prov.key) {
    res.status(400).json({ error: "Transcrever a fala precisa da chave grátis do Google no servidor." });
    return;
  }
  const attachment = cleanAttachment(body.attachment);
  if (!attachment || !attachment.mime.startsWith("audio/")) {
    res.status(400).json({ error: "Não recebi um áudio curto para transcrever." });
    return;
  }
  const out = await callNative(
    prov,
    ["gemini-3.5-flash-lite", "gemini-3.5-flash"],
    {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: 'Transcreva a fala deste áudio em português do Brasil. Ignore música de fundo. Divida em frases curtas de 2 a 4 palavras, como legenda de TikTok. Responda somente JSON: {"segments":[{"start":0.0,"end":1.2,"text":"frase"}]}. Tempos em segundos. Não invente fala. Se não houver fala, {"segments":[]}.',
            },
            { inline_data: { mime_type: attachment.mime, data: attachment.data } },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 2048, temperature: 0.2 },
    },
    false,
    50000
  );
  if (!out.r) {
    res.status(502).json({ error: "Não consegui transcrever agora. Tente de novo.", detail: out.lastErr });
    return;
  }
  try {
    const j = await out.r.json();
    let txt = (j.candidates?.[0]?.content?.parts || [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("\n")
      .trim();
    txt = txt.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    const data = JSON.parse(txt || "{}");
    res.status(200).json({ segments: asSegments(data) });
  } catch (e) {
    console.error("transcribe parse", e.message);
    res.status(502).json({ error: "A transcrição veio num formato que não deu para ler." });
  }
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  const isTest = req.method === "GET" && req.query && req.query.teste;
  if (isTest === "imagem") {
    const prov0 = getProvider(req);
    await createImage(prov0, { prompt: str(req.query.p, 300) || "um gato astronauta fofo, estilo desenho, fundo roxo" }, {
      status: (c) => ({
        json: (o) => {
          if (o.data && req.query.ver) {
            res.setHeader("Content-Type", o.mime);
            res.status(c).end(Buffer.from(o.data, "base64"));
            return;
          }
          res.status(c).json(o.data ? { ok: true, model: o.model, mime: o.mime, kb: Math.round(o.data.length / 1365) } : o);
        },
      }),
    });
    return;
  }
  if (isTest) {
    req.body = {
      messages: [{ role: "user", content: str(req.query.q, 300) || "Diga só: estou funcionando!" }],
      model: req.query.teste === "esperta" ? "esperta" : "rapida",
      search: req.query.teste === "busca" ? true : undefined,
      testModels: req.query.m ? String(req.query.m).split(",").slice(0, 6) : undefined,
    };
  } else if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const prov = getProvider(req);
  if (!prov.token) {
    res.status(500).json({ error: "Sem credencial para a IA." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  body = body || {};

  if (body.task === "memorizar") {
    await memorize(prov, body, res);
    return;
  }
  if (body.task === "imagem") {
    await createImage(prov, body, res);
    return;
  }
  if (body.task === "transcrever") {
    await transcribe(prov, body, res);
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const modelKey = body.model === "esperta" ? "esperta" : "rapida";
  const trimmed = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));

  if (!trimmed.length) {
    res.status(400).json({ error: "Mensagem vazia." });
    return;
  }

  const attachment = cleanAttachment(body.attachment);
  const lastUser = [...trimmed].reverse().find((m) => m.role === "user")?.content || "";
  const search = body.search === true || (body.search !== false && PRECISA_PESQUISA.test(lastUser));
  let results = [];
  if (search && !attachment) {
    results = await webSearch(prov, lastUser);
    console.log("search", results.length, "resultados");
  }
  if (attachment) {
    if (!prov.key) {
      res.status(400).json({ error: "Analisar fotos e vídeos precisa da chave do Google." });
      return;
    }
    try {
      await chatNative(prov, body, trimmed, modelKey, attachment, false, res, isTest);
    } catch (e) {
      console.error("attach fail", e.name, e.message);
      if (!res.headersSent) res.status(500).json({ error: "Falha ao analisar o arquivo." });
      else res.end();
    }
    return;
  }

  const tStart = Date.now();
  const out = await callModel(
    prov,
    (prov.gemini ? GEMINI : CLAUDE)[modelKey],
    {
      stream: true,
      max_tokens: prov.gemini ? 8192 : 2048,
      messages: [
        {
          role: "system",
          content:
            buildSystemPrompt(body.profile) +
            (results.length
              ? `\n\nRESULTADOS DE UMA PESQUISA NA INTERNET FEITA AGORA para a pergunta do usuário (use para responder com informação atual; prefira o resultado mais recente e diga a data quando houver; se houver "Cotação", use esse valor; se não for suficiente, diga que não encontrou com certeza; não invente; cite a fonte pelo nome do site, nunca com números entre colchetes; a lista de links é colocada automaticamente no fim, não escreva links):\n` +
                results.map((r) => `• ${r.title}\n${r.snippet}`).join("\n\n")
              : search
              ? "\n\nO usuário pediu uma informação atual, mas a pesquisa na internet não trouxe resultados agora. Avise que não conseguiu pesquisar e que a sua informação pode estar desatualizada."
              : ""),
        },
        ...trimmed,
      ],
    },
    modelKey === "esperta" ? 12000 : 25000
  );

  if (!out.r) {
    res.status(502).json({ error: errorMessage(out.lastErr, out.lastStatus), detail: out.lastErr });
    return;
  }

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");
    let full = "";
    await readSse(out.r.body, (json) => {
      const piece = json.choices?.[0]?.delta?.content;
      if (piece) {
        full += piece;
        if (!isTest) res.write(piece);
      }
    });
    if (results.length) {
      const fontes = "\n\n**Fontes:**\n" + results.slice(0, 4).map((r) => `- [${r.title}](${r.url})`).join("\n");
      full += fontes;
      if (!isTest) res.write(fontes);
    }
    if (isTest) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, ms: Date.now() - tStart, results: results.length, text: full.slice(0, 1200) }));
      return;
    }
    res.end();
  } catch (err) {
    console.error("stream fail", err && err.name, err && err.message);
    if (!res.headersSent) res.status(500).json({ error: "Falha ao falar com a IA." });
    else res.end();
  }
};
