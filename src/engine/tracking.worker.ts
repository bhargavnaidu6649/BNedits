import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let landmarker: FaceLandmarker | undefined;
let nextId = 1;
type Face = {
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
};
let previous: Face[] = [];
type EuroState = { value: number; raw: number; velocity: number; time: number };
const filters = new Map<string, EuroState>();
// One Euro filter: low speed is smoothed strongly, rapid movement raises the
// cutoff to keep latency low. Timestamps are milliseconds from the tracker.
function oneEuro(id: number, key: string, value: number, time: number) {
  const name = `${id}:${key}`,
    old = filters.get(name);
  if (!old) {
    filters.set(name, { value, raw: value, velocity: 0, time });
    return value;
  }
  const dt = Math.max(0.001, Math.min(0.5, (time - old.time) / 1000));
  const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
  const velocity =
    old.velocity + alpha(1) * ((value - old.raw) / dt - old.velocity);
  const filtered =
    old.value + alpha(1.8 + 8 * Math.abs(velocity)) * (value - old.value);
  filters.set(name, { value: filtered, raw: value, velocity, time });
  return filtered;
}
self.onmessage = async ({ data }) => {
  const { requestId } = data;
  try {
    if (data.type === "init") {
      nextId = 1;
      previous = [];
      filters.clear();
      const files = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
      );
      landmarker = await FaceLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numFaces: 8,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.45,
        minTrackingConfidence: 0.45,
      });
      self.postMessage({ requestId, ready: true });
      return;
    }
    if (data.type === "reset") {
      previous = [];
      nextId = 1;
      filters.clear();
      self.postMessage({ requestId, faces: [] });
      return;
    }
    if (!landmarker) throw new Error("Face tracker has not loaded.");
    const bitmap: ImageBitmap = data.bitmap;
    const frameWidth = bitmap.width,
      frameHeight = bitmap.height;
    let result;
    try {
      result = landmarker.detectForVideo(bitmap, data.timestamp);
    } finally {
      bitmap.close();
    }
    const now = data.timestamp;
    const used = new Set<number>();
    const faces = result.faceLandmarks.map((points, i) => {
      const left = points[234],
        right = points[454],
        top = points[10],
        bottom = points[152];
      const eyeL = points[33],
        eyeR = points[263],
        nose = points[1];
      const x = (left.x + right.x) / 2,
        y = (top.y + bottom.y) / 2;
      const width =
        Math.hypot(
          (right.x - left.x) * frameWidth,
          (right.y - left.y) * frameHeight,
        ) / frameWidth;
      const height =
        Math.hypot(
          (bottom.x - top.x) * frameWidth,
          (bottom.y - top.y) * frameHeight,
        ) / frameHeight;
      const match = previous
        .filter((p) => !used.has(p.id) && now - p.lastSeen < 3000)
        .map((p) => ({
          p,
          d: Math.hypot(p.x - x, p.y - y) / Math.max(width, p.width, 0.04),
        }))
        .sort((a, b) => a.d - b.d)[0];
      const old = match && match.d < 1.4 ? match.p : undefined;
      const id = old?.id ?? nextId++;
      used.add(id);
      const mouth =
        result.faceBlendshapes[i]?.categories.find(
          (c) => c.categoryName === "jawOpen",
        )?.score ??
        Math.min(
          1,
          Math.abs(points[14].y - points[13].y) / Math.max(height * 0.25, 0.01),
        );
      const roll = Math.atan2(
        (eyeR.y - eyeL.y) * frameHeight,
        (eyeR.x - eyeL.x) * frameWidth,
      );
      const yaw = Math.max(
        -0.8,
        Math.min(0.8, ((nose.x - x) / Math.max(width, 0.01)) * 2),
      );
      const pitch = Math.max(
        -0.6,
        Math.min(0.6, (nose.y - y) / Math.max(height, 0.01)),
      );
      // Adaptive low-pass: fast movement receives less smoothing to avoid lag.
      const alpha = old
        ? Math.min(0.85, 0.32 + Math.hypot(x - old.x, y - old.y) * 9)
        : 1;
      const smooth = (key: keyof Face, value: number) =>
        old ? Number(old[key]) + (value - Number(old[key])) * alpha : value;
      const angle = old
        ? old.roll +
          Math.atan2(Math.sin(roll - old.roll), Math.cos(roll - old.roll)) *
            alpha
        : roll;
      return {
        id,
        x: oneEuro(id, "x", x, now),
        y: oneEuro(id, "y", y, now),
        width: oneEuro(id, "width", width, now),
        height: oneEuro(id, "height", height, now),
        roll: angle,
        yaw: smooth("yaw", yaw),
        pitch: smooth("pitch", pitch),
        mouth: smooth("mouth", mouth),
        opacity: 1,
        lastSeen: now,
      };
    });
    // Brief loss holds position for 150 ms, then fades. IDs are geometry-based,
    // not biometric identities; crossing or long absences can change IDs.
    for (const old of previous) {
      const age = now - old.lastSeen;
      if (!used.has(old.id) && age < 3000)
        faces.push({ ...old, opacity: Math.max(0, 1 - (age - 150) / 500) });
      else if (!used.has(old.id))
        for (const key of ["x", "y", "width", "height"])
          filters.delete(`${old.id}:${key}`);
    }
    previous = faces;
    self.postMessage({
      requestId,
      faces: faces.filter((face) => face.opacity > 0),
    });
  } catch (error) {
    self.postMessage({
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
