// Funções puras do editor (sem ffmpeg e sem DOM), para o site e para teste.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NexaEditor = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const PRESETS = {
    futebol: {
      fmt: "9:16",
      fit: "crop",
      speed: 1,
      effect: "punch",
      trans: "flash",
      caption: "tiktok",
      audio: "music",
      fade: false,
    },
    curiosidade: {
      fmt: "9:16",
      fit: "blur",
      speed: 1,
      effect: "zoom",
      trans: "fade",
      caption: "tiktok",
      audio: "keep",
      fade: true,
    },
    gancho: {
      fmt: "9:16",
      fit: "crop",
      speed: 1.25,
      effect: "shake",
      trans: "flash",
      caption: "tiktok",
      audio: "music",
      fade: false,
    },
    limpo: {
      fmt: "9:16",
      fit: "crop",
      speed: 1,
      effect: "none",
      trans: "none",
      caption: "none",
      audio: "keep",
      fade: true,
    },
  };

  function round2(n) {
    return Math.round(Number(n) * 100) / 100;
  }

  function num(n) {
    const v = Math.round(Number(n) * 1000) / 1000;
    return String(Object.is(v, -0) ? 0 : v);
  }

  function even(n) {
    return Math.max(2, Math.round(Number(n) / 2) * 2);
  }

  function dims(fmt) {
    if (fmt === "9:16") return [720, 1280];
    if (fmt === "1:1") return [720, 720];
    if (fmt === "16:9") return [1280, 720];
    return null;
  }

  function wrap(text, maxChars) {
    const words = String(text || "")
      .split(/\s+/)
      .filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
      const next = cur ? cur + " " + w : w;
      if (cur && next.length > maxChars) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function splitPhrases(text, maxWords, maxPhrases) {
    const wordsPer = maxWords || 3;
    const cap = maxPhrases || 18;
    const lines = String(text || "")
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const phrases = [];
    for (const line of lines) {
      const words = line.replace(/^\d+[.)]\s*/, "").split(/\s+/).filter(Boolean);
      if (!words.length) continue;
      if (words.length <= wordsPer) phrases.push(words.join(" "));
      else {
        for (let i = 0; i < words.length; i += wordsPer) phrases.push(words.slice(i, i + wordsPer).join(" "));
      }
    }
    if (phrases.length <= cap) return phrases;
    const out = phrases.slice(0, cap - 1);
    out.push(phrases.slice(cap - 1).join(" "));
    return out;
  }

  function timePhrases(phrases, totalDur, marks) {
    const list = (phrases || []).map((p) => String(p || "").trim()).filter(Boolean);
    const dur = Number(totalDur);
    if (!list.length || !(dur > 0.05)) return [];
    let bounds = null;
    if (marks && marks.length > 2) {
      const m = marks.map(Number).filter((t) => Number.isFinite(t) && t >= -0.05 && t <= dur + 0.05);
      if (m.length >= 2) {
        if (m[0] > 0.05) m.unshift(0);
        if (dur - m[m.length - 1] > 0.05) m.push(dur);
        bounds = [];
        for (let i = 0; i < m.length - 1; i++) {
          if (m[i + 1] - m[i] >= 0.18) bounds.push([Math.max(0, m[i]), Math.min(dur, m[i + 1])]);
        }
      }
    }
    if (!bounds || bounds.length < list.length) {
      const slot = dur / list.length;
      return list.map((text, i) => ({
        text,
        start: round2(i * slot),
        end: round2(i === list.length - 1 ? dur : (i + 1) * slot),
      }));
    }
    const per = Math.max(1, Math.floor(bounds.length / list.length));
    return list.map((text, i) => {
      const a = Math.min(bounds.length - 1, i * per);
      const b = i === list.length - 1 ? bounds.length - 1 : Math.min(bounds.length - 1, (i + 1) * per - 1);
      return { text, start: round2(bounds[a][0]), end: round2(Math.max(bounds[a][0] + 0.05, bounds[b][1])) };
    });
  }

  function phrasesFromSegments(segments, totalDur) {
    const out = [];
    const limit = Number(totalDur) > 0 ? Number(totalDur) : Infinity;
    for (const seg of segments || []) {
      const text = String((seg && seg.text) || "").trim();
      if (!text) continue;
      const start = Math.max(0, Number(seg.start) || 0);
      let end = Number(seg.end) > start ? Number(seg.end) : start + 1.2;
      if (start >= limit) break;
      end = Math.min(end, limit);
      if (!(end > start)) continue;
      const parts = splitPhrases(text, 3, 6);
      const slot = (end - start) / parts.length;
      parts.forEach((p, i) => {
        out.push({ text: p, start: round2(start + i * slot), end: round2(start + (i + 1) * slot) });
      });
    }
    return out.slice(0, 18);
  }

  function layoutCaption(text, W, H, style) {
    const maxChars = style === "bar" ? 24 : style === "frase" ? 18 : 12;
    const maxLines = style === "frase" ? 4 : 2;
    const lines = wrap(String(text || "").toUpperCase(), maxChars).slice(0, maxLines);
    const shown = lines.length ? lines : [""];
    const longest = shown.reduce((m, l) => Math.max(m, l.length), 1);
    const byWidth = Math.floor((W * 0.88) / (longest * 0.72));
    const byHeight = Math.floor(H * (style === "bar" ? 0.046 : 0.068));
    const size = Math.max(32, Math.min(byWidth, byHeight, style === "bar" ? 54 : 86));
    return { lines: shown, size };
  }

  function captionPlan(phrases, width, height, style, pos) {
    const W = width || 720;
    const H = height || 1280;
    const look = style === "frase" ? "frase" : style === "bar" ? "bar" : "tiktok";
    return (phrases || []).map((p, i) => {
      const layout = layoutCaption(p.text, W, H, look);
      const border = Math.max(4, Math.round(layout.size / 8));
      const y =
        look === "bar" || (look === "frase" && pos === "bottom")
          ? "h*0.76-text_h"
          : look === "frase" && pos === "top"
            ? "h*0.1"
            : "(h-text_h)/2+h*0.02";
      const box =
        look === "bar"
          ? ":box=1:boxcolor=black@0.62:boxborderw=14"
          : ":borderw=" + border + ":bordercolor=black";
      const start = Math.max(0, Number(p.start) || 0);
      const end = Math.max(start + 0.08, Number(p.end) || start + 0.08);
      const filter =
        "drawtext=fontfile=font.ttf:textfile=cap" +
        i +
        ".txt:fontsize=" +
        layout.size +
        ":fontcolor=white:line_spacing=10:x=(w-text_w)/2:y=" +
        y +
        box +
        ":enable='between(t," +
        num(start) +
        "," +
        num(end) +
        ")'";
      return { name: "cap" + i + ".txt", body: layout.lines.join("\n"), filter, size: layout.size };
    });
  }

  function mergeGaps(beatTimes, minLen, maxSlices) {
    const gaps = [];
    const times = (beatTimes || []).map(Number).filter((t) => Number.isFinite(t));
    for (let i = 0; i < times.length - 1; i++) {
      const d = times[i + 1] - times[i];
      if (d > 0.04) gaps.push(d);
    }
    if (!gaps.length) return [];
    const mergeShortest = () => {
      let k = 0;
      for (let i = 1; i < gaps.length; i++) if (gaps[i] < gaps[k]) k = i;
      if (k < gaps.length - 1) {
        gaps[k] += gaps[k + 1];
        gaps.splice(k + 1, 1);
      } else {
        gaps[k - 1] += gaps[k];
        gaps.pop();
      }
    };
    let guard = 0;
    while (gaps.length > 1 && gaps.some((g) => g < minLen) && guard++ < 800) mergeShortest();
    while (gaps.length > maxSlices) mergeShortest();
    return gaps.map((g) => round2(g));
  }

  function buildBeatSlices(clips, beatTimes, opts) {
    const maxSlices = (opts && opts.maxSlices) || 12;
    const minLen = (opts && opts.minLen) || 0.34;
    const gaps = mergeGaps(beatTimes, minLen, maxSlices);
    const ranges = [];
    (clips || []).forEach((c, idx) => {
      const start = Math.max(0, Number(c.start) || 0);
      const end = Number(c.end) > start ? Number(c.end) : Number(c.dur) > start ? Number(c.dur) : 0;
      if (end > start + 0.08) ranges.push({ idx, start, end });
    });
    const slices = [];
    let ri = 0;
    let pos = ranges[0] ? ranges[0].start : 0;
    for (const gap of gaps) {
      while (ri < ranges.length && pos >= ranges[ri].end - 0.08) {
        ri++;
        pos = ranges[ri] ? ranges[ri].start : pos;
      }
      if (ri >= ranges.length) break;
      const avail = ranges[ri].end - pos;
      const take = Math.min(gap, avail);
      if (take < 0.2) {
        ri++;
        pos = ranges[ri] ? ranges[ri].start : pos;
        continue;
      }
      const end = round2(pos + take);
      slices.push({
        clipIndex: ranges[ri].idx,
        start: round2(pos),
        end,
        zoom: slices.length % 2 === 0 ? 1 : 1.15,
      });
      pos = end;
    }
    return slices;
  }

  function decodeWav(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!bytes || bytes.byteLength < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) return null;
  let offset = 12;
  let format = 0;
  let channels = 1;
  let rate = 44100;
  let bits = 16;
  let dataOffset = 0;
  let dataSize = 0;
  while (offset + 8 <= view.byteLength) {
    const id = view.getUint32(offset, false);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (id === 0x666d7420 && start + 16 <= view.byteLength) {
      format = view.getUint16(start, true);
      channels = view.getUint16(start + 2, true) || 1;
      rate = view.getUint32(start + 4, true) || 44100;
      bits = view.getUint16(start + 14, true);
    } else if (id === 0x64617461) {
      dataOffset = start;
      dataSize = Math.min(size, view.byteLength - start);
      break;
    }
    offset = start + size + (size % 2);
  }
  if (!dataSize || format !== 1 || (bits !== 16 && bits !== 8) || channels < 1) return null;
  const frame = (bits / 8) * channels;
  const count = Math.floor(dataSize / frame);
  const samples = new Float32Array(count);
  if (bits === 16) {
    for (let i = 0; i < count; i++) samples[i] = view.getInt16(dataOffset + i * frame, true) / 32768;
  } else {
    for (let i = 0; i < count; i++) samples[i] = (view.getUint8(dataOffset + i * frame) - 128) / 128;
  }
  return { samples, sampleRate: rate };
}

