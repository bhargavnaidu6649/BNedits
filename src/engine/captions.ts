export interface Caption {
  id: string;
  start: number;
  end: number;
  text: string;
  style?: Record<string, unknown>;
}
export interface TranscriptionProgress {
  progress: number;
  status: string;
  file?: string;
  indeterminate?: boolean;
}
export async function decodeAudio(
  file: File | Blob,
  sampleRate = 16000,
): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const offline = new OfflineAudioContext(
      1,
      Math.ceil(decoded.duration * sampleRate),
      sampleRate,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return (await offline.startRendering()).getChannelData(0).slice();
  } catch (e) {
    throw new Error(
      "Could not decode this video’s audio. Try an MP4 with AAC audio or import SRT captions. " +
        (e instanceof Error ? e.message : ""),
    );
  } finally {
    await context.close();
  }
}
export function transcribe(
  audio: Float32Array,
  language = "auto",
  onProgress?: (p: TranscriptionProgress) => void,
  signal?: AbortSignal,
  model: "tiny" | "base" = "tiny",
): Promise<Caption[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./captions.worker.ts", import.meta.url),
      { type: "module" },
    );
    const stop = () => {
      worker.terminate();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(new DOMException("Transcription cancelled", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data);
      else if (data.type === "result") {
        stop();
        resolve(data.captions);
      } else if (data.type === "error") {
        stop();
        reject(new Error(data.error));
      }
    };
    worker.onerror = (e) => {
      stop();
      reject(
        new Error(
          e.message ||
            "Speech model failed to load. Check your connection and retry.",
        ),
      );
    };
    const copy = audio.slice();
    worker.postMessage({ audio: copy, language, model }, [copy.buffer]);
  });
}
function stamp(seconds: number) {
  const n = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")},${String(n % 1000).padStart(3, "0")}`;
}
export function toSRT(captions: Caption[]): string {
  return [...captions]
    .sort((a, b) => a.start - b.start)
    .map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`)
    .join("\n\n");
}
export function parseSRT(text: string): Caption[] {
  const parse = (s: string) => {
    if (!/^\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3}$/.test(s.trim())) return NaN;
    const a = s.trim().replace(",", ".").split(":").map(Number);
    return a[0] * 3600 + a[1] * 60 + a[2];
  };
  const captions: Caption[] = [];
  for (const block of text
    .replace(/\r/g, "")
    .replace(/^\uFEFF/, "")
    .trim()
    .split(/\n\s*\n/)) {
    const lines = block.split("\n");
    const i = lines.findIndex((l) => l.includes("-->"));
    if (i < 0) continue;
    const [a, b] = lines[i].split("-->");
    const start = parse(a),
      end = parse(b.split(/\s+/).filter(Boolean)[0]);
    const body = lines
      .slice(i + 1)
      .join("\n")
      .replace(/<[^>]*>/g, "")
      .trim();
    if (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end > start &&
      body
    )
      captions.push({ id: crypto.randomUUID(), start, end, text: body });
  }
  if (!captions.length)
    throw new Error(
      "No valid SRT captions found. Use timestamps such as 00:00:01,000 --> 00:00:03,000.",
    );
  return captions.sort((a, b) => a.start - b.start);
}
