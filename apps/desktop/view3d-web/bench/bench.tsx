/**
 * THROWAWAY (task/gpu-benchmark, ticket 15). The web preview's entry plus
 * scenario knobs, to measure what extra uniform looks, ~40 wave silks and
 * artwork textures cost on the GPU. Nothing in `src/` changes: the knobs
 * edit the in-memory show before the window mounts, or add three.js objects
 * next to the window's own, and a wrapper around `WebGLRenderer.render`
 * records every frame.
 *
 * Query string (all optional):
 *   demo=lhb-daft-punk   which demo show
 *   quality=high|low     the window's quality mode
 *   looks=N              N extra uniform looks (0..16), real code path
 *   silks=N              N wave silks in one instanced cloth mesh
 *   silkGrid=24x16       silk cells (out x along)
 *   silkReplace=1        hide the window's own flag meshes (pole + silk)
 *   tex=L                L artwork layers in one DataArrayTexture, sampled by the silks
 *   texSize=1024x1536    layer size
 *   performers=N         keep N of the show's marchers, spread evenly (C4.9)
 *   garment=N|all        the test Garment on N performers, spread evenly (C4.9)
 *   garmentSubdiv=1      subdivision levels: 0 is 788 triangles a fit, 1 is 3,152
 *   garmentOffset=0.012  how far outside the body the Garment sits, m
 *   warmup=5 seconds=15  playback warm-up and measured window
 *
 * Results land in `window.__bench` for run-bench.mjs.
 */
// cspell:ignore Subdiv beginnormal dwdx dwdy highp tris travelling webgl untextured
import * as THREE from "three";
import React from "react";
import ReactDOM from "react-dom/client";
import type { Database } from "sql.js";
import "../styles.css";
import "@fontsource/dm-mono";
import "@fontsource/dm-sans";
import { DEMOS } from "../demos";
import { host } from "../host";
import { openDemo } from "../open";
import { useView3dSceneStore } from "@/view3d/window/sceneStore";
import { Composer } from "@/view3d/render/composer";
import { pickSpread } from "./garment";
import { TestGarment } from "./garmentMesh";

const q = new URLSearchParams(window.location.search);
const num = (k: string, d: number) => Number(q.get(k) ?? d);
const dims = (k: string, d: string) =>
    (q.get(k) ?? d).split("x").map(Number) as [number, number];
const P = {
    demo: q.get("demo") ?? "lhb-daft-punk",
    quality: (q.get("quality") ?? "high") as "high" | "low",
    looks: num("looks", 0),
    silks: num("silks", 0),
    silkGrid: dims("silkGrid", "24x16"),
    silkReplace: q.get("silkReplace") === "1",
    tex: num("tex", 0),
    texSize: dims("texSize", "1024x1536"),
    performers: q.has("performers") ? num("performers", 0) : null,
    /** -1: every performer */
    garment: q.get("garment") === "all" ? -1 : num("garment", 0),
    garmentSubdiv: num("garmentSubdiv", 1),
    garmentOffset: num("garmentOffset", 0.012),
    warmup: num("warmup", 5),
    seconds: num("seconds", 15),
};

