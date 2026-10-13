<!-- cspell:ignore blocklist Chipset KHTML swiftshader travelling tris untextured vsync webgl Subdiv -->

# GPU cost of extra uniform looks, silks and artwork textures

Ticket 15 (`.scratch/3d-customization/issues/15-gpu-benchmark.md`). These are
measurements only, with no decisions. Measured 2026-10-11 on branch
`task/gpu-benchmark`, based on `729f53dc`.

## Summary

On an M1 Pro at 1920 × 1080, in the web preview, on the LHB '26 Daft Punk demo
(385 marchers, `hs` kit, High, playing, press box camera):

- **Baseline:** 130 draw calls, 1.07 M triangles. Uncapped: 5.35 ms a frame
  (187 fps) at 1×, and 11.0 ms (91 fps) at 2× (3840 × 2073 buffer). With
  vsync at 2× on the 120 Hz panel: 75 fps.
- **Extra uniform looks** (real code path): +7 calls for 1 look, +30 for 4,
  +60 for 8, +101 for 16 (231 total). At 16 looks that is +85 body meshes and +16
  horn meshes, summing exactly to +101 calls: about 5.3 body draws and 1 horn draw a
  look (15 wearers don't cover all 7 body types). Triangles don't change. Frame
  time grows by 0.08, 0.09, 0.13 and 0.37 ms at 1×. At 2× the change stays
  inside the noise (≤ 0.12 ms), because that resolution is fill-bound.
- **40 wave silks in one instanced mesh** (24 × 16 cells, cloth material):
  +1 draw call, +31 k triangles, +0.17 ms at 1× and +0.29 ms at 2×. With the
  window's own flag meshes hidden (the "replace" case), +0 calls and
  +0.12 / +0.14 ms. At today's 56 × 36 grid: +161 k triangles and
  +0.32 / +0.70 ms.
- **Artwork array textures**, sampled by those silks: 4 layers of
  1024 × 1536 (32 MiB with mips) and 8 layers (64 MiB) cost about the same as
  untextured silks per frame (+0.03–0.07 ms over `silks40`). They add one
  texture, and their one-time upload took 22–48 ms (4 layers) and 62–72 ms
  (8 layers). Eight layers at 2048 × 3072 (256 MiB) cost the same per frame,
  but the upload took about 300 ms, a visible hitch.
- **Worst case combined** (16 looks + 40 silks + 8 layers): 232 calls,
  1.10 M triangles, 5.90 ms at 1× (+0.55 ms, 168 fps uncapped). At 2×,
  uncapped: 11.4 ms (+0.39 ms). At 2× with vsync: 70 fps against 75.

All draw calls stay under design.md §9's 300 budget. The 60 fps-on-Iris-Xe /
base-M1 budget is still **unmeasured**: this M1 Pro has a 14-core GPU, about
2× a base M1's 7 or 8 cores.

## Machine

`system_profiler SPDisplaysDataType`:

```text
Apple M1 Pro
  Chipset Model: Apple M1 Pro
  Type: GPU
  Bus: Built-In
  Total Number of Cores: 14
  Vendor: Apple (0x106b)
  Metal Support: Metal 4
  Display: Built-in Liquid Retina XDR, 3024 x 1964 Retina (120 Hz ProMotion)
```

CPU Apple M1 Pro, 32 GB RAM, macOS 26.6.2 (25G83), on AC power. Browser:
Playwright 1.60's Chromium (HeadlessChrome/148.0.7778.96), headless, with
`--enable-gpu --use-angle=metal --ignore-gpu-blocklist`. WebGL renderer
string: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified
Version)`. That is the real GPU, **not SwiftShader**. Without `--enable-gpu`,
the headless shell silently falls back to SwiftShader, so the driver passes
it and every result records the renderer string.

## Method

The harness is in `apps/desktop/view3d-web/bench/`. It is throwaway, and it
leaves `src/` and the preview untouched:

- `index.html` + `bench.tsx`: a copy of the web preview's entry with query
  knobs. It opens the demo in the preview's sql.js host, optionally edits the
  in-memory show, sets quality mode `high` and `saveOnBattery: false`, then
  mounts the real `View3dRoot`. It wraps the window's renderer `render`
  (`WebGLRenderer.render` is an instance method, so the hook is
  `Scene.prototype.onBeforeRender`). Each frame it records the wall time
  between renders, the CPU time inside `render`, `renderer.info.render.calls`
  and `.triangles` (shadow pass included), and an
  `EXT_disjoint_timer_query_webgl2` elapsed time around `render`.
- `run-bench.mjs`: serves `bench/dist`, then runs each scenario in a fresh
  browser context. Each run waits for the om-pose bodies and 3 s more, plays
  from page 1, warms up 5 s, then measures 15 s. Each scenario runs twice,
  the second time in reverse order to spread thermal drift. Tables report the
  median of the repeats.
- `summarize.mjs`: prints the tables below from the JSON files.

Scenarios:

- **Extra looks (`looks=N`), through the real code path.** For look k the
  harness renames 15 marchers of one section to the section name plus k
  trailing spaces, and gives that name its own `section_appearances` fill.
  `carryForSection` and `isGuard` trim the name, so instruments and hats
  don't change. The new fill makes a new `uniformKey`, so `MarcherBodies` and
  `HornSet` build a new look exactly as they would for a user's uniform.
  Sections, in order: Trumpet, Cymbals, Mellophone, Color Guard, Alto Sax,
  Piccolo, repeated, then Rifle and Trumpet. Every look's wearers carry, so
  each look also adds horn meshes. The baseline already has 86 body meshes
  (14 sections × up to 7 body types).
- **Silks (`silks=40`).** One `InstancedMesh` of a 0.914 × 1.372 m plane at
  24 × 16 cells (ticket 02's recommendation), `MeshStandardMaterial`
  (metalness 0, roughness 0.85, double-sided). An `onBeforeCompile`
  displaces it by two travelling sines, still at the pole and growing toward
  the fly, with analytic normals and a per-instance phase. Each frame the
  harness copies the 40 Color Guard marchers' placements from the window's
  `view3d-horn-flag6-*` meshes and puts the silk at pole-top height beside
  them, so the silks move with the guard and cover realistic screen area. No
  shadow casting, like the window's instrument meshes. `silkReplace=1` hides
  the window's own flag meshes, pole and 56 × 36 silk alike, to approximate
  the silk replacing today's flag. `silkGrid=56x36` repeats the test at
  today's grid.
- **Artwork (`tex=L`).** One `DataArrayTexture` of L RGBA8 layers with
  mipmaps, sRGB, sampled in the silk fragment shader by a per-instance layer,
  as in ticket 02's layer-array design. `artUploadMs` times
  `renderer.initTexture` plus `gl.finish()`. Memory is
  `w × h × 4 × L × 4/3`.

## Results

The headline figure is the **uncapped mean frame time**, run with
`--disable-gpu-vsync --disable-frame-rate-limit`. "fps" is 1000 / mean
interval. The p50 and p95 columns show a bimodal interval distribution (the
compositor alternates); the mean is the stable figure. Raw per-run data is in
`gpu-benchmark-1080p-*.json` next to this file.

Mean frame ms, uncapped (median of 2 runs; Δ against the baseline):

| Scenario                       | 1× (1920 × 1036) | Δ     | 2× (3840 × 2073) | Δ     | calls | triangles |
| ------------------------------ | ---------------- | ----- | ---------------- | ----- | ----- | --------- |
| baseline                       | 5.35             | 0     | 11.02            | 0     | 130   | 1.07 M    |
| looks1                         | 5.43             | +0.08 | 11.04            | +0.02 | 137   | 1.07 M    |
| looks4                         | 5.44             | +0.09 | 11.14            | +0.12 | 160   | 1.07 M    |
| looks8                         | 5.48             | +0.13 | 11.05            | +0.03 | 190   | 1.07 M    |
| looks16                        | 5.72             | +0.37 | 11.14            | +0.12 | 231   | 1.07 M    |
| silks40 (24 × 16)              | 5.52             | +0.17 | 11.31            | +0.29 | 131   | 1.10 M    |
| silks40, flag meshes hidden    | 5.47             | +0.12 | 11.16            | +0.14 | 130   | 1.09 M    |
| silks40 at 56 × 36             | 5.67             | +0.32 | 11.72            | +0.70 | 131   | 1.23 M    |
| silks40 + 4 layers 1024 × 1536 | 5.55             | +0.20 | 11.35            | +0.33 | 131   | 1.10 M    |
| silks40 + 8 layers 1024 × 1536 | 5.59             | +0.24 | 11.30            | +0.28 | 131   | 1.10 M    |
| silks40 + 8 layers 2048 × 3072 | 5.61             | +0.26 | 11.32            | +0.30 | 131   | 1.10 M    |
| looks16 + silks40 + 8 layers   | 5.90             | +0.55 | 11.41            | +0.39 | 232   | 1.10 M    |

(These means come from the first repeat in each JSON file. The tables below
are medians over both repeats of the p50 and p95 figures.)

With vsync at 2×, on the 120 Hz panel: baseline 75.2 fps, looks16 71.4,
silks40 + 8 layers 73.0, worst case 69.7. At 1× with vsync every scenario
held the 120 fps cap (smoke run; `GPU ms` about 5.0–5.7).

Generated tables (`summarize.mjs`):

### gpu-benchmark-1080p-1x.json

Buffer 1920 × 1036 at pixel ratio 1, kit hs, quality high, flags --ignore-gpu-blocklist --enable-gpu --use-angle=metal --disable-gpu-vsync --disable-frame-rate-limit, 15 s measured per run, 2 repeat(s). Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version).

| Scenario                   | fps   | frame ms p50 / p95 | GPU ms p50 / p95 | Δ GPU ms | draw calls | Δ calls | triangles | body / horn meshes | textures | art MB | upload ms |
| -------------------------- | ----- | ------------------ | ---------------- | -------- | ---------- | ------- | --------- | ------------------ | -------- | ------ | --------- |
| baseline                   | 186.8 | 5.00 / 9.80        | 7.47 / 9.25      | 0.00     | 130        | +0      | 1.07 M    | 87 / 13            | 7        | 0.0    | –         |
| looks1                     | 184.2 | 5.00 / 9.80        | 7.45 / 9.00      | -0.02    | 137        | +7      | 1.07 M    | 93 / 14            | 7        | 0.0    | –         |
| looks4                     | 183.3 | 5.10 / 9.80        | 7.35 / 9.14      | -0.12    | 160        | +30     | 1.07 M    | 113 / 17           | 7        | 0.0    | –         |
| looks8                     | 180.9 | 5.10 / 9.90        | 7.15 / 8.83      | -0.32    | 190        | +60     | 1.07 M    | 139 / 21           | 7        | 0.0    | –         |
| looks16                    | 174.8 | 5.30 / 10.50       | 7.09 / 8.82      | -0.38    | 231        | +101    | 1.07 M    | 172 / 29           | 7        | 0.0    | –         |
| silks40                    | 181.0 | 5.20 / 10.20       | 7.84 / 9.29      | 0.37     | 131        | +1      | 1.10 M    | 87 / 13            | 7        | 0.0    | –         |
| silks40-replace            | 182.7 | 5.10 / 10.00       | 7.85 / 9.48      | 0.38     | 130        | +0      | 1.09 M    | 87 / 12            | 7        | 0.0    | –         |
| silks40-56x36              | 175.6 | 5.30 / 10.50       | 8.16 / 9.76      | 0.69     | 131        | +1      | 1.23 M    | 87 / 13            | 7        | 0.0    | –         |
| silks40-tex4               | 180.3 | 5.20 / 10.30       | 7.93 / 9.53      | 0.46     | 131        | +1      | 1.10 M    | 87 / 13            | 8        | 32.0   | 22        |
| silks40-tex8               | 178.4 | 5.20 / 10.40       | 7.97 / 9.79      | 0.50     | 131        | +1      | 1.10 M    | 87 / 13            | 8        | 64.0   | 62        |
| silks40-tex8-2k            | 178.2 | 5.20 / 10.30       | 7.86 / 9.36      | 0.39     | 131        | +1      | 1.10 M    | 87 / 13            | 8        | 256.0  | 302       |
| worst-looks16-silks40-tex8 | 167.8 | 5.50 / 10.70       | 7.47 / 9.13      | 0.00     | 232        | +102    | 1.10 M    | 172 / 29           | 8        | 64.0   | 61        |

### gpu-benchmark-1080p-2x.json

Buffer 3840 × 2073 at pixel ratio 2, kit hs, quality high, flags --ignore-gpu-blocklist --enable-gpu --use-angle=metal --disable-gpu-vsync --disable-frame-rate-limit, 15 s measured per run, 2 repeat(s). Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version).

| Scenario                   | fps  | frame ms p50 / p95 | GPU ms p50 / p95 | Δ GPU ms | draw calls | Δ calls | triangles | body / horn meshes | textures | art MB | upload ms |
| -------------------------- | ---- | ------------------ | ---------------- | -------- | ---------- | ------- | --------- | ------------------ | -------- | ------ | --------- |
| baseline                   | 90.8 | 10.60 / 21.20      | 17.73 / 20.21    | 0.00     | 130        | +0      | 1.07 M    | 87 / 13            | 7        | 0.0    | –         |
| looks1                     | 90.4 | 10.60 / 21.20      | 17.79 / 20.65    | 0.06     | 137        | +7      | 1.07 M    | 93 / 14            | 7        | 0.0    | –         |
| looks4                     | 89.7 | 10.60 / 21.30      | 17.63 / 19.87    | -0.10    | 160        | +30     | 1.07 M    | 113 / 17           | 7        | 0.0    | –         |
| looks8                     | 90.4 | 10.60 / 20.80      | 17.26 / 19.78    | -0.47    | 190        | +60     | 1.07 M    | 139 / 21           | 7        | 0.0    | –         |
| looks16                    | 89.7 | 10.80 / 20.70      | 16.81 / 19.68    | -0.92    | 231        | +101    | 1.07 M    | 172 / 29           | 7        | 0.0    | –         |
| silks40                    | 88.4 | 10.90 / 21.60      | 18.32 / 20.75    | 0.59     | 131        | +1      | 1.10 M    | 87 / 13            | 7        | 0.0    | –         |
| silks40-replace            | 89.3 | 10.70 / 21.40      | 18.14 / 20.38    | 0.41     | 130        | +0      | 1.09 M    | 87 / 12            | 7        | 0.0    | –         |
| silks40-56x36              | 85.3 | 11.30 / 22.50      | 19.06 / 21.41    | 1.33     | 131        | +1      | 1.23 M    | 87 / 13            | 7        | 0.0    | –         |
| silks40-tex4               | 88.1 | 10.90 / 21.70      | 18.44 / 20.81    | 0.71     | 131        | +1      | 1.10 M    | 87 / 13            | 8        | 32.0   | 48        |
| silks40-tex8               | 87.9 | 10.90 / 21.70      | 18.44 / 21.06    | 0.71     | 131        | +1      | 1.10 M    | 87 / 13            | 8        | 64.0   | 72        |
| silks40-tex8-2k            | 88.3 | 10.90 / 21.70      | 18.38 / 21.20    | 0.65     | 131        | +1      | 1.10 M    | 87 / 13            | 8        | 256.0  | 305       |
| worst-looks16-silks40-tex8 | 87.0 | 10.90 / 21.40      | 17.39 / 20.33    | -0.34    | 232        | +102    | 1.10 M    | 172 / 29           | 8        | 64.0   | 62        |

### gpu-benchmark-1080p-2x-vsync.json

Buffer 3840 × 2073 at pixel ratio 2, kit hs, quality high, flags --ignore-gpu-blocklist --enable-gpu --use-angle=metal, 15 s measured per run, 1 repeat(s). Renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version).

| Scenario                   | fps  | frame ms p50 / p95 | GPU ms p50 / p95 | Δ GPU ms | draw calls | Δ calls | triangles | body / horn meshes | textures | art MB | upload ms |
| -------------------------- | ---- | ------------------ | ---------------- | -------- | ---------- | ------- | --------- | ------------------ | -------- | ------ | --------- |
| baseline                   | 75.2 | 13.00 / 15.70      | 9.54 / 10.99     | 0.00     | 130        | +0      | 1.07 M    | 87 / 13            | 7        | 0.0    | –         |
| looks16                    | 71.4 | 13.90 / 15.40      | 9.87 / 10.83     | 0.33     | 231        | +101    | 1.07 M    | 172 / 29           | 7        | 0.0    | –         |
| silks40-tex8               | 73.0 | 13.40 / 16.10      | 9.84 / 10.82     | 0.30     | 131        | +1      | 1.10 M    | 87 / 13            | 8        | 64.0   | 62        |
| worst-looks16-silks40-tex8 | 69.7 | 14.30 / 16.10      | 10.14 / 11.24    | 0.60     | 232        | +102    | 1.10 M    | 172 / 29           | 8        | 64.0   | 66        |

## Caveats

- **Not the integrated-GPU budget machine.** An M1 Pro (14-core GPU) is
  about twice a base M1. design.md §9's 60 fps on Iris Xe / M1 needs a rerun
  there. The draw-call, triangle and texture-memory figures carry over
  unchanged; frame times don't.
- **The ~49 fps baseline isn't directly comparable.** That figure was the
  built Electron app on "Fall Show 2026", window size unrecorded, before
  later changes. This is the web preview on LHB '26 Daft Punk pt. 2 (385
  marchers, the same 130 draws and about the same 1.1 M triangles as
  findings.md's "after" row), at fixed 1920 × 1036 or 3840 × 2073 buffers.
  The closest analogue, 2× with vsync, gave 75 fps.
- **`GPU ms` (the timer query) is not pure GPU time on ANGLE/Metal.** Run
  uncapped it exceeds the frame interval (7.5 ms against 5.35 ms at 1×),
  because frames overlap in the pipeline. It is plausible only with vsync
  (5.4 ms at 1×, 9.5 ms at 2×). Use the uncapped mean frame time for deltas,
  and the timer only as a rough figure.
- **Small deltas are near the noise.** Run-to-run spread is about ±0.1 ms at
  1× and ±0.15 ms at 2×. Look deltas below 8 looks, and the texture-versus-
  no-texture difference, sit inside it. The 2× looks16 figure (+0.12 ms)
  lower than 1× (+0.37 ms) shows that 2× is fill-bound, so draw-call
  overhead hides behind it.
- **One camera, one kit.** Press box, `hs`, High. From the press box every
  horn instance is in the far tier, so a look added about 1 horn draw, not 2.
  A field-level camera would add near-tier draws, and fill would differ.
  `pro` with its 485 k-triangle crowd wasn't run.
- **Silks are an approximation of the design, not the design.** They sit at
  a fixed offset from the marcher's root rather than skinned to the hand, so
  they ignore arm poses. They don't cast shadows. One tier, not near/far, so
  +1 draw, not ticket 02's +2. The vertex-shader wave matches ticket 02's
  technique, not its exact parameters.
- **Look emulation.** Every extra look here is a carrying section, so each
  adds horn draws as well as body draws. A look with no instrument would add
  only its body draws (5.3 a look here, up to 7 with
  wearers of every body type). Looks reshuffle existing marchers, so the
  triangle count doesn't change; only the draw split does.
- **Textures use one array, not separate textures.** Separate per-look
  textures (ticket 04's option 2) would add texture binds and, unless
  arrayed, more programs or draws. This doesn't measure that. Texture content
  is a synthetic pattern; uncompressed RGBA8, so content doesn't change the
  cost. KTX2 wasn't tested.
- Headless Chromium, not Electron. Both use ANGLE on Metal on macOS, but
  compositor pacing differs.

## C4.9: the test Garment

Added 2026-10-13 on `3d/c4-test-garment`, which merges `3d/c4-silk` (ADR
0004 step 6) into this harness. `garment=N|all` draws the test Garment
(`bench/garment.ts`, `bench/garmentMesh.ts`) on N performers spread through
the show, and `performers=N` cuts the show to N marchers.
`garmentSubdiv=0` gives 788 triangles a fit instead of 3,152. Results are
in `gpu-benchmark-garment-*.json`, and the reading is in
`docs/3d/findings.md`, "C4.9". The baseline on step 6 is 131 calls and
1.23 M triangles, not the 130 and 1.07 M above.

```bash
node view3d-web/bench/run-bench.mjs --uncapped --dpr 1 --repeat 2 --only baseline,garment40,garment150,garment300,garment-all,p40,p40-garment,p150,p150-garment,p300,p300-garment --out ../../research/gpu-benchmark-garment-1080p-1x.json
node view3d-web/bench/run-bench.mjs --uncapped --dpr 2 --repeat 2 --only baseline,garment-all,p300,p300-garment --out ../../research/gpu-benchmark-garment-1080p-2x.json
node view3d-web/bench/run-bench.mjs --uncapped --dpr 1 --repeat 2 --only baseline,garment-all,garment-all-788 --out ../../research/gpu-benchmark-garment-788-1080p-1x.json
```

## Rerun

From the worktree root, once per checkout:

```bash
pnpm install
pnpm --filter "@openmarch/desktop^..." build
```

Then, from `apps/desktop`:

```bash
npx vite build --config view3d-web/bench/vite.bench.config.mts
# 1920 x 1080 at 1x, uncapped (about 12 min)
node view3d-web/bench/run-bench.mjs --uncapped --dpr 1 --repeat 2 --out ../../research/gpu-benchmark-1080p-1x.json
# the same at 2x
node view3d-web/bench/run-bench.mjs --uncapped --dpr 2 --repeat 2 --out ../../research/gpu-benchmark-1080p-2x.json
# with vsync, a few scenarios
node view3d-web/bench/run-bench.mjs --dpr 2 --repeat 1 --only baseline,looks16,silks40-tex8,worst-looks16-silks40-tex8 --out ../../research/gpu-benchmark-1080p-2x-vsync.json
node view3d-web/bench/summarize.mjs ../../research/gpu-benchmark-1080p-*.json
```

Other options: `--headed` (a visible window), `--shots <dir>` (a screenshot
per scenario, for checking the silks and looks render), `--only a,b`,
`--seconds N`, `--width`/`--height`, and `--swiftshader` (software
rendering, labeled as such in the renderer string). One scenario by hand:
serve `bench/dist` and open
`index.html?looks=8&silks=40&tex=4&texSize=1024x1536`. The result is in
`window.__bench`.

On an Intel Iris Xe Windows laptop, drop `--use-angle=metal` (edit `args`
in `run-bench.mjs`; ANGLE picks D3D11). Check that each result's `renderer`
names the Intel GPU, and run on AC power.
