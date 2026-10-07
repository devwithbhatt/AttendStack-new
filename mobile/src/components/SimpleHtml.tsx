import React from "react";
import { Text, View, StyleSheet, type TextStyle } from "react-native";
import { colors, fonts } from "../theme";

// A small renderer for the rich text the web editor saves (rulebook):
// headings, paragraphs, lists, bold/italic/underline and line breaks.
// Anything else is shown as plain text — never executed.

interface Span {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface Block {
  kind: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "li";
  marker?: string;
  depth: number;
  spans: Span[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function decode(s: string) {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (ENTITIES[e.toLowerCase()] !== undefined) return ENTITIES[e.toLowerCase()];
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return m;
  });
}

export function parseHtml(html: string): Block[] {
  const blocks: Block[] = [];
  const lists: Array<{ ordered: boolean; n: number }> = [];
  const inline = { bold: 0, italic: 0, underline: 0 };
  let current: Block | null = null;

  const flush = () => {
    if (current && current.spans.some((s) => s.text.trim())) blocks.push(current);
    current = null;
  };
  const ensure = () => {
    if (!current) current = { kind: "p", depth: lists.length, spans: [] };
    return current;
  };

  const re = /<(\/?)([a-zA-Z0-9]+)[^>]*>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, closing, rawTag, text] = m;
    if (text !== undefined) {
      const t = decode(text.replace(/\s+/g, " "));
      if (t.trim() || (current && t)) ensure().spans.push({ text: t, bold: inline.bold > 0, italic: inline.italic > 0, underline: inline.underline > 0 });
      continue;
    }
    const tag = rawTag.toLowerCase();
    const open = !closing;
    if (/^h[1-6]$/.test(tag) || tag === "p" || tag === "div" || tag === "blockquote") {
      flush();
      if (open) current = { kind: tag === "div" || tag === "blockquote" ? "p" : (tag as Block["kind"]), depth: lists.length, spans: [] };
    } else if (tag === "ul" || tag === "ol") {
      flush();
      if (open) lists.push({ ordered: tag === "ol", n: 0 });
      else lists.pop();
    } else if (tag === "li") {
      flush();
      if (open) {
        const list = lists[lists.length - 1];
        if (list) list.n += 1;
        current = { kind: "li", depth: Math.max(lists.length - 1, 0), marker: list?.ordered ? `${list.n}.` : "•", spans: [] };
      }
    } else if (tag === "br") {
      ensure().spans.push({ text: "\n", bold: false, italic: false, underline: false });
    } else if (tag === "strong" || tag === "b") {
      inline.bold += open ? 1 : -1;
    } else if (tag === "em" || tag === "i") {
      inline.italic += open ? 1 : -1;
    } else if (tag === "u") {
      inline.underline += open ? 1 : -1;
    }
  }
  flush();
  return blocks;
}

const HEADING: Record<string, TextStyle> = {
  h1: { fontSize: 22 },
  h2: { fontSize: 19 },
  h3: { fontSize: 17 },
  h4: { fontSize: 16 },
  h5: { fontSize: 15 },
  h6: { fontSize: 14 },
};

export function SimpleHtml({ html }: { html: string }) {
  const blocks = parseHtml(html || "");
  return (
    <View>
      {blocks.map((b, i) => {
        const spans = b.spans.map((s, j) => (
          <Text
            key={j}
            style={[s.bold && { fontFamily: fonts.bold }, s.italic && { fontStyle: "italic" }, s.underline && { textDecorationLine: "underline" }]}
          >
            {s.text}
          </Text>
        ));
        if (b.kind === "li") {
          return (
            <View key={i} style={[styles.li, { marginLeft: 8 + b.depth * 16 }]}>
              <Text style={styles.marker}>{b.marker}</Text>
              <Text style={[styles.p, { flex: 1, marginTop: 0 }]}>{spans}</Text>
            </View>
          );
        }
        if (b.kind === "p") return <Text key={i} style={styles.p}>{spans}</Text>;
        return (
          <Text key={i} style={[styles.h, HEADING[b.kind]]}>
            {spans}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: fonts.bold, color: colors.text, marginTop: 18, marginBottom: 4 },
  p: { fontSize: 14, fontFamily: fonts.regular, color: colors.text, lineHeight: 21, marginTop: 8 },
  li: { flexDirection: "row", marginTop: 6 },
  marker: { width: 22, fontSize: 14, fontFamily: fonts.semiBold, color: colors.primaryDark, lineHeight: 21 },
});
