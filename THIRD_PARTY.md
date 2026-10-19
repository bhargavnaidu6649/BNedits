# BNedits asset and third-party credits

## Original assets

The 100 SVG face illustrations were generated specifically for this project and do not intentionally depict licensed characters. They are simple original vector art, not a commercial character pack. The supplied BN Tech logo remains the property of its owner; it is not included in the CC0 dedication below.

The bundled tracks **Quiet Circuit**, **Neon Steps**, and **Soft Horizon** are original synthesized instrumental loops, created without third-party recordings or samples. To the extent possible under law, rights in these generated compositions are waived under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). No attribution is required. See `public/assets/music/CREDITS.txt`.

## Optional caption fonts

The app defines 50 style combinations using the ten families below. Fonts are fetched only when the user explicitly requests them via `loadCaptionFonts()`. All styles have system-font fallbacks; font requests contain no video or caption text. The font provider does receive ordinary connection metadata such as IP address. The request uses `display=swap` so captions remain visible while fonts load. Initial use requires an internet connection; browser caching is subject to browser policy. To distribute font files locally, include the relevant copyright and license files alongside the fonts.

Each family is licensed under **SIL Open Font License 1.1 (OFL-1.1)**. Exact upstream notices and terms:

| Font                 | License / copyright notice                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Inter                | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/inter/OFL.txt)              |
| Anton                | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/anton/OFL.txt)              |
| Playfair Display     | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/playfairdisplay/OFL.txt)    |
| Space Mono           | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/spacemono/OFL.txt)          |
| Bangers              | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/bangers/OFL.txt)            |
| Poppins              | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/poppins/OFL.txt)            |
| Caveat               | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/caveat/OFL.txt)             |
| Bebas Neue           | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/bebasneue/OFL.txt)          |
| Noto Sans Telugu     | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/notosanstelugu/OFL.txt)     |
| Noto Sans Devanagari | [OFL-1.1 — upstream OFL.txt](https://github.com/google/fonts/blob/main/ofl/notosansdevanagari/OFL.txt) |

Noto script coverage: [Telugu](https://notofonts.github.io/noto-docs/specimen/NotoSansTelugu/) and [Devanagari / Hindi](https://notofonts.github.io/noto-docs/specimen/NotoSansDevanagari/). Caption text is drawn by the browser; script shaping and platform font fallback may differ between devices.

## Software and model sources

The dependency versions are recorded in `package-lock.json`; third-party licenses are retained in installed npm packages. Relevant upstream projects:

- [React](https://github.com/facebook/react) — MIT.
- [Vite](https://github.com/vitejs/vite) — MIT.
- [TypeScript](https://github.com/microsoft/TypeScript) — Apache-2.0.
- [Lucide](https://github.com/lucide-icons/lucide) — ISC; see upstream license for inherited Feather icons.
- [MediaPipe](https://github.com/google-ai-edge/mediapipe) — Apache-2.0 software; inspect the downloaded face model's model card and terms separately.
- [Transformers.js](https://github.com/huggingface/transformers.js) — Apache-2.0 software; model artifacts have their own model-card licenses.
- [Whisper](https://github.com/openai/whisper) — MIT upstream implementation; converted weights are distributed through the model repository selected by the application.
- [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) — MIT JavaScript wrapper. FFmpeg core and enabled codec libraries have separate LGPL/GPL terms; see the exact core distribution's license before redistributing or modifying it. Wrapper license is not the codec/core license.

These links document provenance; they do not replace upstream license files. Preserve upstream notices when self-hosting third-party binaries, models, or fonts.
