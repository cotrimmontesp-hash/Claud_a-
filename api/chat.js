const SYSTEM_PROMPT = `Você é a "Nexa", uma assistente de inteligência artificial brasileira, simpática, inteligente e direta.
- Responda sempre em português do Brasil, a menos que o usuário peça outro idioma.
- Você ajuda com qualquer assunto: tirar dúvidas, estudar, explicar coisas, dar conselhos práticos, finanças, edição de vídeo, CapCut, TikTok, programação, jogos, ideias.
- Você também cria: roteiros de vídeo, legendas, ganchos para TikTok, textos, posts, histórias, nomes, listas de ideias.
- Tenha personalidade: leve, bem-humorada quando cabe, mas sem enrolar. Vá direto ao ponto.
- Use formatação simples (listas, **negrito**, títulos curtos) quando ajudar a ler no celular.
- Seja honesta: se não souber algo ou se a informação puder estar desatualizada, diga isso.
- Nunca ajude com coisas perigosas ou ilegais.`;

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

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  const isTest = req.method === "GET" && req.query && req.query.teste;
  if (isTest) {
    req.body = { messages: [{ role: "user", content: "Diga só: estou funcionando!" }], model: req.query.teste === "esperta" ? "esperta" : "rapida" };
  } else if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  // Chave grátis do Google Gemini na Vercel (GEMINI_APK_KEY ou GEMINI_API_KEY).
  // Sem chave, usa o Vercel AI Gateway (Claude) com o token do próprio projeto.
  const gemini = (process.env.GEMINI_APK_KEY || process.env.GEMINI_API_KEY || "").trim();
  const token = gemini ||
    req.headers["x-vercel-oidc-token"] ||
    process.env.VERCEL_OIDC_TOKEN ||
    process.env.AI_GATEWAY_API_KEY;
  const ENDPOINT = gemini
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : "https://ai-gateway.vercel.sh/v1/chat/completions";

  if (!token) {
    res.status(500).json({ error: "Sem credencial para a IA." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const modelKey = body?.model === "esperta" ? "esperta" : "rapida";

  const trimmed = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));

  if (!trimmed.length) {
    res.status(400).json({ error: "Mensagem vazia." });
    return;
  }

  const candidates = (gemini ? GEMINI : CLAUDE)[modelKey];
  let upstream = null;
  let lastErr = "";
  let lastStatus = 0;
  const tStart = Date.now();

  for (const model of candidates) {
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model,
          stream: true,
          max_tokens: gemini ? 8192 : 2048,
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...trimmed],
        }),
      });
      if (r.ok && r.body) { upstream = r; console.log("using", model); break; }
      lastStatus = r.status;
      lastErr = (await r.text().catch(() => "")).slice(0, 500);
      console.error("AI error", model, r.status, lastErr);
    } catch (e) {
      lastErr = e.name + ": " + e.message;
      console.error("AI fail", model, lastErr);
    }
  }

  if (!upstream) {
    const semCartao = lastErr.includes("credit card");
    const limite = lastStatus === 429;
    res.status(502).json({ error: semCartao ? "A IA ainda não foi ativada" : limite ? "Limite de uso atingido, tente daqui a pouco" : "A IA demorou ou falhou, tente de novo", detail: lastErr });
    return;
  }

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache");

    const reader = upstream.body.getReader();
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
          if (piece) { full += piece; if (!isTest) res.write(piece); }
        } catch {}
      }
    }
    if (isTest) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ ok: true, ms: Date.now() - tStart, text: full })); return; }
    res.end();
  } catch (err) {
    console.error("stream fail", err && err.name, err && err.message);
    if (!res.headersSent) res.status(500).json({ error: "Falha ao falar com a IA." });
    else res.end();
  }
};
