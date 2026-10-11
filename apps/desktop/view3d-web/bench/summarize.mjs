#!/usr/bin/env node
// cspell:ignore blocklist swiftshader vsync tris webgl
/**
 * THROWAWAY (task/gpu-benchmark). Prints a Markdown table from one or more
 * run-bench.mjs result files: the median over repeats of each figure.
 *   node view3d-web/bench/summarize.mjs results.json [...]
 */
import fs from "node:fs";

const med = (a) => {
    const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
    return s.length ? s[Math.floor((s.length - 1) / 2)] : NaN;
};
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : "–");

for (const file of process.argv.slice(2)) {
    const d = JSON.parse(fs.readFileSync(file, "utf8"));
    const first = d.results.find((r) => r.drawingBuffer);
    console.log(`\n### ${file.split("/").pop()}`);
    console.log(
        `\nBuffer ${first?.drawingBuffer?.join(" × ")} at pixel ratio ${first?.pixelRatio}, ` +
            `kit ${first?.kit}, quality ${first?.quality}, flags ${d.args.join(" ")}, ` +
            `${d.seconds} s measured per run, ${Math.max(...d.results.map((r) => r.repeat)) + 1} repeat(s). ` +
            `Renderer: ${first?.renderer}.\n`,
    );
    console.log(
        "| Scenario | fps | frame ms p50 / p95 | GPU ms p50 / p95 | Δ GPU ms | draw calls | Δ calls | triangles | body / horn meshes | textures | art MB | upload ms |",
    );
    console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
    const by = new Map();
    for (const r of d.results) {
        if (!by.has(r.scenario)) by.set(r.scenario, []);
        by.get(r.scenario).push(r);
    }
    const base = by.get("baseline");
    const baseGpu = base ? med(base.map((r) => r.gpuMs?.p50)) : NaN;
    const baseCalls = base ? med(base.map((r) => r.drawCalls?.p50)) : NaN;
    for (const [name, rs] of by) {
        const ok = rs.filter((r) => !r.error);
        if (ok.length === 0) {
            console.log(`| ${name} | error: ${rs[0].error} |`);
            continue;
        }
        const gpu = med(ok.map((r) => r.gpuMs?.p50));
        const calls = med(ok.map((r) => r.drawCalls.p50));
        console.log(
            `| ${name} | ${f(med(ok.map((r) => r.fps)), 1)} | ${f(med(ok.map((r) => r.frameMs.p50)))} / ${f(med(ok.map((r) => r.frameMs.p95)))} | ` +
                `${f(gpu)} / ${f(med(ok.map((r) => r.gpuMs?.p95)))} | ${f(gpu - baseGpu)} | ${calls} | ${calls - baseCalls >= 0 ? "+" : ""}${calls - baseCalls} | ` +
                `${(med(ok.map((r) => r.triangles.p50)) / 1e6).toFixed(2)} M | ${ok[0].bodyMeshes} / ${ok[0].hornMeshes} | ${ok[0].memory.textures} | ` +
                `${f(ok[0].artTextureBytes / 2 ** 20, 1)} | ${f(med(ok.map((r) => r.artUploadMs ?? NaN)), 0)} |`,
        );
    }
}
