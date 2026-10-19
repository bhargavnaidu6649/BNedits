import { build } from "esbuild";
await build({
  entryPoints: ["src/engine/tracking.worker.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: "public/engine/tracking.worker.js",
  minify: true,
});