declare global {
    interface Window {
        __bench: {
            done: boolean;
            error?: string;
            result?: unknown;
            log: string[];
        };
    }
}
window.__bench = { done: false, log: [] };
const log = (m: string) => {
    window.__bench.log.push(m);
    console.info(`[bench] ${m}`);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ----- Extra uniform looks: split sections into new ones, each its own fill -----

/**
 * Each extra look takes 15 marchers from a section and renames it with k
 * trailing spaces, with its own fill. `carryForSection` and `isGuard` trim
 * the name, so the marchers keep their instrument and hat; the new fill makes
 * a new `uniformKey`, so the window builds a new look (bodies and horns).
 */
const LOOK_PLAN = [
    "Trumpet",
    "Cymbals",
    "Mellophone",
    "Color Guard",
    "Alto Sax",
    "Piccolo",
    "Trumpet",
    "Cymbals",
    "Mellophone",
    "Color Guard",
    "Alto Sax",
    "Piccolo",
    "Trumpet",
    "Cymbals",
    "Rifle",
    "Trumpet",
];
const PER_LOOK = 15;

function addLooks(db: Database, n: number) {
    for (let k = 1; k <= n; k++) {
        const base = LOOK_PLAN[k - 1];
        const name = base + " ".repeat(k);
        const ids =
            db
                .exec(
                    `SELECT id FROM marchers WHERE section = ? ORDER BY id LIMIT ${PER_LOOK}`,
                    [base],
                )[0]
                ?.values.map((v) => Number(v[0])) ?? [];
        for (const id of ids)
            db.run("UPDATE marchers SET section = ? WHERE id = ?", [name, id]);
        const c = new THREE.Color().setHSL(k / 17, 0.7, 0.45);
        const fill = `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},1)`;
        db.run(
            "INSERT INTO section_appearances (section, fill_color) VALUES (?, ?)",
            [name, fill],
        );
        log(`look ${k}: ${ids.length} marchers from ${base}, ${fill}`);
    }
}

// ----- Performers: keep N of the show's marchers -----

/**
 * Keeps `n` marchers spread evenly through the show (by id, so every
 * section keeps about its share), deleting the rest and every row that
 * names them.
 */
function trimShow(db: Database, n: number) {
    const ids =
        db
            .exec("SELECT id FROM marchers ORDER BY id")[0]
            ?.values.map((v) => Number(v[0])) ?? [];
    const keep = new Set(pickSpread(ids.length, n).map((i) => ids[i]));
    const drop = ids.filter((id) => !keep.has(id));
    const tables =
        db
            .exec(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'marchers'",
            )[0]
            ?.values.map((v) => String(v[0])) ?? [];
    const list = drop.join(",");
    for (const t of tables) {
        const cols = db.exec(`PRAGMA table_info("${t}")`)[0]?.values ?? [];
        if (cols.some((c) => c[1] === "marcher_id"))
            db.run(`DELETE FROM "${t}" WHERE marcher_id IN (${list})`);
    }
    db.run(`DELETE FROM marchers WHERE id IN (${list})`);
    log(`performers: kept ${keep.size} of ${ids.length}`);
}

// ----- Silks: one InstancedMesh, stateless vertex-shader wave -----

const SILK_W = 0.914; // 36 in, out from the pole
const SILK_H = 1.372; // 54 in, along the pole

interface Silks {
    mesh: THREE.InstancedMesh;
    uTime: { value: number };
}

function buildSilks(
    count: number,
    [gx, gy]: [number, number],
    art: THREE.DataArrayTexture | null,
): Silks {
    const geo = new THREE.PlaneGeometry(SILK_W, SILK_H, gx, gy);
    geo.translate(SILK_W / 2, 0, 0); // the pole at x = 0
    const phase = new Float32Array(count);
    const layer = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        phase[i] = i * 2.399;
        layer[i] = art ? i % art.image.depth : 0;
    }
    geo.setAttribute("aPhase", new THREE.InstancedBufferAttribute(phase, 1));
    geo.setAttribute("aLayer", new THREE.InstancedBufferAttribute(layer, 1));
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
    });
    const uTime = { value: 0 };
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = uTime;
        if (art) shader.uniforms.uArt = { value: art };
        shader.vertexShader = shader.vertexShader
            .replace(
                "#include <common>",
                `#include <common>
attribute float aPhase;
attribute float aLayer;
uniform float uTime;
varying float vLayer;
varying vec2 vArtUv;`,
            )
            .replace(
                "#include <beginnormal_vertex>",
                `float sx = position.x / ${SILK_W.toFixed(3)};
float ph1 = position.x * 6.0 - uTime * 5.0 + aPhase;
float ph2 = position.x * 11.0 + position.y * 3.0 - uTime * 7.3 + aPhase * 1.7;
float wv = sin(ph1) + 0.4 * sin(ph2);
float amp = 0.07 * sx;
float w = amp * wv;
float dwdx = (0.07 / ${SILK_W.toFixed(3)}) * wv + amp * (6.0 * cos(ph1) + 4.4 * cos(ph2));
float dwdy = amp * 1.2 * cos(ph2);
vec3 objectNormal = normalize(vec3(-dwdx, -dwdy, 1.0));
vLayer = aLayer;
vArtUv = uv;`,
            )
            .replace(
                "#include <begin_vertex>",
                "vec3 transformed = vec3(position.xy, position.z + w);",
            );
        if (art) {
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    "#include <common>",
                    `#include <common>
uniform highp sampler2DArray uArt;
varying float vLayer;
varying vec2 vArtUv;`,
                )
                .replace(
                    "#include <map_fragment>",
                    "diffuseColor.rgb *= texture(uArt, vec3(vArtUv, vLayer)).rgb;",
                );
        }
    };
    material.customProgramCacheKey = () => `bench-silk-${art ? 1 : 0}`;
    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.name = "bench-silks";
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    // like the window's instrument meshes today (hornSet.ts)
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.count = 0;
    return { mesh, uTime };
}

