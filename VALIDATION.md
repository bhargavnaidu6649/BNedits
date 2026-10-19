# Validation record

- `npm test`: 9 tests passed, zero failures.
- `npm run build`: TypeScript and Vite production build passed.
- 100 face files verified against the manifest, 25 per category.
- Unicode SRT roundtrips, malformed captions, invalid project/clip/music inputs, and even aspect-ratio output dimensions checked.
- Heavy tracking, captions, audio, and encoder modules emitted as separate chunks.

No supported browser-control environment was available for visual or device QA. MediaPipe/Whisper inference, audiovisual synchronization, mobile memory usage, exact codec output, browser accessibility, and Netlify deployment have not been end-to-end verified. Run the README acceptance checklist before production use.

This package includes the latest static `dist/` plus full source. Models are downloaded when enabled, not bundled as model weights. The canonical sitemap is generated when SITE_URL or Netlify URL is supplied at build time.
