const assert = require("assert");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const L = require("../public/editor-logic.js");

function eq(a, b, msg) {
  assert.strictEqual(a, b, msg || `${a} !== ${b}`);
}

const phrases = L.splitPhrases("você não vai acreditar nesse lance de futebol hoje", 3, 18);
assert.ok(phrases.length >= 3, "divide o texto em frases curtas");
assert.ok(phrases.every((p) => p.split(/\s+/).length <= 3), "cada frase tem no máximo 3 palavras");

const timed = L.timePhrases(["um", "dois", "três"], 6, null);
eq(timed[0].start, 0);
eq(timed[2].end, 6);
assert.ok(timed[1].start >= timed[0].end - 0.01);

const onBeat = L.timePhrases(["gol", "quase"], 4, [0, 1, 2, 3, 4]);
eq(onBeat[0].start, 0);
eq(onBeat[onBeat.length - 1].end, 4);

const sr = 8000;
const dur = 4;
const samples = new Float32Array(sr * dur);
for (let b = 0.5; b < dur; b += 0.5) {
  const i = Math.floor(b * sr);
  for (let k = 0; k < 100 && i + k < samples.length; k++) samples[i + k] = Math.sin(k * 0.7) * (1 - k / 100);
}
const wavPath = "/tmp/nexa-e2e/beats.wav";
if (fs.existsSync(wavPath)) {
  const wavBeats = L.decodeWav(fs.readFileSync(wavPath));
  assert.ok(wavBeats && wavBeats.samples.length > 1000, "le wav pcm");
  const found = L.detectBeats(wavBeats.samples, wavBeats.sampleRate, { minGap: 0.3, maxGap: 1.2 });
  assert.ok(found.length >= 8, "wav real de batidas: " + found.length);
}

const beats = L.detectBeats(samples, sr, { minGap: 0.3, maxGap: 1.2 });
assert.ok(beats.length >= 5, "acha as batidas, veio " + beats.join(","));
assert.ok(beats[0] === 0);
const gaps = [];
for (let i = 1; i < beats.length; i++) gaps.push(beats[i] - beats[i - 1]);
const near = gaps.filter((g) => g > 0.35 && g < 0.7).length;
assert.ok(near >= 4, "intervalo perto de 0,5s: " + gaps.join(","));

const slices = L.buildBeatSlices([{ start: 0, end: 10, dur: 10 }], beats.concat([10]), { maxSlices: 6, minLen: 0.34 });
assert.ok(slices.length >= 2 && slices.length <= 6, "limita a quantidade de cortes");
assert.ok(slices.every((s, i) => i === 0 || s.start >= slices[i - 1].end - 0.001));
assert.ok(slices.every((s) => s.end > s.start));
assert.ok(slices.some((s) => s.zoom > 1) && slices.some((s) => s.zoom === 1), "alterna o punch-in");

const layout = L.layoutCaption("você não vai acreditar", 720, 1280, "tiktok");
assert.ok(layout.size >= 48, "legenda grande, veio " + layout.size);
assert.ok(layout.lines.every((l) => l.length <= 16));

const plan = L.captionPlan(timed, 720, 1280, "tiktok");
assert.ok(plan[0].filter.includes("fontsize=" + plan[0].size));
assert.ok(plan[0].filter.includes("enable='between(t,"));
assert.ok(!plan[0].filter.includes("\\,"), "vírgula da legenda fica dentro de aspas");

const openShot = L.videoChain({ W: 720, H: 1280, fit: "crop", speed: 1, effect: "punch", punch: 1, flash: false });
assert.ok(openShot.includes("scale=720:1280"));
assert.ok(!openShot.includes("scale=806"), "corte aberto não pode virar punch");

const chain = L.videoChain({ W: 720, H: 1280, fit: "crop", speed: 1.25, effect: "punch", punch: 1.15, flash: true });
assert.ok(chain.includes("setpts=PTS/1.25"));
assert.ok(chain.includes("fade=t=in"));
assert.ok(chain.includes("crop=720:1280"));

const zoom = L.videoChain({ W: 720, H: 1280, fit: "crop", speed: 1, effect: "zoom", flash: false });
assert.ok(zoom.includes("min(t/5\\,1)"), "vírgula da expressão precisa escapar");

const graph = L.sliceFilter(
  [
    { start: 0, end: 0.5, zoom: 1 },
    { start: 0.5, end: 1, zoom: 1.15 },
  ],
  { W: 320, H: 568, fit: "crop", speed: 1, effect: "punch", flash: true, hasAudio: true, ordinal: 0 }
);
assert.ok(graph.includes("[0:v]split=2"));
assert.equal((graph.match(/\[0:v\]/g) || []).length, 1, "não reutiliza o vídeo de entrada");
assert.ok(graph.includes("concat=n=2:v=1:a=0[v]"));

const xf = L.xfadeFilter([2, 2], "wipe");
assert.ok(xf.filter.includes("xfade=transition=wipeleft"));
assert.ok(xf.filter.includes("acrossfade"));
assert.equal(L.xfadeFilter([0.2, 2], "fade"), null, "não cruza um clipe curto demais");

