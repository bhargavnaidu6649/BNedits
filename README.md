# BNedits

A local-first, static video editor for faceless creators. Vite + React + TypeScript; no backend, account, database server, paid API, analytics, or media uploads. The supplied BN tech logo is included at `public/assets/logo.png` (served as `/assets/logo.png`).

## Run

Use Node.js 22 LTS or newer:

```sh
npm install
npm run dev
npm run build
npm run preview
npm test
```

Open the localhost URL printed by Vite. Do not open index.html directly. HTTPS or localhost is necessary for workers, AudioWorklet, service workers, and browser recording.

The `.npmrc` skips ONNX Runtime's unused server-side CUDA download. New npm versions may print a warning for this dependency-specific setting. If your npm ignores it, set `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` before installation (PowerShell: `$env:ONNXRUNTIME_NODE_INSTALL_CUDA="skip"`). No GPU driver is needed for this browser app.

`npm run build` generates the classic MediaPipe worker, an optional canonical sitemap, TypeScript checks, and the static `dist/` output. There is no server runtime. Heavy engines are dynamically imported; the speech WASM file is in the build but not loaded on the landing page.

## Netlify deployment

1. Extract this project and put the source in a Git repository, or build locally and upload the **contents of `dist`** to Netlify.
2. For Git deployment, use build command `npm run build` and publish directory `dist`. `netlify.toml` sets these automatically and selects Node 22.
3. Set `SITE_URL` to your real HTTPS origin if it differs from Netlify's `URL`. The build generates `sitemap.xml` and a robots.txt sitemap entry from that origin. For manual deploys, set `SITE_URL` before building. No fake production hostname is included.
4. Keep `public/_headers` and `public/_redirects` in the build. Netlify copies both to `dist`.
5. After deploying, open `/editor` directly and verify it resolves to the application. Check DevTools → Network for `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` on the document. `window.crossOriginIsolated` should be true.
6. Test one short video end-to-end using the checklist below before announcing the site.

Netlify configuration is compatible with static hosting; no paid feature is required by the code. **No one can guarantee a third-party free plan forever.** Netlify quotas, policies, model hosts, and browser limits can change. Large cached runtime/model files can still consume bandwidth on first use or after eviction. Do not promise unlimited free hosting.

## Using the editor

- Choose/drop MP4, MOV, or WebM. These are containers: decoding depends on the codecs installed in the browser. H.264/AAC MP4 is a useful first test.
- Enable face tracking, play the clip, choose Person 1/2/etc., then choose artwork. Assignments are per geometry-based track. Scale, offsets, roll, and mouth animation are adjustable. Drag or pinch the preview to adjust the selected face.
- Trim using the In/Out fields, scrub the playhead, split, and delete unwanted clips. The remaining clips export in source order. Undo/redo supports edit state, not file selection or playback.
- Choose a filter and intensity. Select voice effects, preview five seconds, and adjust volume. Preview uses the same audio graph as export.
- Select a built-in CC0 music loop or upload audio. Trim, loop, fades, volume, and energy-based ducking are available. Original music remains yours; no file is uploaded.
- Generate captions locally, or import SRT. Review language accuracy. Edit text/times, split, merge, add, delete, and drag caption blocks on the desktop timeline; timestamp controls provide the mobile equivalent.
- Global styles affect captions without individual overrides. Select a caption to override its style; “Use global style” changes the editing target. “Load optional Google Fonts” downloads fonts only on request. Load them before export for consistent typography.
- Export 480p/720p/1080p, original/square/vertical/wide ratios, and 24/25/30/60 fps. Resolution refers to the shorter edge; 1080p vertical is 1080×1920. Content fits within the frame with black bars; there is no crop/reframe mode.
- MP4 uses native MediaRecorder where supported. Otherwise a local ffmpeg worker converts the recorded WebM to H.264/AAC. If conversion fails, the complete WebM is downloaded with a visible warning.
- Settings/captions autosave in IndexedDB. Re-select the original video and music after refresh. Download settings JSON for backup. “Clear project” resets the saved settings; browser site-data controls clear downloaded model caches too.

## Source map

```
index.html                       Metadata, favicon, initial loading screen
src/main.tsx                     Landing, About/Credits/Privacy, routing
src/Editor.tsx                   Editor controls, timeline, local workflow
src/style.css                    Responsive dark/light design
src/model.ts                     Project types, IndexedDB persistence
src/validate.ts                  Imported project validation
src/catalog.ts                   Filters, voice presets, caption styles
src/fonts.ts                     Opt-in open-font loader
src/compositor.ts                Shared preview/export canvas compositor
src/srt.ts                       SRT parsing and export
src/engine/tracking.ts            Classic-worker bridge
src/engine/tracking.worker.ts     MediaPipe tracking and smoothing
src/engine/captions.ts            Audio decode and speech-worker bridge
src/engine/captions.worker.ts     Quantized multilingual Whisper
src/engine/audio.ts               AudioWorklet and mixing graph
src/engine/export.ts              Recording, conversion, cancel/progress
src/engine/validation.ts          Clip and music range validation
public/assets/faces/              100 original SVGs + manifest
public/assets/music/              3 original WAV loops + credits/manifest
public/assets/logo.png            Supplied brand emblem
public/engine/tracking.worker.js  Generated classic worker
public/sw.js                     Versioned application/runtime cache
public/_headers                  Isolation, cache, and security headers
public/_redirects                SPA fallback
netlify.toml                     Netlify build configuration
scripts/                         Worker and sitemap build steps
THIRD_PARTY.md                   Dependency, font, model, and asset credits
```

