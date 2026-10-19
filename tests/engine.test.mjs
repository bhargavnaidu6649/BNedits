import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "bnedits-engine-"));
after(() => rm(dir, { recursive: true, force: true }));
await build({
  entryPoints: ["src/engine/captions.ts", "src/engine/validation.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: dir,
  outExtension: { ".js": ".mjs" },
});
const { parseSRT, toSRT } = await import(
  pathToFileURL(join(dir, "captions.mjs"))
);
const { validateSegments, validateMusicTrim } = await import(
  pathToFileURL(join(dir, "validation.mjs"))
);
test("SRT roundtrips multiline English, Telugu, and Hindi captions with millisecond precision", () => {
  const raw =
    "1\r\n00:00:01,250 --> 00:00:02,501\r\nHello\r\nతెలుగు\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,750\r\nहिन्दी";
  const parsed = parseSRT(raw);
  assert.equal(parsed[0].start, 1.25);
  assert.equal(parsed[0].end, 2.501);
  assert.equal(parsed[0].text, "Hello\nతెలుగు");
  const roundtrip = parseSRT(toSRT(parsed));
  assert.deepEqual(
    roundtrip.map(({ id, ...rest }) => rest),
    parsed.map(({ id, ...rest }) => rest),
  );
});
test("SRT rejects reversed ranges and text without timestamps", () => {
  assert.throws(() => parseSRT("1\n00:00:03,000 --> 00:00:01,000\nInvalid"));
  assert.throws(() => parseSRT("not an SRT file"));
  assert.throws(() =>
    parseSRT("1\n00:99:03,000 --> 01:40:01,000\nInvalid minutes"),
  );
});
test("segments preserve intentional editing order and reject invalid timeline bounds", () => {
  const clips = [
    { start: 5, end: 8 },
    { start: 0, end: 2 },
  ];
  assert.deepEqual(validateSegments(clips, 10), clips);
  for (const invalid of [
    [],
    [{ start: -1, end: 2 }],
    [{ start: 2, end: 2 }],
    [{ start: 2, end: 11 }],
    [{ start: NaN, end: 2 }],
  ])
    assert.throws(() => validateSegments(invalid, 10));
  assert.throws(() => validateSegments(clips, Infinity));
});
test("segment end tolerates media metadata rounding but clamps to source duration", () => {
  assert.deepEqual(validateSegments([{ start: 0, end: 10.02 }], 10), [
    { start: 0, end: 10 },
  ]);
});
test("music trim accepts full-track sentinel and validates range against loaded audio", () => {
  assert.doesNotThrow(() => validateMusicTrim(3, 0, 10));
  assert.doesNotThrow(() => validateMusicTrim(3, 6, 10));
  for (const [start, end] of [
    [-1, 0],
    [4, 2],
    [0, 11],
    [10, 0],
    [NaN, 0],
  ])
    assert.throws(() => validateMusicTrim(start, end, 10));
});
