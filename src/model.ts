export type Caption = {
  id: string;
  start: number;
  end: number;
  text: string;
  style?: Partial<CaptionStyle>;
};
export type CaptionStyle = {
  font: string;
  color: string;
  stroke: string;
  background: string;
  animation: string;
  size: number;
  x: number;
  y: number;
  align: CanvasTextAlign;
};
export type Assignment = {
  asset: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  mouth: boolean;
};
export type Project = {
  name: string;
  fileName: string;
  fileSize: number;
  duration: number;
  segments: { start: number; end: number }[];
  filter: string;
  intensity: number;
  voice: string;
  voiceVolume: number;
  music: string;
  musicVolume: number;
  musicStart: number;
  musicEnd: number;
  fade: number;
  loop: boolean;
  duck: boolean;
  captions: Caption[];
  style: CaptionStyle;
  assignments: Record<number, Assignment>;
  resolution: number;
  ratio: string;
  fps: number;
  format: "mp4" | "webm";
};
export const initial: Project = {
  name: "Untitled story",
  fileName: "",
  fileSize: 0,
  duration: 0,
  segments: [],
  filter: "none",
  intensity: 1,
  voice: "original",
  voiceVolume: 1,
  music: "",
  musicVolume: 0.18,
  musicStart: 0,
  musicEnd: 30,
  fade: 1,
  loop: true,
  duck: true,
  captions: [],
  style: {
    font: "Arial",
    color: "#ffffff",
    stroke: "#000000",
    background: "#00000000",
    animation: "pop",
    size: 42,
    x: 0.5,
    y: 0.8,
    align: "center",
  },
  assignments: {},
  resolution: 720,
  ratio: "9:16",
  fps: 30,
  format: "mp4",
};
export const uid = () => crypto.randomUUID();
export function saveFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export const clock = (n: number) =>
  `${Math.floor(Math.max(0, n) / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(Math.max(0, n) % 60)
    .toString()
    .padStart(2, "0")}`;
export async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("bnedits", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("projects");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function loadProject() {
  const db = await database();
  return new Promise<Project | undefined>((resolve, reject) => {
    const r = db.transaction("projects").objectStore("projects").get("current");
    r.onsuccess = () => {
      resolve(r.result);
      db.close();
    };
    r.onerror = () => {
      reject(r.error);
      db.close();
    };
  });
}
export async function saveProject(p: Project) {
  const db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(p, "current");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