function detectBeats(samples, sampleRate, opts) {
    const minGap = (opts && opts.minGap) || 0.3;
    const maxGap = (opts && opts.maxGap) || 1.2;
    const sr = sampleRate || 44100;
    const hop = Math.max(1, Math.floor(sr * 0.01));
    const win = Math.max(hop, Math.floor(sr * 0.03));
    const n = samples.length;
    const energies = [];
    for (let i = 0; i + win < n; i += hop) {
      let s = 0;
      let c = 0;
      for (let j = 0; j < win; j += 4) {
        const v = samples[i + j];
        s += v * v;
        c++;
      }
      energies.push(c ? s / c : 0);
    }
    const flux = new Array(energies.length);
    flux[0] = 0;
    for (let i = 1; i < energies.length; i++) flux[i] = Math.max(0, energies[i] - energies[i - 1]);
    const duration = n / sr;
    const beats = [0];
    let last = 0;
    for (let i = 2; i < flux.length - 1; i++) {
      const t = (i * hop) / sr;
      const from = Math.max(0, i - 50);
      let avg = 0;
      for (let k = from; k < i; k++) avg += flux[k];
      avg /= i - from || 1;
      const peak = flux[i] >= flux[i - 1] && flux[i] > flux[i + 1] && flux[i] > avg * 1.5 && flux[i] > 1e-8;
      if (peak && t - last >= minGap) {
        beats.push(round2(t));
        last = t;
      } else if (t - last >= maxGap) {
        beats.push(round2(t));
        last = t;
      }
    }
    if (duration - last > 0.15) beats.push(round2(duration));
    else beats[beats.length - 1] = round2(Math.max(last, duration));
    return beats;
  }

  function outputDuration(clips, speed) {
    const sp = Number(speed) > 0 ? Number(speed) : 1;
    let seconds = 0;
    let known = true;
    for (const c of clips || []) {
      const start = Math.max(0, Number(c.start) || 0);
      const end = Number(c.end) > start ? Number(c.end) : Number(c.dur) > start ? Number(c.dur) : 0;
      if (!(end > start)) known = false;
      else seconds += (end - start) / sp;
    }
    return { seconds, known: known && seconds > 0.05 };
  }

  function scaleMarks(marks, realDur) {
    if (!marks || marks.length < 2) return marks || [];
    const est = Number(marks[marks.length - 1]);
    const real = Number(realDur);
    if (!(est > 0) || !(real > 0)) return marks.map((m) => round2(m));
    const k = real / est;
    return marks.map((m) => round2(Number(m) * k));
  }

  function timelineMarks(clips, speed) {
    const sp = Number(speed) > 0 ? Number(speed) : 1;
    const marks = [0];
    let t = 0;
    for (const c of clips || []) {
      const start = Math.max(0, Number(c.start) || 0);
      const end = Number(c.end) > start ? Number(c.end) : Number(c.dur) > start ? Number(c.dur) : start;
      t += Math.max(0, end - start) / sp;
      marks.push(round2(t));
    }
    return marks;
  }

  function videoChain(o) {
    const speed = Number(o.speed) > 0 ? Number(o.speed) : 1;
const effect = o.effect || "none";
  const requested = Number(o.punch);
  const punch = requested > 1 ? requested : requested === 1 ? 1 : effect === "punch" ? 1.12 : 1;
    const W = o.W;
    const H = o.H;
    const sp = speed !== 1 ? ",setpts=PTS/" + num(speed) : "";
    const fl = o.flash ? ",fade=t=in:st=0:d=0.07:color=white" : "";
    const tail = fl + sp + ",fps=30,format=yuv420p";
    if (!W || !H) return "scale=trunc(min(iw\\,1280)/2)*2:-2,setsar=1" + tail;
    if (o.fit === "pad" && effect === "none") {
      return "scale=" + W + ":" + H + ":force_original_aspect_ratio=decrease,pad=" + W + ":" + H + ":(ow-iw)/2:(oh-ih)/2:black,setsar=1" + tail;
    }
    if (effect === "zoom") {
      const ZW = even(W * 1.22);
      const ZH = even(H * 1.22);
      return (
        "scale=" + ZW + ":" + ZH + ":force_original_aspect_ratio=increase,crop=w='" +
        W + "+" + (ZW - W) + "*(1-min(t/5\\,1))':h='" + H + "+" + (ZH - H) +
        "*(1-min(t/5\\,1))':x='(in_w-out_w)/2':y='(in_h-out_h)/2',scale=" + W + ":" + H + ",setsar=1" + tail
      );
    }
    if (effect === "shake") {
      const ZW = even(W * 1.12);
      const ZH = even(H * 1.12);
      return (
        "scale=" + ZW + ":" + ZH + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H +
        ":x='(in_w-" + W + ")/2+16*sin(55*t)*exp(-4*t)':y='(in_h-" + H + ")/2+12*cos(48*t)*exp(-4*t)',setsar=1" + tail
      );
    }
    if (punch > 1.01) {
      const ZW = even(W * punch);
      const ZH = even(H * punch);
      return (
        "scale=" + ZW + ":" + ZH + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H +
        ":(in_w-" + W + ")/2:(in_h-" + H + ")/2,setsar=1" + tail
      );
    }
    return "scale=" + W + ":" + H + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H + ",setsar=1" + tail;
  }

