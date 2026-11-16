// Dispara o workflow "Edit automática" no GitHub.
// O token fica só na variável GITHUB_DISPATCH_TOKEN (Vercel). Não há segredo no código.
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  const token = (process.env.GITHUB_DISPATCH_TOKEN || "").trim();
  const repo = (process.env.GITHUB_REPOSITORY || "cotrimmontesp-hash/Claud_a-").trim();
  const ref = (process.env.GITHUB_DISPATCH_REF || "grok-melhorias").trim();
  if (!token) {
    res.status(501).json({
      error: "Falta a variável GITHUB_DISPATCH_TOKEN na Vercel. É um token do GitHub com permissão de actions. Ele não fica no app.",
    });
    return;
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !/^[\w./-]+$/.test(ref)) {
    res.status(500).json({ error: "Repositório ou branch da Action está inválido." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const jogador = str(body.jogador, 40);
  const duracao = String(Math.min(45, Math.max(15, Number(body.duracao) || 30)));
  if (jogador.length < 2) {
    res.status(400).json({ error: "Diga o nome do jogador." });
    return;
  }

  try {
    const r = await fetch("https://api.github.com/repos/" + repo + "/actions/workflows/edit-automatica.yml/dispatches", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "nexa-editor",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref, inputs: { jogador, duracao } }),
    });
    if (r.status === 204) {
      res.status(200).json({ ok: true, message: "O GitHub começou a montar o edit. O vídeo aparece nos artifacts da Action Edit automática." });
      return;
    }
    const detail = (await r.text().catch(() => "")).slice(0, 300);
    res.status(502).json({ error: "O GitHub não aceitou o pedido (" + r.status + ").", detail });
  } catch (e) {
    res.status(502).json({ error: "Não consegui falar com o GitHub.", detail: e.message });
  }
};
