/** Explicit opt-in only: importing this module never makes a network request. */
export const captionFontFamilies = [
  "Inter",
  "Anton",
  "Playfair Display",
  "Space Mono",
  "Bangers",
  "Poppins",
  "Caveat",
  "Bebas Neue",
  "Noto Sans Telugu",
  "Noto Sans Devanagari",
] as const;
let loading: Promise<void> | undefined;
/** Call from a user click. Failed requests are retryable; fallback fonts remain usable. */
export function loadCaptionFonts(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.id = "bnedits-caption-fonts";
    link.rel = "stylesheet";
    link.crossOrigin = "anonymous";
    link.href =
      "https://fonts.googleapis.com/css2?" +
      captionFontFamilies
        .map(
          (font) => "family=" + encodeURIComponent(font).replace(/%20/g, "+"),
        )
        .join("&") +
      "&display=swap";
    const timer = window.setTimeout(() => fail(), 20000);
    const fail = () => {
      window.clearTimeout(timer);
      link.remove();
      loading = undefined;
      reject(
        new Error(
          "Caption fonts could not load. Your system fonts still work. Check your connection and retry.",
        ),
      );
    };
    link.onerror = fail;
    link.onload = async () => {
      try {
        await Promise.all(
          captionFontFamilies.map((font) =>
            document.fonts.load(
              `16px "${font}"`,
              font === "Noto Sans Telugu"
                ? "తెలుగు"
                : font === "Noto Sans Devanagari"
                  ? "हिन्दी"
                  : "Creator",
            ),
          ),
        );
        window.clearTimeout(timer);
        resolve();
      } catch {
        fail();
      }
    };
    document.head.appendChild(link);
  });
  return loading;
}
