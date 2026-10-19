import type { Project } from "./model";
import type { TrackedFace } from "./engine/tracking";
import { filters } from "./catalog";
const images = new Map<string, HTMLImageElement>();
export async function preloadFace(src: string) {
  if (images.has(src)) return;
  const im = new Image();
  im.src = src;
  await im.decode();
  images.set(src, im);
}
export function dimensions(
  video: HTMLVideoElement,
  height: number,
  ratio: string,
) {
  let r = video.videoWidth / video.videoHeight || 16 / 9;
  if (ratio !== "original") {
    const [w, h] = ratio.split(":").map(Number);
    r = w / h;
  }
  return r >= 1
    ? { width: Math.round((height * r) / 2) * 2, height }
    : { width: height, height: Math.round(height / r / 2) * 2 };
}
export function compose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  p: Project,
  faces: TrackedFace[],
  time: number,
) {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#090909";
  ctx.fillRect(0, 0, w, h);
  if (video.readyState < 2) return;
  const scale = Math.min(w / video.videoWidth, h / video.videoHeight),
    dw = video.videoWidth * scale,
    dh = video.videoHeight * scale,
    dx = (w - dw) / 2,
    dy = (h - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
  const filter = filters.find((f) => f.id === p.filter)?.filter || "none";
  if (filter !== "none") {
    ctx.save();
    ctx.globalAlpha = p.intensity;
    ctx.filter = filter;
    ctx.drawImage(video, dx, dy, dw, dh);
    ctx.restore();
  }
  for (const face of faces) {
    const a = p.assignments[face.id];
    if (!a || !face.opacity) continue;
    const image = images.get(a.asset);
    if (!image) continue;
    ctx.save();
    ctx.globalAlpha = face.opacity;
    ctx.translate(dx + face.x * dw + a.x * dw, dy + face.y * dh + a.y * dh);
    ctx.rotate(face.roll + (a.rotation * Math.PI) / 180);
    const fw = face.width * dw * a.scale * 1.45,
      fh = face.height * dh * a.scale * 1.45;
    ctx.transform(
      Math.max(0.45, Math.cos(face.yaw)),
      Math.sin(face.pitch) * 0.08,
      Math.sin(face.yaw) * 0.08,
      Math.max(0.65, Math.cos(face.pitch)),
      0,
      0,
    );
    ctx.shadowColor = "rgba(0,0,0,.2)";
    ctx.shadowBlur = Math.max(2, fw * 0.018);
    ctx.drawImage(image, -fw / 2, -fh / 2, fw, fh);
    if (a.mouth && face.mouth > 0.12) {
      ctx.fillStyle = "#35121b";
      ctx.beginPath();
      ctx.ellipse(
        0,
        fh * 0.2,
        fw * 0.065,
        fh * Math.min(0.085, face.mouth * 0.12),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.restore();
  }
  for (const cap of p.captions.filter((c) => time >= c.start && time < c.end)) {
    const s = { ...p.style, ...cap.style };
    ctx.save();
    const elapsed = time - cap.start,
      progress = Math.max(
        0,
        Math.min(1, elapsed / Math.max(0.01, cap.end - cap.start)),
      );
    let text = cap.text;
    if (s.animation === "typewriter")
      text = text.slice(
        0,
        Math.max(1, Math.ceil(progress * text.length * 1.5)),
      );
    ctx.globalAlpha =
      s.animation === "fade"
        ? Math.min(1, elapsed * 6, (cap.end - time) * 6)
        : 1;
    const size = (s.size * h) / 720;
    ctx.translate(s.x * w, s.y * h);
    if (s.animation === "pop") {
      const pop = Math.min(1, elapsed * 8);
      ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
    }
    if (s.animation === "bounce")
      ctx.translate(
        0,
        -Math.abs(Math.sin(elapsed * 9)) *
          size *
          0.14 *
          Math.max(0, 1 - elapsed),
      );
    ctx.font = `800 ${size}px ${s.font}`;
    ctx.textAlign = s.align;
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    const lines: string[] = [];
    for (const raw of text.split("\n")) {
      let line = "";
      for (const word of raw.split(" ")) {
        if (ctx.measureText(line + " " + word).width > w * 0.86 && line) {
          lines.push(line);
          line = word;
        } else line += (line ? " " : "") + word;
      }
      lines.push(line);
    }
    let wordIndex = 0;
    const activeWord = Math.min(
      text.trim().split(/\s+/).length - 1,
      Math.floor(progress * text.trim().split(/\s+/).length),
    );
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * size * 1.25;
      const width = ctx.measureText(line).width;
      const x =
        s.align === "left" ? 0 : s.align === "right" ? -width : -width / 2;
      if (s.background && s.background !== "transparent") {
        ctx.fillStyle = s.background;
        ctx.fillRect(
          x - size * 0.25,
          y - size * 0.65,
          width + size * 0.5,
          size * 1.3,
        );
      }
      if (s.stroke && s.stroke !== "transparent") {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = size * 0.1;
        ctx.strokeText(line, 0, y);
      }
      if (s.animation === "highlight") {
        ctx.save();
        ctx.textAlign = "left";
        let cursor = x;
        for (const word of line.split(" ")) {
          ctx.fillStyle = wordIndex++ === activeWord ? "#ffe568" : s.color;
          ctx.fillText(word, cursor, y);
          cursor += ctx.measureText(word + " ").width;
        }
        ctx.restore();
      } else {
        ctx.fillStyle = s.color;
        ctx.fillText(line, 0, y);
      }
    });
    ctx.restore();
  }
}
