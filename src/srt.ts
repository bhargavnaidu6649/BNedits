import type { Caption } from "./model";
function seconds(t: string) {
  const m = t.trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m || +m[2] > 59 || +m[3] > 59) return NaN;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
}
export function parseSrt(text: string): Caption[] {
  return text
    .replace(/\r/g, "")
    .trim()
    .split(/\n\s*\n/)
    .flatMap((block, i) => {
      const lines = block.split("\n");
      const at = lines.findIndex((l) => l.includes("-->"));
      if (at < 0) return [];
      const [a, b] = lines[at].split("-->");
      const start = seconds(a),
        end = seconds(b);
      const text = lines
        .slice(at + 1)
        .join("\n")
        .trim();
      return Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end > start &&
        text
        ? [{ id: `srt-${i}-${Date.now()}`, start, end, text }]
        : [];
    });
}
function stamp(n: number) {
  const ms = Math.max(0, Math.round(n * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
export function toSrt(c: Caption[]) {
  return [...c]
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`)
    .join("\n\n");
}
