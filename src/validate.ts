import { initial, type Project } from "./model";
const finite = (x: unknown, a: number, b: number) =>
  typeof x === "number" && Number.isFinite(x) && x >= a && x <= b;
export function validateProject(v: unknown): Project {
  const p = v as Project;
  if (
    !p ||
    typeof p !== "object" ||
    !finite(p.duration, 0, 86400) ||
    !Array.isArray(p.segments) ||
    !Array.isArray(p.captions) ||
    !p.style ||
    !p.assignments
  )
    throw new Error("This is not a valid BNedits project.");
  if (p.segments.length > 1000 || p.captions.length > 10000)
    throw new Error("Project exceeds safe editing limits.");
  let previous = 0;
  for (const s of p.segments) {
    if (
      !finite(s.start, previous, p.duration) ||
      !finite(s.end, s.start + 0.001, p.duration)
    )
      throw new Error("Invalid or overlapping clip ranges.");
    previous = s.end;
  }
  for (const c of p.captions)
    if (
      typeof c.id !== "string" ||
      typeof c.text !== "string" ||
      c.text.length > 10000 ||
      !finite(c.start, 0, 86400) ||
      !finite(c.end, c.start + 0.001, 86400)
    )
      throw new Error("Invalid caption text or timestamps.");
  for (const a of Object.values(p.assignments))
    if (
      !a ||
      !/^\/assets\/faces\/[a-z]+-\d{2}\.svg$/.test(a.asset) ||
      !finite(a.x, -0.3, 0.3) ||
      !finite(a.y, -0.3, 0.3) ||
      !finite(a.scale, 0.5, 2.5) ||
      !finite(a.rotation, -90, 90)
    )
      throw new Error("Invalid face settings.");
  if (
    ![480, 720, 1080].includes(p.resolution) ||
    ![24, 25, 30, 60].includes(p.fps) ||
    !["mp4", "webm"].includes(p.format) ||
    !["9:16", "1:1", "16:9", "original"].includes(p.ratio)
  )
    throw new Error("Invalid export settings.");
  for (const key of [
    "voiceVolume",
    "musicVolume",
    "musicStart",
    "musicEnd",
    "fade",
    "intensity",
  ] as const)
    if (
      !finite(
        p[key],
        0,
        key === "musicEnd" || key === "musicStart"
          ? 3600
          : 2 + (key === "fade" ? 3 : 0),
      )
    )
      throw new Error("Invalid audio or filter settings.");
  function validStyle(s: any) {
    return (
      s &&
      Object.keys(s).every((k) =>
        [
          "font",
          "color",
          "stroke",
          "background",
          "animation",
          "size",
          "x",
          "y",
          "align",
        ].includes(k),
      ) &&
      (!("font" in s) || typeof s.font === "string") &&
      (!("size" in s) || finite(s.size, 16, 100)) &&
      (!("x" in s) || finite(s.x, 0, 1)) &&
      (!("y" in s) || finite(s.y, 0, 1))
    );
  }
  if (
    !validStyle(p.style) ||
    p.captions.some((c) => c.style && !validStyle(c.style))
  )
    throw new Error("Invalid caption styling.");
  for (const k of ["name", "fileName", "music", "voice", "filter"] as const)
    if (typeof p[k] !== "string" || p[k].length > 500)
      throw new Error("Invalid project metadata.");
  return { ...structuredClone(initial), ...p };
}