function blurFilter(W, H, speed, flash, effect, range) {
  const sp = Number(speed) !== 1 ? ",setpts=PTS/" + num(speed || 1) : "";
  const fl = flash ? ",fade=t=in:st=0:d=0.07:color=white" : "";
  const start = range ? Math.max(0, Number(range.start) || 0) : 0;
  const end = range && Number(range.end) > start ? Number(range.end) : 0;
  const head =
    end > start
      ? "[0:v]trim=start=" + num(start) + ":end=" + num(end) + ",setpts=PTS-STARTPTS,split=2[a][b];"
      : start > 0
        ? "[0:v]trim=start=" + num(start) + ",setpts=PTS-STARTPTS,split=2[a][b];"
        : "[0:v]split=2[a][b];";
  let after = "setsar=1";
  if (effect === "zoom") {
    const ZW = even(W * 1.18);
    const ZH = even(H * 1.18);
    after =
      "scale=" + ZW + ":" + ZH + ",crop=w='" + W + "+" + (ZW - W) + "*(1-min(t/6\\,1))':h='" +
      H + "+" + (ZH - H) + "*(1-min(t/6\\,1))':x='(in_w-out_w)/2':y='(in_h-out_h)/2',scale=" +
      W + ":" + H + ",setsar=1";
  } else if (effect === "punch") {
    const ZW = even(W * 1.08);
    const ZH = even(H * 1.08);
    after = "scale=" + ZW + ":" + ZH + ",crop=" + W + ":" + H + ",setsar=1";
  }
  return (
    head + "[a]scale=" + W + ":" + H + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H +
    ",boxblur=20:2[bg];[b]scale=" + W + ":" + H + ":force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2," +
    after + fl + sp + ",fps=30,format=yuv420p[v]"
  );
}

  function rangeOf(slice) {
    const start = Math.max(0, Number(slice.start) || 0);
    const end = Number(slice.end) > start ? Number(slice.end) : 0;
    return { start, end };
  }

  function trimPart(src, start, end) {
    if (end > start) return src + "trim=start=" + num(start) + ":end=" + num(end) + ",setpts=PTS-STARTPTS";
    if (start > 0) return src + "trim=start=" + num(start) + ",setpts=PTS-STARTPTS";
    return src + "setpts=PTS-STARTPTS";
  }

  function audioTrim(src, start, end, speed) {
    const sp = Number(speed) > 0 ? Number(speed) : 1;
    const at = sp === 1 ? "anull" : "atempo=" + num(sp);
    if (end > start) {
      return src + "atrim=start=" + num(start) + ":end=" + num(end) + ",asetpts=PTS-STARTPTS," + at + ",aresample=44100";
    }
    const head = start > 0 ? src + "atrim=start=" + num(start) + ",asetpts=PTS-STARTPTS," : src + "asetpts=PTS-STARTPTS,";
    return head + at + ",aresample=44100";
  }

  function sliceFilter(slices, ctx) {
    const n = (slices || []).length;
    if (!n) return "";
    const speed = Number(ctx.speed) > 0 ? Number(ctx.speed) : 1;
    const parts = [];
    if (n > 1) {
      parts.push("[0:v]split=" + n + slices.map((_, i) => "[sv" + i + "]").join(""));
      const src = ctx.hasAudio ? "[0:a]" : "[1:a]";
      parts.push(src + "asplit=" + n + slices.map((_, i) => "[sa" + i + "]").join(""));
    }
    const vs = [];
    const as = [];
    slices.forEach((s, i) => {
      const srcV = n === 1 ? "[0:v]" : "[sv" + i + "]";
      const srcA = n === 1 ? (ctx.hasAudio ? "[0:a]" : "[1:a]") : "[sa" + i + "]";
      const { start, end } = rangeOf(s);
      const flash = !!ctx.flash && (Number(ctx.ordinal) || 0) + i > 0;
      const punch = s.zoom != null ? Number(s.zoom) : ctx.effect === "punch" ? 1.12 : 1;
      const chain = videoChain({
        W: ctx.W,
        H: ctx.H,
        fit: ctx.fit,
        speed,
        effect: ctx.effect,
        punch,
        flash,
      });
      parts.push(trimPart(srcV, start, end) + "," + chain + "[v" + i + "]");
      if (ctx.hasAudio) parts.push(audioTrim(srcA, start, end, speed) + "[a" + i + "]");
      else {
        const dur = end > start ? Math.max(0.1, (end - start) / speed) : 600;
        parts.push(srcA + "atrim=start=0:end=" + num(dur) + ",asetpts=PTS-STARTPTS,aresample=44100[a" + i + "]");
      }
      vs.push("[v" + i + "]");
      as.push("[a" + i + "]");
    });
    parts.push(vs.join("") + "concat=n=" + n + ":v=1:a=0[v]");
    parts.push(as.join("") + "concat=n=" + n + ":v=0:a=1[a]");
    return parts.join(";");
  }

  function xfadeFilter(durations, transition) {
    const map = { fade: "fade", wipe: "wipeleft", slide: "slideleft" };
    const name = map[transition];
    if (!name || !durations || durations.length < 2) return null;
    const d = transition === "fade" ? 0.28 : 0.18;
    if (durations.some((x) => !(x > d + 0.15))) return null;
    const v = [];
    const a = [];
    let lastV = "[0:v]";
    let lastA = "[0:a]";
    let offset = durations[0] - d;
    for (let i = 1; i < durations.length; i++) {
      const outV = i === durations.length - 1 ? "[v]" : "[vx" + i + "]";
      const outA = i === durations.length - 1 ? "[a]" : "[ax" + i + "]";
      v.push(lastV + "[" + i + ":v]xfade=transition=" + name + ":duration=" + num(d) + ":offset=" + num(offset) + outV);
      a.push(lastA + "[" + i + ":a]acrossfade=d=" + num(d) + outA);
      lastV = outV;
      lastA = outA;
      offset += durations[i] - d;
    }
    return { filter: v.concat(a).join(";"), overlap: d * (durations.length - 1) };
  }

  function scheduleWithHook(lines, total, hookSec) {
  const list = (lines || []).map((s) => String(s || "").trim()).filter(Boolean).slice(0, 8);
  const dur = Number(total);
  if (!list.length || !(dur > 0.3)) return [];
  const hookEnd = Math.min(Math.max(1.2, Number(hookSec) || 2), Math.max(1.2, dur * 0.45));
  const out = [{ text: list[0], start: 0, end: round2(list.length === 1 ? dur : hookEnd) }];
  const rest = list.slice(1);
  if (!rest.length) return out;
  const span = Math.max(0.3, dur - out[0].end);
  const slot = span / rest.length;
  rest.forEach((text, i) => {
    const start = out[0].end + i * slot;
    const end = i === rest.length - 1 ? dur : out[0].end + (i + 1) * slot;
    out.push({ text, start: round2(start), end: round2(Math.max(start + 0.2, end)) });
  });
  return out;
}

