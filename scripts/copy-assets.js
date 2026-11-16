// Copia o motor de edição de vídeo (ffmpeg.wasm) e a fonte para o site publicado.
const fs = require("fs");
const path = require("path");

const out = path.join(__dirname, "..", "dist", "ffmpeg");
fs.mkdirSync(out, { recursive: true });

const nm = (...p) => path.join(__dirname, "..", "node_modules", ...p);
const copy = (from, to) => {
  fs.copyFileSync(from, path.join(out, to));
  console.log("copiado", to, Math.round(fs.statSync(from).size / 1024) + " KB");
};

const umd = nm("@ffmpeg", "ffmpeg", "dist", "umd");
for (const f of fs.readdirSync(umd)) if (f.endsWith(".js")) copy(path.join(umd, f), f);
copy(nm("@ffmpeg", "util", "dist", "umd", "index.js"), "util.js");
copy(nm("@ffmpeg", "core", "dist", "umd", "ffmpeg-core.js"), "ffmpeg-core.js");
copy(nm("@ffmpeg", "core", "dist", "umd", "ffmpeg-core.wasm"), "ffmpeg-core.wasm");
copy(nm("dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf"), "font.ttf");
