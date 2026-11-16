// Monta um edit de ~30 s a partir de uma busca normal no YouTube.
// Não usa proxy, cookies, captcha nem outro jeito de furar bloqueio.
// Se o YouTube pedir login de bot, o script imprime o erro e para.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const L = require("../public/editor-logic.js");

const player = String(process.env.JOGADOR || process.argv[2] || "").trim().slice(0, 40);
const target = Math.min(45, Math.max(15, Number(process.env.DURACAO || process.argv[3]) || 30));
const outDir = path.resolve(process.env.EDIT_OUT || "out");
const work = path.join(outDir, "work");

if (player.length < 2) {
  console.error("Informe o nome do jogador.");
  process.exit(1);
}

const BOT = /sign in to confirm you.?re not a bot|confirm you.?re not a bot/i;

function run(cmd, args, timeout) {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: timeout || 180000, maxBuffer: 8 * 1024 * 1024 });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
  if (r.error && r.error.code === "ETIMEDOUT") {
    console.error(out);
    console.error("O comando passou do tempo: " + cmd);
    process.exit(1);
  }
  return { code: r.status == null ? 1 : r.status, out };
}

function stopIfBlocked(out) {
  if (!BOT.test(out)) return;
  console.error("YouTube bloqueou o download. Nada foi contornado. Erro exato:");
  console.error(out);
  process.exit(2);
}

function must(cmd, args, timeout) {
  const r = run(cmd, args, timeout);
  stopIfBlocked(r.out);
  if (r.code !== 0) {
    console.error(r.out);
    throw new Error(cmd + " falhou (" + r.code + ")");
  }
  return r.out;
}

fs.mkdirSync(work, { recursive: true });
const query = player + " football skills";
console.log("Buscando:", query);
const search = run("yt-dlp", [
  "ytsearch8:" + query,
  "--flat-playlist",
  "--print", "%(id)s\t%(duration)s\t%(title)s",
  "--no-warnings",
  "--no-playlist",
], 90000);
stopIfBlocked(search.out);
if (search.code !== 0) {
  console.error(search.out || "yt-dlp não conseguiu buscar.");
  process.exit(1);
}

const rows = search.out.split(/\n/).map((line) => {
  const [id, duration, ...title] = line.split("\t");
  return { id: (id || "").trim(), duration: Number(duration), title: title.join("\t").trim() };
}).filter((r) => /^[\w-]{6,}$/.test(r.id));

if (!rows.length) {
  console.error("A busca não trouxe vídeos.");
  console.error(search.out);
  process.exit(1);
}

const picked = [];
for (const row of rows) {
  if (picked.length >= 5) break;
  if (Number.isFinite(row.duration) && (row.duration < 8 || row.duration > 240)) continue;
  const dir = path.join(work, "dl" + picked.length);
  fs.mkdirSync(dir, { recursive: true });
  console.log("Baixando trecho:", row.id, row.title);
  const dl = run("yt-dlp", [
    "https://www.youtube.com/watch?v=" + row.id,
    "-f", "bv*[height<=720]+ba/b[height<=720]/b",
    "--download-sections", "*0-8",
    "--force-keyframes-at-cuts",
    "--no-playlist",
    "--no-warnings",
    "--max-filesize", "40M",
    "-o", path.join(dir, "clip.%(ext)s"),
  ], 180000);
  stopIfBlocked(dl.out);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).map((name) => path.join(dir, name)).filter((p) => fs.statSync(p).isFile()) : [];
  const file = files.filter((p) => fs.statSync(p).size > 10000).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
  if (dl.code !== 0 || !file) {
    console.error("Pulei um vídeo:", row.id);
    console.error(dl.out.slice(-500));
    continue;
  }
  picked.push(file);
}
if (picked.length < 3) {
  console.error("Precisava de pelo menos 3 trechos e consegui " + picked.length + ".");
  process.exit(1);
}

function probe(file) {
  const r = run("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file,
  ], 20000);
  const n = parseFloat(r.out);
  return Number.isFinite(n) ? n : 0;
}

const beatPath = path.join(work, "batida.wav");
fs.writeFileSync(beatPath, Buffer.from(L.makeBeatWav(Math.min(40, target + 4), 120)));
const audio = L.decodeWav(fs.readFileSync(beatPath));
const beats = L.detectBeats(audio.samples, audio.sampleRate);
const meta = picked.map((file) => {
  const dur = probe(file);
  return { file, start: 0, end: dur > 0.5 ? dur : 8, dur: dur > 0.5 ? dur : 8 };
});
const slices = L.planFootballEdit(meta, beats, { target, maxSlices: 12 });
if (slices.length < 3) {
  console.error("Não deu para montar os cortes.");
  process.exit(1);
}

const font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
const parts = [];
slices.forEach((s, i) => {
  const src = meta[s.clipIndex].file;
  const out = path.join(work, "part" + i + ".mp4");
  const z = s.zoom > 1 ? 1.12 : 1;
  const W = 720;
  const H = 1280;
  const ZW = Math.round((W * z) / 2) * 2;
  const ZH = Math.round((H * z) / 2) * 2;
  const flash = i > 0 ? ",fade=t=in:st=0:d=0.07:color=white" : "";
  const vf = "scale=" + ZW + ":" + ZH + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H + ",setsar=1" + flash + ",fps=30,format=yuv420p";
  must("ffmpeg", [
    "-y", "-ss", String(s.start), "-t", String(Math.max(0.3, s.end - s.start)),
    "-i", src, "-vf", vf, "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "26", out,
  ]);
  parts.push(out);
});

const list = path.join(work, "list.txt");
fs.writeFileSync(list, parts.map((p) => "file '" + p.replace(/'/g, "'\\''") + "'").join("\n"));
const joined = path.join(work, "joined.mp4");
must("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined]);
const total = probe(joined) || slices.reduce((a, s) => a + (s.end - s.start), 0);
const lines = L.fallbackCaptions(player);
const slot = total / lines.length;
const filters = [];
lines.forEach((text, i) => {
  const body = text.toUpperCase();
  const words = body.split(/\s+/);
  const shown = words.length > 2 ? words.slice(0, 2).join(" ") + "\n" + words.slice(2).join(" ") : body;
  const file = path.join(work, "cap" + i + ".txt");
  fs.writeFileSync(file, shown);
  const start = (i * slot).toFixed(2);
  const end = ((i + 1) * slot).toFixed(2);
  filters.push(
    "drawtext=fontfile=" + font + ":textfile=" + file +
    ":fontsize=68:fontcolor=white:borderw=8:bordercolor=black:line_spacing=8:x=(w-text_w)/2:y=(h-text_h)/2" +
    ":enable='between(t," + start + "," + end + ")'"
  );
});
const finalPath = path.join(outDir, "edit.mp4");
must("ffmpeg", [
  "-y", "-i", joined, "-i", beatPath,
  "-vf", filters.join(","),
  "-map", "0:v:0", "-map", "1:a:0",
  "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k", "-ar", "44100",
  "-shortest", "-movflags", "+faststart",
  finalPath,
]);
console.log("Pronto:", finalPath, "cortes:", slices.length);
