import { env, pipeline } from "@huggingface/transformers";
env.allowLocalModels = false;
env.useBrowserCache = true;
let recognizer: any;
self.onmessage = async ({ data }) => {
  try {
    if (!recognizer)
      recognizer = await pipeline(
        "automatic-speech-recognition",
        data.model === "base"
          ? "onnx-community/whisper-base"
          : "onnx-community/whisper-tiny",
        {
          device: "wasm",
          dtype: "q8",
          progress_callback: (p: any) =>
            self.postMessage({
              type: "progress",
              progress: p.progress ?? 0,
              status: p.status,
              file: p.file,
              indeterminate: p.progress === undefined,
            }),
        },
      );
    self.postMessage({
      type: "progress",
      progress: 0,
      indeterminate: true,
      status:
        "Transcribing locally — progress is indeterminate; long videos may take several minutes.",
    });
    const output = await recognizer(data.audio, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      task: "transcribe",
      ...(data.language && data.language !== "auto"
        ? { language: data.language }
        : {}),
    });
    const chunks = output.chunks ?? [];
    const duration = data.audio.length / 16000;
    const captions = chunks
      .map((c: any, i: number) => ({
        id: crypto.randomUUID(),
        start: Math.max(0, c.timestamp?.[0] ?? 0),
        end: Math.min(
          duration,
          c.timestamp?.[1] ?? chunks[i + 1]?.timestamp?.[0] ?? duration,
        ),
        text: String(c.text).trim(),
      }))
      .filter((c: any) => c.text && c.end > c.start);
    if (!captions.length && output.text?.trim())
      captions.push({
        id: crypto.randomUUID(),
        start: 0,
        end: duration,
        text: output.text.trim(),
      });
    self.postMessage({ type: "result", captions });
  } catch (e) {
    self.postMessage({
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    });
  }
};
