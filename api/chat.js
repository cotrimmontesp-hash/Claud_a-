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
  return { gemini: !!gemini, token, endpoint };
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

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  const isTest = req.method === "GET" && req.query && req.query.teste;
  if (isTest) {
    req.body = {
      messages: [{ role: "user", content: "Diga só: estou funcionando!" }],
      model: req.query.teste === "esperta" ? "esperta" : "rapida",
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

  const tStart = Date.now();
  const out = await callModel(
    prov,
    (prov.gemini ? GEMINI : CLAUDE)[modelKey],
    {
      stream: true,
      max_tokens: prov.gemini ? 8192 : 2048,
      messages: [{ role: "system", content: buildSystemPrompt(body.profile) }, ...trimmed],
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
    const reader = out.r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        const l = line.trim();
        if (!l.startsWith("data:")) continue;
        const data = l.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const piece = json.choices?.[0]?.delta?.content;
          if (piece) {
            full += piece;
            if (!isTest) res.write(piece);
          }
        } catch {}
      }
    }
    if (isTest) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, ms: Date.now() - tStart, text: full }));
      return;
    }
    res.end();
  } catch (err) {
    console.error("stream fail", err && err.name, err && err.message);
    if (!res.headersSent) res.status(500).json({ error: "Falha ao falar com a IA." });
    else res.end();
  }
};