## Practical limits — read before production use

This is an implemented application, **not a claim of production certification**. The build and automated checks passed in the creation environment; real-browser model inference, audiovisual synchronization, and device compatibility still need acceptance testing.

- Tracking is capped at **8 visible faces**. IDs are assigned geometrically, not by facial recognition. Crossings, occlusion, camera cuts, and long exits can swap IDs. Seeking resets track numbering by detection order. Review every affected section. This is not a guaranteed anonymization tool.
- Faces are original procedural 2D SVG artwork. Roll and approximate yaw/pitch are applied with affine transforms; there is no 3D reconstruction, occlusion masking, photorealistic skin-tone blending, or calibrated edge-feather mask. Soft canvas shadows soften edges but are not a true skin blend. Mouth sync adds an approximate opening over the existing artwork.
- Filters are canvas/CSS tonal presets. Names such as VHS/glitch describe stylized tonal treatments, not full scanline/noise/displacement shader simulations. Canvas filter support varies by browser.
- Voice presets share a real-time granular pitch shifter, EQ, ring modulation, and delay. Formant coloration is a broad EQ approximation, not independent spectral formant shifting. “Male-style,” “female-style,” and “kid” are creative labels, not guaranteed identity or age conversions.
- Automatic captions depend on model downloads, available memory, language/accent, noise, and browser audio decoding. Multilingual tiny/base models are imperfect, particularly for Telugu/Hindi. SRT import is a reliable manual path. Word-by-word caption highlighting estimates timing evenly from each sentence; this is not forced word alignment.
- Real-time MediaRecorder export can drop frames on weak devices. The selected fps is a request, not a guarantee. Encoding is worker-based, but canvas composition is on the main thread. Tracking and transcription run off-thread; audio uses an AudioWorklet. No guarantee of constant 60fps or a never-blocking UI is possible on every device.
- Keep the tab visible and the device awake. Hiding the tab aborts export explicitly to prevent silently incomplete output. Long MP4 conversion can exceed mobile memory. Use short 480p clips or download WebM.
- 500 MB / 10 minutes are warnings, not proven safe limits; start with 10–30 seconds on phones. Audio decoding buffers the clip in memory and can fail before transcription on long inputs.
- Service-worker and Transformers caches are best effort, subject to quota/eviction. First model use requires internet. Normal CDN requests reveal IP/network metadata to model hosts; video/audio content is never sent. Optional Google Fonts also contact Google.
- No collaboration, multi-source compositing, waveform extraction, timeline zoom, clip reordering, or project video persistence is provided. Refresh recovery saves settings only. No tracking-keyframe correction system exists.

## Assets to replace or add

Nothing is required for the included local demo. The supplied logo, 100 SVG faces, three original music loops, and styles are included. Optional upgrades: professionally illustrated face art retaining the manifest shape, longer CC0 tracks with verifiable credits, self-hosted font/model files, and a dedicated social share image. Keep licenses with replacement assets. Update the worker URLs and transcription model configuration if self-hosting models. Set your actual `SITE_URL` for SEO. Do not change long-cached assets in place without versioning paths/cache names.

## Testing checklist

Desktop Chrome/Edge and Safari:

- Open landing, editor, and About directly; refresh deep links; toggle theme; keyboard-tab through controls; test Space and Ctrl/Cmd+Z/Shift+Z.
- Load a 10-second H.264/AAC video; play/seek/trim/split/delete/undo/redo. Check silent files and unsupported codecs.
- Enable tracking on single/multi-face clips; test rotations, crossings, exits, fast movement, and manual adjustments. Compare preview and exported overlay placement.
- Generate English/Hindi/Telugu captions; import/export Unicode SRT; edit split/merge, per-caption/global styles, and font fallback/loaded appearance.
- Preview original and shifted voices; check music trim, fades, ducking, loop, volume, and silent clips. Compare exported AV synchronization.
- Export all aspect ratios at 480p first, then 720p/1080p; test MP4 and WebM, cancel while recording/converting, background-tab abort, and encoder failure fallback.
- Refresh and reconnect video/audio; reject a mismatched or malformed project JSON; clear settings; test quota/storage errors and offline cached visits.
- In Network, verify that footage is never uploaded and heavyweight model/WASM requests appear only when needed.

Mobile Android Chrome and iPhone Safari:

- Test 320px width, portrait/landscape, bottom tabs, touch controls, font sizes, and pinch/drag adjustments.
- Use a 10-second clip at 480p. Verify playback audio unlock, downloads, interruptions, device sleep, memory warnings, and recovery after cancel.
- Use timestamp fields for caption positioning if HTML drag-and-drop is unavailable.

## License

Project application source: MIT (see LICENSE). Original generated faces/music: CC0 1.0. The supplied logo retains its owner's rights. Dependencies/models/fonts carry their own licenses; see THIRD_PARTY.md. ffmpeg builds containing x264 can carry GPL obligations; review that build's notices when redistributing it.
