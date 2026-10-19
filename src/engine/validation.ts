export interface Segment {
  start: number;
  end: number;
}
export function validateSegments(
  segments: Segment[],
  duration: number,
): Segment[] {
  if (!Number.isFinite(duration) || duration <= 0)
    throw new Error("Video metadata must finish loading before export.");
  if (!segments.length)
    throw new Error("Keep at least one clip before exporting.");
  return segments.map(({ start, end }) => {
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      end > duration + 0.05
    )
      throw new Error(
        "Each clip must have a valid start and end within the video duration.",
      );
    return { start, end: Math.min(end, duration) };
  });
}
export function validateMusicTrim(
  start: number,
  end: number,
  duration?: number,
) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < 0 ||
    (end !== 0 && end <= start)
  )
    throw new Error(
      "Music trim end must follow its start; set end to 0 to use the full track.",
    );
  if (
    duration !== undefined &&
    Number.isFinite(duration) &&
    (start >= duration || end > duration + 0.05)
  )
    throw new Error("Music trim must stay within the track duration.");
}
