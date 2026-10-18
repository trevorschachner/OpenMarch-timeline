/**
 * Measurement only (ticket 15, C4.7, C4.9). Builds the GPU benchmark page, a
 * copy of the web preview's entry with scenario knobs, into
 * `view3d-web/bench/dist`. The build under test (branch, commit, uncommitted
 * changes) is baked in as `__BENCH_BUILD__` and lands in every result.
 * See research/gpu-benchmark.md for how to run it.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const web = path.join(__dirname, "..");
const desktop = path.join(web, "..");

const git = (...args: string[]) => {
    try {
        return execFileSync("git", args, {
            cwd: desktop,
            encoding: "utf8",
        }).trim();
    } catch {
        return null;
    }
};
const build = {
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
    commit: git("rev-parse", "HEAD"),
    subject: git("log", "-1", "--format=%s"),
    // tracked files changed but not committed: the commit alone doesn't name the build
    dirty: (git("status", "--porcelain", "--untracked-files=no") ?? "") !== "",
    builtAt: new Date().toISOString(),
};

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
    define: { __BENCH_BUILD__: JSON.stringify(build) },
    plugins: [tailwindcss(), react()],
    build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 8000 },
});