const beatAudio = L.decodeWav(L.makeBeatWav(32, 120));
assert.ok(beatAudio && beatAudio.samples.length > 22050 * 30, "batida sintética é um wav de ~32 s");
const beatTimes = L.detectBeats(beatAudio.samples, beatAudio.sampleRate, { minGap: 0.3, maxGap: 0.8 });
assert.ok(beatTimes.length >= 40, "a batida tem tempos regulares: " + beatTimes.length);
const four = [0, 1, 2, 3].map(() => ({ start: 0, end: 8, dur: 8 }));
const editPlan = L.planFootballEdit(four, beatTimes, { target: 30, maxSlices: 12 });
const planDur = editPlan.reduce((a, s) => a + (s.end - s.start), 0);
assert.ok(editPlan.length >= 4 && editPlan.length <= 12, "quantidade de cortes " + editPlan.length);
assert.ok(planDur >= 24 && planDur <= 32, "duração do plano " + planDur);
const used = new Set(editPlan.map((s) => s.clipIndex));
assert.equal(used.size, 4, "os 4 clipes entram no edit");
assert.ok(editPlan.every((s) => s.end > s.start));
assert.ok(L.fallbackCaptions("Neymar")[0].includes("NEYMAR"));
assert.deepEqual(
  L.parseCaptionLines("1. NEYMAR CHEGOU\nOLHA ESSE LANCE\n- NINGUÉM SEGURA\nQUE JOGADA\nNO FINAL\nexplicação longa demais para virar legenda de tiktok agora"),
  ["NEYMAR CHEGOU", "OLHA ESSE LANCE", "NINGUÉM SEGURA", "QUE JOGADA", "NO FINAL"]
);

assert.equal(L.PRESETS.futebol.fmt, "9:16");
assert.equal(L.PRESETS.futebol.trans, "flash");
assert.equal(L.PRESETS.curiosidade.effect, "zoom");
assert.deepEqual(L.dims("9:16"), [720, 1280]);

const unknown = L.outputDuration([{ start: 0, end: 0, dur: 0 }], 1);
assert.equal(unknown.known, false);
const known = L.outputDuration([{ start: 1, end: 3, dur: 10 }], 2);
assert.equal(known.seconds, 1);

const ffmpegBin = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
if (ffmpegBin.status !== 0) {
  console.log("editor-logic ok (sem ffmpeg no PATH; filtros não executados)");
  process.exit(0);
}

function runFilter(name, args) {
  const out = path.join(os.tmpdir(), name);
  const r = spawnSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...args, out], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(name, r.stderr);
    process.exit(1);
  }
  const size = fs.statSync(out).size;
  fs.unlinkSync(out);
  assert.ok(size > 1000, name + " gerou arquivo pequeno");
}

const font = path.join(__dirname, "..", "node_modules", "dejavu-fonts-ttf", "ttf", "DejaVuSans-Bold.ttf");
const srcFile = path.join(os.tmpdir(), "nexa-src.mp4");
const made = spawnSync(
  "ffmpeg",
  [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2",
    "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", srcFile,
  ],
  { encoding: "utf8" }
);
if (made.status !== 0) {
  console.error(made.stderr);
  process.exit(1);
}
const src = ["-i", srcFile];

runFilter("nexa-punch.mp4", [
  ...src,
  "-filter_complex",
  "[0:v]" + L.videoChain({ W: 360, H: 640, fit: "crop", speed: 1, effect: "punch", punch: 1.15, flash: true }) + "[v]",
  "-map", "[v]", "-map", "0:a", "-t", "1",
]);

runFilter("nexa-zoom.mp4", [
  "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=2",
  "-vf", L.videoChain({ W: 360, H: 640, fit: "crop", speed: 1, effect: "zoom", flash: false }),
  "-an", "-t", "1",
]);

runFilter("nexa-shake.mp4", [
  "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30:duration=1",
  "-vf", L.videoChain({ W: 360, H: 640, fit: "crop", speed: 1, effect: "shake", flash: false }),
  "-an", "-t", "0.6",
]);

runFilter("nexa-blur.mp4", [
  ...src,
  "-filter_complex", L.blurFilter(360, 640, 1, false, "zoom") + ";[0:a]aresample=44100[a]",
  "-map", "[v]", "-map", "[a]", "-shortest", "-t", "1",
]);

const slice = L.sliceFilter(
  [
    { start: 0, end: 0.4, zoom: 1 },
    { start: 0.4, end: 0.8, zoom: 1.15 },
  ],
  { W: 360, H: 640, fit: "crop", speed: 1, effect: "punch", flash: true, hasAudio: true, ordinal: 0 }
);
runFilter("nexa-slices.mp4", [...src, "-filter_complex", slice, "-map", "[v]", "-map", "[a]", "-t", "1"]);

const caps = L.captionPlan([{ text: "gol de placa", start: 0, end: 1 }], 360, 640, "tiktok");
const capFile = path.join(os.tmpdir(), "nexa-cap.txt");
fs.writeFileSync(capFile, caps[0].body);
runFilter("nexa-caption.mp4", [
  "-f", "lavfi", "-i", "color=c=black:s=360x640:r=30:d=1",
  "-vf", caps[0].filter.replace("fontfile=font.ttf", "fontfile=" + font).replace("textfile=cap0.txt", "textfile=" + capFile),
  "-an", "-t", "0.5",
]);

const two = [
  "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=1",
  "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=1",
  "-f", "lavfi", "-i", "testsrc2=size=320x568:rate=30:duration=1",
  "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1",
];
const xgraph =
  "[0:v][2:v]xfade=transition=wipeleft:duration=0.18:offset=0.8[v];[1:a][3:a]acrossfade=d=0.18[a]";
runFilter("nexa-xfade.mp4", [...two, "-filter_complex", xgraph, "-map", "[v]", "-map", "[a]"]);

console.log("editor-logic ok");
