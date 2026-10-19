export interface TrackedFace {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  roll: number;
  yaw: number;
  pitch: number;
  mouth: number;
  opacity: number;
  lastSeen: number;
}
export class Tracker {
  private worker?: Worker;
  private id = 0;
  private timestamp = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private busy = false;
  async init(onProgress?: (message: string) => void) {
    if (this.worker) return;
    onProgress?.(
      "Downloading face model and WASM. Videos remain on your device.",
    );
    // MediaPipe's WASM loader uses importScripts, requiring a classic worker.
    // The source is bundled into public/engine/tracking.worker.js with esbuild.
    this.worker = new Worker(
      `${import.meta.env.BASE_URL}engine/tracking.worker.js`,
    );
    this.worker.onmessage = ({ data }) => {
      const p = this.pending.get(data.requestId);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(data.requestId);
        data.error ? p.reject(new Error(data.error)) : p.resolve(data);
      }
    };
    this.worker.onerror = (e) => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(e.message || "Tracking worker failed"));
      }
      this.pending.clear();
    };
    try {
      await this.request({ type: "init" });
    } catch (e) {
      this.dispose();
      throw e;
    }
    onProgress?.("Face tracker ready");
  }
  private request(
    data: Record<string, unknown>,
    transfer: Transferable[] = [],
  ): Promise<any> {
    const requestId = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(requestId);
          reject(
            new Error(
              data.type === "init"
                ? "Face model loading timed out. Check your connection and retry."
                : "Face tracking timed out. Reload the tracker and retry.",
            ),
          );
        },
        data.type === "init" ? 60000 : 15000,
      );
      this.pending.set(requestId, { resolve, reject, timer });
      this.worker!.postMessage({ ...data, requestId }, transfer);
    });
  }
  async detect(
    source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
    timestamp = performance.now(),
  ): Promise<TrackedFace[] | null> {
    if (!this.worker || this.busy) return null;
    this.busy = true;
    try {
      const width =
        source instanceof HTMLVideoElement ? source.videoWidth : source.width;
      const height =
        source instanceof HTMLVideoElement ? source.videoHeight : source.height;
      const scale = Math.min(1, 640 / Math.max(width, height));
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(source, {
          resizeWidth: Math.max(1, Math.round(width * scale)),
          resizeHeight: Math.max(1, Math.round(height * scale)),
          resizeQuality: "low",
        });
      } catch {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d");
        if (!context)
          throw new Error("Canvas is unavailable for face tracking.");
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        bitmap = await createImageBitmap(canvas);
      }
      this.timestamp = Math.max(this.timestamp + 1, timestamp);
      const result = await this.request(
        { type: "detect", bitmap, timestamp: this.timestamp },
        [bitmap],
      );
      return result.faces;
    } finally {
      this.busy = false;
    }
  }
  async reset() {
    if (this.worker) await this.request({ type: "reset" });
  }
  dispose() {
    this.worker?.terminate();
    this.worker = undefined;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("Tracking stopped"));
    }
    this.pending.clear();
  }
}