function shortenWords(text, max) {
  return String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean).slice(0, max).join(" ");
}

function factsFromSummary(theme, extract) {
  const clean = String(extract || "").replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 25);
  const facts = [];
  for (const s of sentences) {
    const short = shortenWords(s.replace(/[.!?]+$/, ""), 6);
    if (short && !facts.some((f) => f.toLowerCase() === short.toLowerCase())) facts.push(short);
    if (facts.length === 5) break;
  }
  const extra = ["VALE SABER", "OLHA SÓ", "QUASE NINGUÉM SABE", "E TEM MAIS", "NO FINAL"];
  while (facts.length < 5) facts.push(extra[facts.length]);
  return { hook: "VOCÊ SABIA", facts: facts.slice(0, 5) };
}

function fallbackPost(kind, subject, hook) {
  const name = String(subject || "").trim() || "isso";
  const h = String(hook || "").trim();
  const slug = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  const tag = slug ? "#" + slug : kind === "futebol" ? "#craque" : "#conhecimento";
  if (kind === "futebol") {
    return {
      text: (h ? h + ". " : "") + "Os lances de " + name + " que você precisa ver.",
      tags: ["#futebol", "#futeboltiktok", "#edits", "#skills", tag, "#gol", "#tiktokbrasil", "#viral"],
    };
  }
  return {
    text: (h ? h + ". " : "") + "Fatos sobre " + name + " que quase ninguém conta.",
    tags: ["#curiosidades", "#vocesabia", "#aprenda", "#fatos", tag, "#tiktok", "#interessante", "#viral"],
  };
}

