/**
 * THROWAWAY (task/gpu-benchmark). Builds the GPU benchmark page, a copy of
 * the web preview's entry with scenario knobs, into `view3d-web/bench/dist`.
 * See research/gpu-benchmark.md for how to run it.
 */
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const web = path.join(__dirname, "..");
const desktop = path.join(web, "..");

export default defineConfig({
    root: __dirname,
    base: "./",
    publicDir: path.join(web, "public"),
    envDir: desktop,
    resolve: {
        alias: [
            {
                find: "@/components/titlebar/TitleBar",
                replacement: path.join(web, "WebTitleBar.tsx"),
            },
            { find: "@", replacement: path.join(desktop, "src") },
            {
                find: "@om-electron",
                replacement: path.join(desktop, "electron"),
            },
        ],
    },
    plugins: [tailwindcss(), react()],
    build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 8000 },
});