/** Pole top, beside the marcher's right hand, silk facing sideways. */
const SILK_OFFSET = new THREE.Matrix4().makeTranslation(0.25, 2.2, 0.2);
const scratch = new THREE.Matrix4();

function placeSilks(silks: Silks, flagMeshes: THREE.InstancedMesh[]) {
    const out = silks.mesh.instanceMatrix.array as Float32Array;
    let n = 0;
    for (const m of flagMeshes) {
        const src = m.instanceMatrix.array as Float32Array;
        for (
            let i = 0;
            i < m.count && n < silks.mesh.instanceMatrix.count;
            i++
        ) {
            scratch.fromArray(src, i * 16).multiply(SILK_OFFSET);
            scratch.toArray(out, n * 16);
            n++;
        }
    }
    silks.mesh.count = n;
    silks.mesh.instanceMatrix.needsUpdate = true;
    silks.uTime.value = performance.now() / 1000;
}

// ----- Artwork: one DataArrayTexture, L layers -----

function buildArt(layers: number, [w, h]: [number, number]) {
    const data = new Uint8Array(w * h * 4 * layers);
    // a cheap pattern; content doesn't change the cost of an uncompressed texture
    for (let i = 0; i < data.length; i += 4) {
        const p = i >> 2;
        data[i] = (p * 37) & 255;
        data[i + 1] = (p >> 5) & 255;
        data[i + 2] = (p >> 11) & 255;
        data[i + 3] = 255;
    }
    const tex = new THREE.DataArrayTexture(data, w, h, layers);
    tex.format = THREE.RGBAFormat;
    tex.type = THREE.UnsignedByteType;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
}

// ----- Frame recording around WebGLRenderer.render -----

interface Frame {
    t: number;
    cpuMs: number;
    calls: number;
    triangles: number;
}

const ctx: {
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.Camera | null;
    recording: boolean;
    frames: Frame[];
    gpuMs: number[];
    gpuDisjoint: number;
    beforeRender: (() => void) | null;
} = {
    renderer: null,
    scene: null,
    camera: null,
    recording: false,
    frames: [],
    gpuMs: [],
    gpuDisjoint: 0,
    beforeRender: null,
};

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };
let timerExt: TimerExt | null | undefined;
const pending: WebGLQuery[] = [];

function pollQueries(gl: WebGL2RenderingContext, ext: TimerExt) {
    while (pending.length > 0) {
        const query = pending[0];
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        const ns = gl.getQueryParameter(query, gl.QUERY_RESULT) as number;
        gl.deleteQuery(query);
        if (!ctx.recording) continue;
        if (disjoint) ctx.gpuDisjoint++;
        else ctx.gpuMs.push(ns / 1e6);
    }
}

/** The window's composer, from its once-a-frame update (step 6's renderer). */
let composer: Composer | null = null;
const composerUpdate = Composer.prototype.update;
Composer.prototype.update = function (this: Composer, ...args) {
    composer = this;
    return composerUpdate.apply(this, args);
} as Composer["update"];

