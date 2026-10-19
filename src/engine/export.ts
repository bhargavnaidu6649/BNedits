import { validateSegments } from "./validation";
export interface ExportOptions {
  video: HTMLVideoElement;
  canvas: HTMLCanvasElement;
  render: (time: number) => void | Promise<void>;
  start?: number;
  end?: number;
  segments?: { start: number; end: number }[];
  fps: number;
  width: number;
  height: number;
  format: "mp4" | "webm";
  audioStream?: MediaStream;
  signal?: AbortSignal;
  onProgress?: (
    progress: number,
    phase: string,
    remainingSeconds: number,
  ) => void;
}
export interface ExportResult {
  blob: Blob;
  extension: "mp4" | "webm";
  warning?: string;
}
const reason = (signal: AbortSignal) =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Export cancelled", "AbortError");
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      void promise.catch(() => {});
      reject(reason(signal));
      return;
    }
    const cancel = () => reject(reason(signal));
    signal.addEventListener("abort", cancel, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", cancel));
  });
}
function seek(
  video: HTMLVideoElement,
  time: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(reason(signal));
      return;
    }
    if (Math.abs(video.currentTime - time) < 0.01) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => {
      clean();
      reject(new Error("Video seek timed out"));
    }, 10000);
    const clean = () => {
      clearTimeout(timeout);
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      signal?.removeEventListener("abort", cancel);
    };
    const done = () => {
      clean();
      resolve();
    };
    const fail = () => {
      clean();
      reject(new Error("Video could not be decoded"));
    };
    const cancel = () => {
      clean();
      reject(reason(signal!));
    };
    video.addEventListener("seeked", done, { once: true });
    video.addEventListener("error", fail, { once: true });
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      video.currentTime = time;
    } catch (e) {
      clean();
      reject(e);
    }
  });
}
export async function exportVideo(input: ExportOptions): Promise<ExportResult> {
  if (!("MediaRecorder" in window) || !input.canvas.captureStream)
    throw new Error(
      "This browser cannot record canvas video. Try recent Chrome or Edge.",
    );
  if (document.hidden)
    throw new Error(
      "Keep this tab visible while exporting. Return to BNedits and retry.",
    );
  const segments = validateSegments(
    input.segments ?? [
      { start: input.start ?? 0, end: input.end ?? input.video.duration },
    ],
    input.video.duration,
  );
  const total = segments.reduce((n, s) => n + s.end - s.start, 0);
  if (
    !Number.isFinite(input.fps) ||
    input.fps < 15 ||
    input.fps > 60 ||
    ![input.width, input.height].every(
      (n) => Number.isInteger(n) && n >= 2 && n <= 7680 && n % 2 === 0,
    )
  )
    throw new Error(
      "Export needs an even resolution and a frame rate between 15 and 60 fps.",
    );
  const mp4 = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4"];
  const webm = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mime = (input.format === "mp4" ? [...mp4, ...webm] : webm).find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  if (!mime)
    throw new Error(
      "No supported recording codec was found. Try Chrome or Edge.",
    );
  const controller = new AbortController();
  const signal = controller.signal;
  const cancel = () =>
    controller.abort(
      input.signal?.reason ??
        new DOMException("Export cancelled", "AbortError"),
    );
  const hidden = () => {
    if (document.hidden)
      controller.abort(
        new Error(
          "Export stopped because this tab became hidden. Keep BNedits visible and retry to avoid missing frames.",
        ),
      );
  };
  if (input.signal?.aborted) cancel();
  else input.signal?.addEventListener("abort", cancel, { once: true });
  document.addEventListener("visibilitychange", hidden);
  const o = { ...input, signal };
  const check = () => {
    if (signal.aborted) throw reason(signal);
  };
  const saved = {
    time: o.video.currentTime,
    width: o.canvas.width,
    height: o.canvas.height,
    rate: o.video.playbackRate,
  };
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let stopDone: Promise<void> | undefined;
  const chunks: BlobPart[] = [];
  let recorderError: Error | undefined;
  const stopRecorder = async () => {
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
    // Some mobile encoders fail to emit stop after memory exhaustion. Never
    // leave Cancel waiting forever on that browser event.
    await Promise.race([
      stopDone,
      new Promise<void>((r) => setTimeout(r, 3000)),
    ]);
  };
  let elapsed = 0;
  const wallStart = performance.now();
  try {
    check();
    o.video.pause();
    o.video.playbackRate = 1;
    o.canvas.width = o.width;
    o.canvas.height = o.height;
    stream = o.canvas.captureStream(o.fps);
    o.audioStream?.getAudioTracks().forEach((t) => stream!.addTrack(t.clone()));
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: o.height >= 1080 ? 8000000 : 5000000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onerror = () => {
      recorderError = new Error(
        "Browser encoder failed, possibly due to memory pressure. Retry at 480p.",
      );
      controller.abort(recorderError);
    };
    stopDone = new Promise<void>((r) => (recorder!.onstop = () => r()));
    await seek(o.video, segments[0].start, signal);
    await abortable(Promise.resolve(o.render(o.video.currentTime)), signal);
    check();
    recorder.start(1000);
    recorder.pause();
    for (const segment of segments) {
      check();
      await seek(o.video, segment.start, signal);
      await abortable(Promise.resolve(o.render(o.video.currentTime)), signal);
      check();
      recorder.resume();
      await abortable(o.video.play(), signal);
      await new Promise<void>((resolve, reject) => {
        let timer = 0;
        let done = false;
        let lastTime = o.video.currentTime;
        let lastAdvance = performance.now();
        const cleanup = () => {
          done = true;
          clearTimeout(timer);
          signal.removeEventListener("abort", cancelFrame);
        };
        const cancelFrame = () => {
          cleanup();
          reject(reason(signal));
        };
        signal.addEventListener("abort", cancelFrame, { once: true });
        const frame = async () => {
          if (done) return;
          try {
            check();
            if (recorderError) throw recorderError;
            const frameStart = performance.now();
            await abortable(
              Promise.resolve(o.render(o.video.currentTime)),
              signal,
            );
            if (done) return;
            if (o.video.currentTime !== lastTime) {
              lastTime = o.video.currentTime;
              lastAdvance = performance.now();
            } else if (performance.now() - lastAdvance > 15000)
              throw new Error(
                "Video playback stalled during export. Try a shorter clip or a lower resolution.",
              );
            const complete = Math.min(
              total,
              elapsed + Math.max(0, o.video.currentTime - segment.start),
            );
            const progress = complete / total;
            const spent = (performance.now() - wallStart) / 1000;
            o.onProgress?.(
              progress *
                (o.format === "mp4" && !mime.includes("mp4") ? 0.75 : 1),
              "Recording in real time — keep this tab visible",
              progress > 0.01 ? Math.max(0, spent / progress - spent) : total,
            );
            if (o.video.currentTime >= segment.end || o.video.ended) {
              cleanup();
              resolve();
              return;
            }
            timer = window.setTimeout(
              frame,
              Math.max(0, 1000 / o.fps - (performance.now() - frameStart)),
            );
          } catch (e) {
            cleanup();
            reject(e);
          }
        };
        void frame();
      });
      o.video.pause();
      recorder.pause();
      elapsed += segment.end - segment.start;
    }
    await stopRecorder();
    check();
    const blob = new Blob(chunks, { type: mime });
    if (!blob.size)
      throw new Error(
        "The browser produced an empty recording. Try a shorter clip in Chrome.",
      );
    if (o.format === "mp4" && !mime.includes("mp4")) {
      try {
        const mp4Blob = await convertToMP4(blob, o);
        o.onProgress?.(1, "Complete", 0);
        return { blob: mp4Blob, extension: "mp4" };
      } catch (e) {
        check();
        o.onProgress?.(1, "WebM export complete", 0);
        return {
          blob,
          extension: "webm",
          warning:
            "MP4 conversion was unavailable. Your complete edit is saved as WebM. " +
            (e instanceof Error ? e.message : ""),
        };
      }
    }
    o.onProgress?.(1, "Complete", 0);
    return { blob, extension: mime.includes("mp4") ? "mp4" : "webm" };
  } finally {
    o.video.pause();
    await stopRecorder();
    stream?.getTracks().forEach((t) => t.stop());
    document.removeEventListener("visibilitychange", hidden);
    input.signal?.removeEventListener("abort", cancel);
    o.canvas.width = saved.width;
    o.canvas.height = saved.height;
    o.video.playbackRate = saved.rate;
    // Restoration must not delay cancellation indefinitely on a decoder or
    // renderer that has stalled. The next preview frame can finish restoring.
    const restore = async () => {
      await seek(o.video, saved.time).catch(() => {});
      await Promise.resolve(o.render(saved.time)).catch(() => {});
    };
    await Promise.race([
      restore(),
      new Promise<void>((r) => setTimeout(r, 1200)),
    ]);
  }
}
async function convertToMP4(blob: Blob, o: ExportOptions): Promise<Blob> {
  const signal = o.signal!;
  const { FFmpeg } = await abortable(import("@ffmpeg/ffmpeg"), signal);
  const ffmpeg = new FFmpeg();
  const abort = () => ffmpeg.terminate();
  signal.addEventListener("abort", abort, { once: true });
  const urls: string[] = [];
  const fetchBlob = async (url: string, mime: string) => {
    const response = await fetch(url, { signal });
    if (!response.ok)
      throw new Error(`Encoder download failed (${response.status}).`);
    const local = URL.createObjectURL(
      new Blob([await response.arrayBuffer()], { type: mime }),
    );
    urls.push(local);
    return local;
  };
  try {
    o.onProgress?.(
      0.76,
      "Loading local MP4 encoder — time varies with connection",
      0,
    );
    const base = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
    const coreURL = await fetchBlob(
      base + "/ffmpeg-core.js",
      "text/javascript",
    );
    const wasmURL = await fetchBlob(
      base + "/ffmpeg-core.wasm",
      "application/wasm",
    );
    await abortable(ffmpeg.load({ coreURL, wasmURL }), signal);
    const started = performance.now();
    ffmpeg.on("progress", ({ progress }) => {
      const p = Math.min(1, Math.max(0, progress));
      const spent = (performance.now() - started) / 1000;
      o.onProgress?.(
        0.78 + p * 0.22,
        "Encoding MP4 locally",
        p > 0.01 ? Math.max(0, spent / p - spent) : 0,
      );
    });
    await abortable(
      ffmpeg.writeFile("input.webm", new Uint8Array(await blob.arrayBuffer())),
      signal,
    );
    const code = await abortable(
      ffmpeg.exec([
        "-i",
        "input.webm",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "output.mp4",
      ]),
      signal,
    );
    if (code !== 0) throw new Error("MP4 encoding could not complete.");
    const bytes = await abortable(ffmpeg.readFile("output.mp4"), signal);
    if (typeof bytes === "string") throw new Error("Unexpected encoder output");
    return new Blob([new Uint8Array(bytes)], { type: "video/mp4" });
  } finally {
    ffmpeg.terminate();
    urls.forEach(URL.revokeObjectURL);
    signal.removeEventListener("abort", abort);
  }
}
