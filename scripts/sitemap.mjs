import { writeFileSync } from "node:fs";
// Netlify injects URL. Set SITE_URL for an alternate production hostname.
const origin = process.env.SITE_URL || process.env.URL;
if (origin) {
  const base = new URL(origin).origin;
  writeFileSync(
    "public/sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${["/", "/editor", "/about"].map((p) => `<url><loc>${base}${p}</loc></url>`).join("")}</urlset>`,
  );
  writeFileSync(
    "public/robots.txt",
    `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`,
  );
} else
  console.log(
    "Set SITE_URL on production builds to generate your canonical sitemap.",
  );