const seenScenes = new Set<THREE.Scene>();
(window as unknown as { __benchCtx: unknown }).__benchCtx = { ctx, seenScenes };
/**
 * WebGLRenderer defines `render` per instance, in its constructor, so the
 * prototype can't be wrapped. `renderer.render` calls `scene.onBeforeRender`
 * (a prototype method) first: that hands over the renderer, whose own
 * `render` is then wrapped. The first frame goes unrecorded.
 */
const wrapped = new WeakSet<THREE.WebGLRenderer>();
THREE.Scene.prototype.onBeforeRender = function (
    renderer: THREE.WebGLRenderer,
) {
    if (wrapped.has(renderer)) return;
    wrapped.add(renderer);
    const originalRender = renderer.render.bind(renderer);
    renderer.render = (scene: THREE.Object3D, camera: THREE.Camera) =>
        recordRender(renderer, originalRender, scene, camera);
} as THREE.Scene["onBeforeRender"];

function recordRender(
    renderer: THREE.WebGLRenderer,
    originalRender: (scene: THREE.Object3D, camera: THREE.Camera) => void,
    scene: THREE.Object3D,
    camera: THREE.Camera,
) {
    ctx.renderer = renderer;
    // PMREM and others render their own scenes too: remember them all, and
    // pick the window's by its marchers group.
    if ((scene as THREE.Scene).isScene) seenScenes.add(scene as THREE.Scene);
    const main = scene === ctx.scene;
    if (main) {
        ctx.camera = camera;
        ctx.beforeRender?.();
    }
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (timerExt === undefined)
        timerExt = gl.getExtension(
            "EXT_disjoint_timer_query_webgl2",
        ) as TimerExt | null;
    const rec = main && ctx.recording;
    let query: WebGLQuery | null = null;
    if (timerExt && rec && pending.length < 16) {
        query = gl.createQuery();
        if (query) gl.beginQuery(timerExt.TIME_ELAPSED_EXT, query);
    }
    const t0 = performance.now();
    originalRender(scene, camera);
    const cpuMs = performance.now() - t0;
    if (query && timerExt) {
        gl.endQuery(timerExt.TIME_ELAPSED_EXT);
        pending.push(query);
    }
    if (timerExt) pollQueries(gl, timerExt);
    if (rec)
        ctx.frames.push({
            t: t0,
            cpuMs,
            calls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
        });
}

