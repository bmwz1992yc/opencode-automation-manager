import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

// Headless smoke test build: the client Solid runtime must win over the node one.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["browser", "development", "module", "import", "default"],
    alias: {
      "solid-js/web": "solid-js/web/dist/web.js",
      "solid-js/store": "solid-js/store/dist/store.js",
      "solid-js": "solid-js/dist/solid.js",
    },
  },
  build: {
    lib: {
      entry: "test/render.entry.tsx",
      formats: ["es"],
      fileName: () => "render.mjs",
    },
    outDir: "test/.render",
    emptyOutDir: true,
    minify: false,
  },
})
