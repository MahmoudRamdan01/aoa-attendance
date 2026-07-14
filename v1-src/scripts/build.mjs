import { build } from "vite";
import viteConfig from "../vite.config.js";

// Load the checked-in config natively. This avoids a Windows/esbuild config-loader
// permission edge case while keeping one source of truth for base/plugins/output.
await build({
  ...viteConfig,
  configFile: false,
});
