import React from "react";
import { Linking, Platform, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

// Markdown simples: títulos, listas, **negrito**, *itálico*, `código`, blocos ``` e links.

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*[^*\n]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) {
      out.push(<Text key={k} style={s.bold}>{tok.slice(2, -2)}</Text>);
    } else if (tok.startsWith("`")) {
      out.push(<Text key={k} style={s.code}>{tok.slice(1, -1)}</Text>);
    } else if (tok.startsWith("[")) {
      const lm = tok.match(/^\[([^\]]+)\]\((.+)\)$/);
      if (lm) {
        const url = lm[2];
        out.push(
          <Text key={k} style={s.link} onPress={() => Linking.openURL(url)}>
            {lm[1]}
          </Text>
        );
      } else out.push(tok);
    } else {
      out.push(<Text key={k} style={s.italic}>{tok.slice(1, -1)}</Text>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Aumenta fontSize/lineHeight de um estilo (usado na opção "Letra grande"). */
function sc(style: any, k: number): any {
  if (k === 1) return style;
  const f = StyleSheet.flatten(style) || {};
  return [style, { fontSize: f.fontSize ? f.fontSize * k : undefined, lineHeight: f.lineHeight ? f.lineHeight * k : undefined }];
}

export default function Markdown({ text, scale = 1 }: { text: string; scale?: number }) {
  const k = scale;
  const blocks: React.ReactNode[] = [];
  const parts = text.split("```");
  let key = 0;

  parts.forEach((part, pi) => {
    if (pi % 2 === 1) {
      const code = part.replace(/^\w*\n/, "").replace(/\n$/, "");
      blocks.push(
        <View key={key++} style={s.pre}>
          <Text style={sc(s.preText, k)} selectable>{code}</Text>
        </View>
      );
      return;
    }
    const lines = part.split("\n");
    let para: string[] = [];
    const flush = () => {
      if (!para.length) return;
      const t = para.join("\n");
      blocks.push(
        <Text key={key++} style={sc(s.p, k)} selectable>
          {renderInline(t, `p${key}`)}
        </Text>
      );
      para = [];
    };
    for (const line of lines) {
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^#{1,3}\s+(.*)/))) {
        flush();
        blocks.push(
          <Text key={key++} style={sc(s.h, k)} selectable>{renderInline(m[1], `h${key}`)}</Text>
        );
      } else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
        flush();
        blocks.push(
          <View key={key++} style={s.li}>
            <Text style={sc(s.bullet, k)}>•</Text>
            <Text style={sc(s.liText, k)} selectable>{renderInline(m[1], `l${key}`)}</Text>
          </View>
        );
      } else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) {
        flush();
        blocks.push(
          <View key={key++} style={s.li}>
            <Text style={sc(s.num, k)}>{m[1]}.</Text>
            <Text style={sc(s.liText, k)} selectable>{renderInline(m[2], `n${key}`)}</Text>
          </View>
        );
      } else if (!line.trim()) {
        flush();
      } else {
        para.push(line);
      }
    }
    flush();
  });

  return <View style={{ gap: 8 }}>{blocks}</View>;
}

const base = { color: colors.text, fontSize: 15.5, lineHeight: 23 };
const s = StyleSheet.create({
  p: base,
  h: { ...base, fontWeight: "700", fontSize: 17, marginTop: 4 },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  code: {
    backgroundColor: colors.panel2,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 14,
  },
  link: { color: colors.accent, textDecorationLine: "underline" },
  li: { flexDirection: "row", gap: 8, paddingLeft: 4 },
  bullet: { ...base, color: colors.accent },
  num: { ...base, color: colors.accent, minWidth: 18 },
  liText: { ...base, flex: 1 },
  pre: {
    backgroundColor: "#0c0c14",
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  preText: {
    color: colors.text,
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
});
