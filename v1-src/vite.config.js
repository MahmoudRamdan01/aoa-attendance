import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

async function outputFiles(directory, base = directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await outputFiles(absolute, base));
    else files.push(path.relative(base, absolute).split(path.sep).join("/"));
  }
  return files;
}

function serviceWorkerPlugin() {
  return {
    name: "aoa-service-worker",
    apply: "build",
    async closeBundle() {
      const outDir = path.resolve("dist");
      const files = (await outputFiles(outDir))
        .filter((file) => file !== "sw.js" && !file.endsWith(".map"))
        .sort();
      const fingerprints = await Promise.all(files.map(async (file) => {
        const info = await stat(path.join(outDir, file));
        return `${file}:${info.size}`;
      }));
      const version = createHash("sha256").update(fingerprints.join("|")).digest("hex").slice(0, 12);
      const template = await readFile(new URL("./sw.template.js", import.meta.url), "utf8");
      const rendered = template
        .replaceAll("__CACHE_VERSION__", version)
        .replace("__PRECACHE__", JSON.stringify(files.map((file) => `./${file}`)));
      await writeFile(path.join(outDir, "sw.js"), rendered, "utf8");
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), serviceWorkerPlugin()],
  build: { sourcemap: false, outDir: "dist" }
});
