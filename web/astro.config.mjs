import { defineConfig } from "astro/config";
import preact from "@astrojs/preact";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://amigo-native.amigo-labs.workers.dev",
  output: "static",
  integrations: [preact({ compat: false }), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "~": new URL("./src", import.meta.url).pathname,
        "@data": new URL("../docs", import.meta.url).pathname,
      },
    },
  },
  build: {
    assets: "_assets",
  },
});