// ----- Stats -----

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
const pct = (a: number[], p: number) => {
    if (a.length === 0) return NaN;
    const s = sorted(a);
    return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const r2 = (x: number) => Math.round(x * 100) / 100;

function sceneBreakdown(scene: THREE.Scene) {
    const out: Record<string, number> = {};
    let bodyMeshes = 0;
    let hornMeshes = 0;
    scene.traverseVisible((o) => {
        const m = o as THREE.InstancedMesh;
        if (!m.isInstancedMesh || m.count === 0) return;
        if (m.name.startsWith("view3d-horn-")) hornMeshes++;
        else if (m.parent?.name === "view3d-marchers") bodyMeshes++;
        out[m.name || "(unnamed)"] = (out[m.name || "(unnamed)"] ?? 0) + 1;
    });
    return { bodyMeshes, hornMeshes, instancedMeshesByName: out };
}

// ----- Run -----

const rootElement = document.getElementById("root") as HTMLElement;

async function waitFor<T>(
    fn: () => T | null | undefined | false,
    ms: number,
    what: string,
) {
    const end = performance.now() + ms;
    for (;;) {
        const v = fn();
        if (v) return v;
        if (performance.now() > end)
            throw new Error(`timed out waiting for ${what}`);
        await sleep(100);
    }
}

async function run() {
    window.view3d = host.api;
    const demo = DEMOS.find((d) => d.id === P.demo) ?? DEMOS[0];
    await openDemo(demo);
    const db = (host as unknown as { db: Database }).db;
    if (P.performers !== null) trimShow(db, P.performers);
    if (P.looks > 0) addLooks(db, P.looks);

    const store = useView3dSceneStore.getState();
    store.setPowerPrefs({ pauseWhenIdle: true, saveOnBattery: false });
    store.setQualityMode(P.quality);

    const url = new URL(window.location.href);
    url.searchParams.set("view", "3d");
    url.searchParams.set("theme", "dark");
    window.history.replaceState(null, "", url);
    const { default: View3dRoot } = await import("@/view3d/window/View3dRoot");
    ReactDOM.createRoot(rootElement).render(<View3dRoot />);

    const t0 = performance.now();
    // ready: om-pose bodies built (not the stand-in cylinders)
    await waitFor(
        () => {
            for (const sc of seenScenes) {
                const g = sc.getObjectByName("view3d-marchers");
                if (g && g.children.length > 2) {
                    ctx.scene = sc;
                    return g;
                }
            }
            return null;
        },
        180_000,
        "marchers",
    );
    log(`marchers built after ${(performance.now() - t0).toFixed(0)} ms`);
    await sleep(3000);
    const renderer = ctx.renderer!;
    const scene = ctx.scene!;

    let art: THREE.DataArrayTexture | null = null;
    let artUploadMs: number | null = null;
    if (P.tex > 0) {
        const tb = performance.now();
        art = buildArt(P.tex, P.texSize);
        const tc = performance.now();
        renderer.initTexture(art);
        (renderer.getContext() as WebGL2RenderingContext).finish();
        artUploadMs = performance.now() - tc;
        log(
            `art: ${P.tex} x ${P.texSize.join("x")} built ${(tc - tb).toFixed(0)} ms, uploaded ${artUploadMs.toFixed(0)} ms`,
        );
    }

    let flagMeshes: THREE.InstancedMesh[] = [];
    const findFlags = () => {
        flagMeshes = [];
        scene.traverse((o) => {
            if (o.name.startsWith("view3d-horn-flag6-"))
                flagMeshes.push(o as THREE.InstancedMesh);
        });
    };
    if (P.silks > 0) {
        const silks = buildSilks(P.silks, P.silkGrid, art);
        scene.add(silks.mesh);
        findFlags();
        let n = 0;
        ctx.beforeRender = () => {
            if (++n % 120 === 0 || flagMeshes.length === 0) findFlags();
            if (P.silkReplace) for (const m of flagMeshes) m.visible = false;
            placeSilks(silks, flagMeshes);
        };
        log(
            `silks: ${P.silks} at ${P.silkGrid.join("x")}, flag meshes ${flagMeshes.length}`,
        );
    }

    let garment: TestGarment | null = null;
    let garmentBuildMs: number | null = null;
    if (P.garment !== 0) {
        const bodyMeshes = () => {
            const out: THREE.InstancedMesh[] = [];
            scene.getObjectByName("view3d-marchers")?.children.forEach((o) => {
                if (o.name.startsWith("view3d-marchers-"))
                    out.push(o as THREE.InstancedMesh);
            });
            return out;
        };
        let builtFor: { composer: Composer; bodies: THREE.Object3D[] } | null =
            null;
        const currentComposer = () => {
            if (!composer)
                throw new Error("no composer: is step 6's renderer here?");
            return composer;
        };
        const build = () => {
            const c = currentComposer();
            const bodies = bodyMeshes();
            if (
                builtFor &&
                builtFor.composer === c &&
                builtFor.bodies.length === bodies.length &&
                builtFor.bodies.every((b, i) => b === bodies[i])
            )
                return;
            garment?.dispose();
            const tb = performance.now();
            const total = c.n;
            const wearers = new Set(
                pickSpread(total, P.garment < 0 ? total : P.garment),
            );
            garment = new TestGarment(bodies, wearers, c, {
                subdivide: P.garmentSubdiv,
                offset: P.garmentOffset,
            });
            scene.add(garment.group);
            garmentBuildMs = performance.now() - tb;
            builtFor = { composer: c, bodies };
            log(
                `garment: ${garment.instances} wearers of ${total}, ${garment.drawCalls} fits, ` +
                    `${JSON.stringify(garment.trianglesByFit)} triangles, built ${garmentBuildMs.toFixed(0)} ms`,
            );
        };
        if (useView3dSceneStore.getState().quality !== "high")
            log("WARNING: the test Garment is drawn at high quality only");
        build();
        const silkHook = ctx.beforeRender;
        let n = 0;
        ctx.beforeRender = () => {
            silkHook?.();
            if (++n % 120 === 0) build();
            garment?.writeFrame();
        };
    }

    // play from the first page
    host.runPlayback("firstPage");
    await sleep(200);
    const play = () => {
        if (!host.playing) {
            host.runPlayback("firstPage");
            host.runPlayback("playPause");
        }
    };
    play();
    await sleep(P.warmup * 1000);
    if (useView3dSceneStore.getState().quality !== P.quality)
        log(`WARNING: quality is ${useView3dSceneStore.getState().quality}`);

    ctx.frames = [];
    ctx.gpuMs = [];
    ctx.recording = true;
    const end = performance.now() + P.seconds * 1000;
    let restarts = 0;
    while (performance.now() < end) {
        if (!host.playing) {
            restarts++;
            play();
        }
        await sleep(100);
    }
    ctx.recording = false;
    host.pause();

    const frames = ctx.frames;
    const intervals: number[] = [];
    for (let i = 1; i < frames.length; i++) {
        const d = frames[i].t - frames[i - 1].t;
        if (d < 250) intervals.push(d); // drop gaps from a playback restart
    }
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const calls = frames.map((f) => f.calls);
    const tris = frames.map((f) => f.triangles);
    const st = useView3dSceneStore.getState();
    const textureBytes = art
        ? Math.round(P.texSize[0] * P.texSize[1] * 4 * P.tex * (4 / 3))
        : 0;
    const result = {
        params: P,
        renderer: dbg
            ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER),
        userAgent: navigator.userAgent,
        drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
        pixelRatio: renderer.getPixelRatio(),
        kit: st.kitId,
        quality: st.quality,
        shadowMap: renderer.shadowMap.enabled,
        frames: frames.length,
        restarts,
        frameMs: {
            mean: r2(mean(intervals)),
            p50: r2(pct(intervals, 50)),
            p95: r2(pct(intervals, 95)),
            p99: r2(pct(intervals, 99)),
        },
        fps: r2(1000 / mean(intervals)),
        renderCpuMs: {
            p50: r2(
                pct(
                    frames.map((f) => f.cpuMs),
                    50,
                ),
            ),
            p95: r2(
                pct(
                    frames.map((f) => f.cpuMs),
                    95,
                ),
            ),
        },
        gpuMs: timerExt
            ? {
                  n: ctx.gpuMs.length,
                  disjoint: ctx.gpuDisjoint,
                  p50: r2(pct(ctx.gpuMs, 50)),
                  p95: r2(pct(ctx.gpuMs, 95)),
                  mean: r2(mean(ctx.gpuMs)),
              }
            : null,
        drawCalls: {
            min: Math.min(...calls),
            p50: pct(calls, 50),
            max: Math.max(...calls),
        },
        triangles: {
            min: Math.min(...tris),
            p50: pct(tris, 50),
            max: Math.max(...tris),
        },
        memory: { ...renderer.info.memory },
        programs: renderer.info.programs?.length ?? null,
        artUploadMs: artUploadMs === null ? null : r2(artUploadMs),
        artTextureBytes: textureBytes,
        performers: composer?.n ?? null,
        garment: garment
            ? {
                  wearers: (garment as TestGarment).instances,
                  drawCalls: (garment as TestGarment).drawCalls,
                  trianglesByFit: (garment as TestGarment).trianglesByFit,
                  buildMs: garmentBuildMs === null ? null : r2(garmentBuildMs),
              }
            : null,
        ...sceneBreakdown(scene),
    };
    window.__bench.result = result;
    window.__bench.done = true;
    log("done");
}

run().catch((error: unknown) => {
    console.error(error);
    window.__bench.error = String(error);
    window.__bench.done = true;
});
