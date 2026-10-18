#!/usr/bin/env node
// cspell:ignore blocklist swiftshader vsync tris webgl Subdiv
/**
 * Measurement only (ticket 15, C4.7, C4.9). Serves view3d-web/bench/dist and
 * drives each scenario in Playwright's Chromium, printing one JSON line per
 * run and writing all results to the file given by --out.
 *
 *   node view3d-web/bench/run-bench.mjs [--headed] [--uncapped] [--dpr 1]
 *        [--width 1920 --height 1080] [--repeat 2] [--only name,name]
 *        [--seconds 15] [--out results.json] [--shots dir] [--swiftshader]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, "dist");
const argv = process.argv.slice(2);
const flag = (k) => argv.includes(`--${k}`);
const opt = (k, d) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : d;
};
const W = Number(opt("width", 1920));
const H = Number(opt("height", 1080));
const DPR = Number(opt("dpr", 1));
const REPEAT = Number(opt("repeat", 2));
const SECONDS = Number(opt("seconds", 15));
const OUT = opt("out", null);
const ONLY = opt("only", null)?.split(",");
const SHOTS = opt("shots", null); // a folder: one screenshot per scenario, first repeat

export const SCENARIOS = [
    { name: "baseline", q: {} },
    { name: "looks1", q: { looks: 1 } },
    { name: "looks4", q: { looks: 4 } },
    { name: "looks8", q: { looks: 8 } },
    { name: "looks16", q: { looks: 16 } },
    { name: "silks40", q: { silks: 40 } },
    { name: "silks40-replace", q: { silks: 40, silkReplace: 1 } },
    { name: "silks40-56x36", q: { silks: 40, silkGrid: "56x36" } },
    { name: "silks40-tex4", q: { silks: 40, tex: 4 } },
    { name: "silks40-tex8", q: { silks: 40, tex: 8 } },
    { name: "silks40-tex8-2k", q: { silks: 40, tex: 8, texSize: "2048x3072" } },
    { name: "worst-looks16-silks40-tex8", q: { looks: 16, silks: 40, tex: 8 } },
    // C4.9: the test Garment on the whole show (385), on N of its performers
    { name: "garment40", q: { garment: 40 } },
    { name: "garment150", q: { garment: 150 } },
    { name: "garment300", q: { garment: 300 } },
    { name: "garment-all", q: { garment: "all" } },
    // the same at 788 triangles a fit (no subdivision)
    { name: "garment-all-788", q: { garment: "all", garmentSubdiv: 0 } },
    // C4.9: shows cut to N performers, Garment off and on everyone
    { name: "p40", q: { performers: 40 } },
    { name: "p40-garment", q: { performers: 40, garment: "all" } },
    { name: "p150", q: { performers: 150 } },
    { name: "p150-garment", q: { performers: 150, garment: "all" } },
    { name: "p300", q: { performers: 300 } },
    { name: "p300-garment", q: { performers: 300, garment: "all" } },
];

const TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".glb": "model/gltf-binary",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".png": "image/png",
    ".svg": "image/svg+xml",
};

function serve() {
    const server = http.createServer((req, res) => {
        const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
        let file = path.join(dist, p === "/" ? "index.html" : p);
        if (
            !file.startsWith(dist) ||
            !fs.existsSync(file) ||
            fs.statSync(file).isDirectory()
        ) {
            res.writeHead(404).end();
            return;
        }
        res.writeHead(200, {
            "content-type":
                TYPES[path.extname(file)] ?? "application/octet-stream",
        });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise((resolve) =>
        server.listen(0, "127.0.0.1", () => resolve(server)),
    );
}

// without --enable-gpu the headless shell falls back to SwiftShader
const args = flag("swiftshader")
    ? []
    : ["--ignore-gpu-blocklist", "--enable-gpu", "--use-angle=metal"];
if (flag("uncapped"))
    args.push("--disable-gpu-vsync", "--disable-frame-rate-limit");
if (flag("swiftshader"))
    args.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");

// The build under test is baked into dist (vite.bench.config.mts); warn when
// the checkout has moved on since, so a stale dist isn't measured by mistake.
const headNow = (() => {
    try {
        return execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: here,
            encoding: "utf8",
        }).trim();
    } catch {
        return null;
    }
})();
let build = null;

const server = await serve();
const port = server.address().port;
const browser = await chromium.launch({ headless: !flag("headed"), args });
const results = [];
const list = SCENARIOS.filter((s) => !ONLY || ONLY.includes(s.name));
for (let r = 0; r < REPEAT; r++) {
    // alternate order between repeats so thermal drift doesn't favor one end
    const order = r % 2 === 0 ? list : [...list].reverse();
    for (const s of order) {
        const context = await browser.newContext({
            viewport: { width: W, height: H },
            deviceScaleFactor: DPR,
        });
        const page = await context.newPage();
        const consoleErrors = [];
        page.on("console", (m) => {
            if (m.type() === "error")
                consoleErrors.push(m.text().slice(0, 300));
        });
        const qs = new URLSearchParams({ seconds: String(SECONDS), ...s.q });
        await page.goto(`http://127.0.0.1:${port}/index.html?${qs}`);
        await page.waitForFunction(() => window.__bench?.done, null, {
            timeout: 300_000,
            polling: 500,
        });
        const bench = await page.evaluate(() => window.__bench);
        if (SHOTS && r === 0) {
            fs.mkdirSync(SHOTS, { recursive: true });
            await page.screenshot({ path: path.join(SHOTS, `${s.name}.png`) });
        }
        if (bench.result?.build && !build) {
            build = bench.result.build;
            console.log(
                `build under test: ${build.branch} @ ${build.commit}${build.dirty ? " (uncommitted changes)" : ""}, built ${build.builtAt}`,
            );
            if (headNow && build.commit !== headNow)
                console.warn(
                    `WARNING: dist was built from ${build.commit}, but HEAD is ${headNow}; rebuild to measure HEAD`,
                );
        }
        const row = {
            scenario: s.name,
            repeat: r,
            ...bench.result,
            error: bench.error,
            log: bench.log,
            consoleErrors: consoleErrors.slice(0, 5),
        };
        results.push(row);
        console.log(
            JSON.stringify({
                scenario: s.name,
                r,
                fps: row.fps,
                frameMs: row.frameMs,
                gpuMs: row.gpuMs,
                calls: row.drawCalls,
                tris: row.triangles?.p50,
                body: row.bodyMeshes,
                horn: row.hornMeshes,
                garment: row.garment,
                performers: row.performers,
                tex: row.memory?.textures,
                up: row.artUploadMs,
                q: row.quality,
                kit: row.kit,
                err: row.error,
            }),
        );
        await context.close();
    }
}
await browser.close();
server.close();
if (OUT) {
    fs.writeFileSync(
        OUT,
        JSON.stringify(
            {
                build,
                args,
                width: W,
                height: H,
                dpr: DPR,
                seconds: SECONDS,
                results,
            },
            null,
            2,
        ),
    );
    console.log(`wrote ${OUT}`);
}
