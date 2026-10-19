import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const dir = await mkdtemp(join(tmpdir(), "bnedits-project-"));
after(() => rm(dir, { recursive: true, force: true }));
await build({
  entryPoints: [
    "src/model.ts",
    "src/validate.ts",
    "src/srt.ts",
    "src/compositor.ts",
  ],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: dir,
  outExtension: { ".js": ".mjs" },
});
const { initial } = await import(pathToFileURL(join(dir, "model.mjs")));
const { validateProject } = await import(
  pathToFileURL(join(dir, "validate.mjs"))
);
const { parseSrt, toSrt } = await import(pathToFileURL(join(dir, "srt.mjs")));
const { dimensions } = await import(pathToFileURL(join(dir, "compositor.mjs")));
test("project import accepts a saved project and rejects invalid export and external face paths", () => {
  assert.deepEqual(validateProject(initial), initial);
  assert.throws(() => validateProject({ ...initial, resolution: Infinity }));
  assert.throws(() =>
    validateProject({
      ...initial,
      assignments: {
        1: {
          asset: "https://remote.invalid/face.svg",
          x: 0,
          y: 0,
          scale: 1,
          rotation: 0,
        },
      },
    }),
  );
  assert.throws(() =>
    validateProject({
      ...initial,
      duration: 5,
      segments: [
        { start: 0, end: 4 },
        { start: 2, end: 5 },
      ],
    }),
  );
  assert.throws(() =>
    validateProject({
      ...initial,
      captions: [{ id: "1", start: 2, end: 1, text: "bad" }],
    }),
  );
});
test("portrait and landscape output retain even standard dimensions", () => {
  const v = { videoWidth: 1920, videoHeight: 1080 };
  assert.deepEqual(dimensions(v, 1080, "9:16"), { width: 1080, height: 1920 });
  assert.deepEqual(dimensions(v, 720, "16:9"), { width: 1280, height: 720 });
  assert.deepEqual(dimensions(v, 480, "1:1"), { width: 480, height: 480 });
});
test("editor SRT keeps Unicode and rejects reversed timing", () => {
  const captions = [
    { id: "1", start: 1.25, end: 3.001, text: "తెలుగు\nहिन्दी" },
  ];
  const actual = parseSrt(toSrt(captions));
  assert.equal(actual[0].text, captions[0].text);
  assert.equal(actual[0].end, 3.001);
  assert.deepEqual(parseSrt("1\n00:00:05,000 --> 00:00:01,000\nInvalid"), []);
});
test("all original face manifest assets exist and category counts are exact", async () => {
  const faces = JSON.parse(
    await readFile("public/assets/faces/manifest.json", "utf8"),
  );
  assert.equal(faces.length, 100);
  assert.equal(new Set(faces.map((x) => x.src)).size, 100);
  for (const cat of ["Human", "Cartoon", "Anime", "Animals/Fun"])
    assert.equal(faces.filter((x) => x.category === cat).length, 25);
  for (const face of faces)
    assert.match(await readFile("public" + face.src, "utf8"), /<svg/);
});
