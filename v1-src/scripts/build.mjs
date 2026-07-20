import { build } from "vite";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import viteConfig from "../vite.config.js";

// Usage: node ./scripts/build.mjs [company]
//   (default)  → the original aol build; output identical to before.
//   airocean   → Vite mode "airocean" (loads .env.airocean → its own
//                Supabase project + VITE_COMPANY), then a branding pass
//                rewrites the PWA identity (title/manifest/icons) in dist/.
// Load the checked-in config natively. This avoids a Windows/esbuild config-loader
// permission edge case while keeping one source of truth for base/plugins/output.
const company = process.argv[2] || "aol";

await build({
  ...viteConfig,
  configFile: false,
  ...(company === "aol" ? {} : { mode: company }),
});

if (company === "airocean") {
  const dist = path.resolve("dist");
  const brand = path.resolve("brand/airocean");

  const manifestPath = path.join(dist, "manifest.webmanifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = "Air Ocean Line";
  manifest.short_name = "AOL";
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  const indexPath = path.join(dist, "index.html");
  const html = await readFile(indexPath, "utf8");
  await writeFile(
    indexPath,
    html
      .replace("<title>AOI.</title>", "<title>Air Ocean Line</title>")
      .replace('name="apple-mobile-web-app-title" content="AOI"', 'name="apple-mobile-web-app-title" content="AOL"'),
    "utf8"
  );

  for (const [source, target] of [
    ["logo.png", "logo.png"],
    ["icon-192.png", "icon-192.png"],
    ["icon-512.png", "icon-512.png"],
    ["icon-maskable-512.png", "icon-maskable-512.png"],
  ]) {
    await copyFile(path.join(brand, source), path.join(dist, target));
  }
}