function parsePost(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const tags = raw.match(/#[\p{L}\p{N}_]+/gu) || [];
  const unique = [];
  tags.forEach((t) => {
    if (!unique.some((u) => u.toLowerCase() === t.toLowerCase())) unique.push(t);
  });
  const body = raw.replace(/#[\p{L}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim();
  if (body.length < 8 || unique.length < 5) return null;
  return { text: body, tags: unique.slice(0, 8) };
}

function encodeWavPcm(pcm, sampleRate) {
  const n = pcm.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, "RIFF");
  v.setUint32(4, 36 + n * 2, true);
  s(8, "WAVE");
  s(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  s(36, "data");
  v.setUint32(40, n * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

/** Batida sintética original (não é música de terceiros). 120 BPM, grave a cada tempo. */
function makeBeatWav(seconds, bpm) {
  const sr = 22050;
  const dur = Math.max(8, Math.min(40, Number(seconds) || 32));
  const tempo = Math.max(90, Math.min(150, Number(bpm) || 120));
  const beat = 60 / tempo;
  const n = Math.floor(sr * dur);
  const pcm = new Int16Array(n);
  let noise = 1;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const pos = t % beat;
    let amp = 0;
    if (pos < 0.1) amp += Math.sin(2 * Math.PI * 70 * pos) * Math.exp(-24 * pos);
    const hat = (t + beat * 0.5) % beat;
    if (hat < 0.02) {
      noise = (noise * 1103515245 + 12345) & 0x7fffffff;
      amp += ((noise / 0x7fffffff) * 2 - 1) * Math.exp(-hat * 100) * 0.45;
    }
    pcm[i] = Math.max(-32767, Math.min(32767, Math.round(amp * 28000)));
  }
  return encodeWavPcm(pcm, sr);
}

function fallbackCaptions(name) {
  const n = String(name || "ELE").trim().replace(/\s+/g, " ").slice(0, 18).toUpperCase() || "ELE";
  return [n + " CHEGOU", "OLHA ESSE LANCE", "NINGUÉM SEGURA", "QUE JOGADA", "NO FINAL"];
}

function parseCaptionLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((s) => s.replace(/^\d+[.)\-\s]+/, "").replace(/^[-*•]\s*/, "").replace(/[*_#"]/g, "").trim())
    .filter((s) => s && s.length <= 42 && s.split(/\s+/).length <= 6 && !/https?:/i.test(s))
    .slice(0, 5);
}

/**
 * Distribui os clipes no ritmo até cerca de 30 s.
 * Cada corte vem do próximo clipe, em rodízio, para todos aparecerem.
 */
function planFootballEdit(clips, beatTimes, opts) {
  const target = (opts && opts.target) || 30;
  const maxSlices = (opts && opts.maxSlices) || 12;
  const ranges = [];
  (clips || []).forEach((c, idx) => {
    const start = Math.max(0, Number(c.start) || 0);
    let end = Number(c.end) > start ? Number(c.end) : Number(c.dur) > start ? Number(c.dur) : 0;
    if (!(end > start + 0.25)) end = start + 6;
    ranges.push({ idx, start, end, pos: start });
  });
  if (!ranges.length) return [];
  let gaps = mergeGaps(beatTimes, 0.28, 200);
  if (!gaps.length) gaps = [2, 2, 2, 2, 2, 2];
  const trimmed = [];
  let acc = 0;
  for (const g of gaps) {
    if (acc >= target - 0.25) break;
    const piece = Math.min(g, round2(target - acc));
    if (piece >= 0.35) {
      trimmed.push(piece);
      acc += piece;
    }
  }
  const use = trimmed.length ? trimmed : gaps.slice();
  const mergeShortest = () => {
    let k = 0;
    for (let i = 1; i < use.length; i++) if (use[i] < use[k]) k = i;
    if (k < use.length - 1) {
      use[k] += use[k + 1];
      use.splice(k + 1, 1);
    } else if (use.length > 1) {
      use[k - 1] += use[k];
      use.pop();
    }
  };
  while (use.length > maxSlices) mergeShortest();
  const slices = [];
  let cursor = 0;
  for (const gap of use) {
    let placed = false;
    for (let attempt = 0; attempt < ranges.length; attempt++) {
      const r = ranges[cursor % ranges.length];
      cursor++;
      if (r.end - r.pos < 0.35) r.pos = r.start;
      const take = Math.min(gap, r.end - r.pos);
      if (take < 0.35) continue;
      const end = round2(Math.min(r.end, r.pos + take));
      slices.push({
        clipIndex: r.idx,
        start: round2(r.pos),
        end,
        zoom: slices.length % 2 === 0 ? 1 : 1.15,
      });
      r.pos = end;
      if (r.pos >= r.end - 0.2) r.pos = r.start;
      placed = true;
      break;
    }
    if (!placed) break;
  }
  return slices;
}

  return {
    PRESETS,
    dims,
    even,
    splitPhrases,
    timePhrases,
    phrasesFromSegments,
    layoutCaption,
    captionPlan,
    decodeWav,
    detectBeats,
    buildBeatSlices,
    mergeGaps,
    outputDuration,
    scaleMarks,
    timelineMarks,
    videoChain,
    blurFilter,
    sliceFilter,
    xfadeFilter,
    encodeWavPcm,
    makeBeatWav,
    fallbackCaptions,
    parseCaptionLines,
    planFootballEdit,
    scheduleWithHook,
    factsFromSummary,
    fallbackPost,
    parsePost,
  };
});
