---
phase: C1
title: Customization, Library and import
status: not-started
owner: none
branch: none
pr: none
depends_on: [5]
updated: 2026-10-11
---

# C1: Customization, Library and import

<!-- cspell:words meshopt dedup CMYK -->

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). The customization track, C1 to C5, slices the 3D customization design (props, equipment, uniforms and artwork). It is a separate track beside the numbered phases, with its own `C` prefix, because `docs/3d/fidelity.md` already plans Phases 6 to 8 (owner, ticket 26 review item 24). The early Phase 6 draft's two packages are folded in as C4.10 and C4.11. No package here can be claimed until C1.1 is done.

## Goal

The approvals and outside gates the whole customization effort waits on, then the parts that don't need the timeline: real units and the size catalog, `sharp`, the local Library, the model and Artwork import pipelines, the import review, Artwork templates and the Starter kit. The show-side Library tables follow once the timeline is merged.

## Track order and gates (C1 to C5)

```text
C1.1 approval ─┬─ P8 Library and import (no timeline needed)
C1.2 legal ────┼──────────────────── gates C1.13 ship, C5.8, om-pose clips in a release
C1.3 timeline ─┴─ C1.11 show tables
ADR 0004 step 2 (C3.1) ─── C2.1 PR 1013 rebuilt ── P9 items on the timeline
ADR 0004 steps 3, 8 (C3.2-3) ─── P10 Carry, Silk, Uniform cues; Items tab
ADR 0004 step 4 (C4.1) ─── C4.5 props and platforms in 3D
C4.10 Band/Guard defaults, C4.11 swing flags (early, no C1.1 needed)
ADR 0004 step 6 built (C4.2) ─── C4.3 aLook + C4.4 silk wave, on step 6's branch
C4.2 + C4.3 + C4.4 + C4.9 test Garment ─── C4.7 one integrated-GPU run (human)
C4.7 ─── C4.8 step 6 merged, then C4.3, C4.4 ─── C4.6 held items
C4.7 + C4.3 merged ─── P12 Artwork and uniforms
```

## Read first

- [../props-spec.md](../props-spec.md): the design spec. Ticket numbers on each package are the ones it cites; read those sections.
- [ADR 0002](../../adr/0002-3d-view.md), amendment of 2026-10-11 (D-9 to D-22)
- `CONTEXT.md` at the repo root: **Library**, **Library item**, **Version**, **Artwork**, **Artwork template**, **Starter kit**, **Credits**
- Findings: `research/gltf-import`, `research/ktx2-wasm-sharp`, `task/ktx2-sharp-spike`, `research/size-standards`, `research/ip-licensing` (branch, file `research/<name>.md`)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### C1.1: Approve the amendments and open customization work

- Owner: human
- Status: done
- PR: none
- Parallel: no
- Depends on: —

**Goal:** the owner approves the ADR 0002 amendment (D-9 to D-22), the ADR 0004 amendment draft, and these phase files, or asks for changes.

**Scope:** answer or defer what is left in `DRAFT-NOTES.md` (the review answers of 2026-10-11 are applied); lift [../WORKER.md](../WORKER.md)'s "Scope is the MVP" policy for the customization track, C1 to C5 (it forbids imports today); add the track to [../plan.md](../plan.md) section 3; make the worker docs accept `C<track>.<n>` IDs (below); move the ADR 0004 amendment draft onto the cue branch.

**Tickets:** 26.

**Worker docs for `C` IDs.** Nothing parses phase IDs as numbers in code: `scripts/3d/run-worker.sh` passes the ID through and its `VIEW3D-STATUS` regex (`[A-Za-z0-9.]+`) accepts `C1.2`; `scripts/3d/coord.sh` doesn't read IDs; the `3d-work` skill and `3d-worker` agent only name `P<phase>.<n>` in their descriptions and defer to `WORKER.md`. The prose and one grep assume the `P` form and need these edits:

- `docs/3d/README.md`: the status grep `^### P[0-9]+\.[0-9]+` becomes `^### [PC][0-9]+\.[0-9]+`; the ID convention reads "`P<phase>.<n>`, or `C<track>.<n>` for the customization track"; code branches for the track are `3d/c<track>-<short-name>`.
- `docs/3d/WORKER.md`: the same ID and branch forms in steps 1, 3 and 4; step 2's "Prefer lower phases, then lower IDs" says how `P` and `C` packages order against each other; "Cross-phase note from P<n>" also allows `C<n>`.
- `.claude/skills/3d-work/SKILL.md` and `.claude/agents/3d-worker.md`: the descriptions and argument hint name both forms.

**Done when:** the amendment's status line reads approved, WORKER.md's policy names the C track and the ID changes below are in, the ADR 0004 text has a home on the cue branch, and `DRAFT-NOTES.md` is deleted.

**Checks:** none (a human verdict).

### C1.2: Legal gate for built-ins and the Starter kit

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** counsel answers lawyer questions Q1 (CC0 art beside AGPL code; whether the CLA covers relicensing contributed assets), Q3 (om-pose clips derived from Cadets 2019 footage), Q4 (GPL vs AGPL `LICENSE` text) and Q5 (Terms §9.1's reach), from `research/ip-licensing.md` §7.

**Scope:** blocks shipping built-ins (C5.8), the Starter kit (C1.13) and any release that ships the om-pose clips (Q3; ADR 0002 D-7 correction), not building them. The Starter kit's reference bodies and v4 skeleton also wait for om-pose to adopt a license upstream. The `LICENSE` and Terms §9.1 fix ships as its own change outside this effort once Q4 and Q5 are answered.

**Tickets:** 14, 16, 26.6.

**Done when:** the answers are recorded in `docs/3d/findings.md` and the owner says built-ins may ship.

**Checks:** none (a human verdict).

### C1.3: Timeline merged into 3d-async

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker for the merge every schema package waits on: `main`, with `timeline/timeline-try-2` landed in it, merged into `3d-async` in one commit that renumbers the 3D migrations after the timeline's (`docs/3d/performer-behavior.md` section 10, on the cue branches).

**Scope:** none here; the lead marks it done when the merge lands.

**Tickets:** 23, 24.

**Done when:** `3d-async` contains the timeline tables and its migrations open page-mode and converted files.

**Checks:** the lead records the merge commit in the progress log.

### C1.4: Real units and the size catalog

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1

**Goal:** one platform-free module that every later package uses for sizes.

**Scope:** meters in storage, never rounded on write; exact feet input (`4'6"`, `4.5 ft`, `54 in`, 0.3048 m/ft); display rounding to ⅛ in or 1 cm per setting, with a value typed in feet re-displayed as typed; the size standards catalog (poles, silk Cuts, rifles, sabres, floors, flat props) stored from its source units; per-kind plausible model size ranges; soft "WGI" warnings (equipment under 24 in, floors over 78 × 106 ft); the size preset shape the local Library saves.

**Tickets:** 03, 05, 08.

**Done when:** catalog sizes round-trip without drift (a 36 × 54 in silk stays exact) and every catalog entry names its source.

**Checks:** unit tests for parsing, rounding and the catalog; type-check, lint, format, spellcheck.

### C1.5: `sharp` in the packaged app

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1

**Goal:** `sharp` runs in main in packaged builds on every release platform.

**Scope:** add `sharp` to `apps/desktop`; `asarUnpack` for `sharp` and `@img`; a `files` filter; macOS dylib signing and notarization; the Linux glib check; Windows. Reuse the spike in `task/ktx2-sharp-spike` (`spike/ktx2-sharp/`, `app-hooks.patch`). Use `pnpm exec electron-builder`, not `npx`.

**Tickets:** 11, 12, 20.

**Done when:** a packaged, signed and notarized macOS build, a Windows build and a Linux build each resize a 2048² image to 512² in main; the app-size delta per platform is in `docs/3d/findings.md`.

**Checks:** the three packaged runs, recorded; type-check, lint, format.

### C1.6: Local Library store

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.1

**Goal:** the user's Library on disk, shaped like a future cloud cache.

**Scope:** `userData/library/`: content-addressed `blobs/sha256/ab/<hash>`, one manifest JSON per item listing its Versions, an index rebuilt from manifests; items with a stable UUID, kind (Model, Artwork, Uniform), name, tags, timestamps, original filename, `derivedFrom`; license metadata (`license` as SPDX or `LicenseRef-Proprietary` / `LicenseRef-Unknown`, `author`, `sourceUrl`, `attribution`, `modified`) outside the Version hash; built-ins read-only with fixed UUIDs, editing one makes a copy with `modified` set; identical bytes reuse the existing item; original source files kept outside the hash; never pruned automatically; size presets. Main process only.

**Tickets:** 06, 08, 11, 16.

**Done when:** the store round-trips items and Versions, the index rebuilds from manifests alone, and editing a built-in yields a copy that inherits its license fields.

**Checks:** unit tests over a temp directory; type-check, lint, format, spellcheck.

### C1.7: Model import pipeline

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.4, C1.5, C1.6

**Goal:** a GLB or glTF in, a normalized GLB plus sidecar and an import report out, in Node.

**Scope:** `gltf-validator` (errors block); reject `extensionsRequired` outside the allow-list; decode Draco and meshopt; measure bounds, triangles, textures and joints; read `OM_grip_R`, `OM_grip_L`, other `OM_*` nodes and `extras.openmarch` (`artworkSlot`, `stretch`, `itemId`, `kind`, `kitVersion`) from raw JSON; pre-selected unit conversion and Z-up rotate (Equipment, Garments, non-flat Props); per-kind triangle caps with simplify and the 4× rejection; texture downsizing to per-kind caps; Garments only on the exact v4 joints and rest pose with ≤4 influences, no quantization and `_PART` paint, with median fit required; dedup, prune, weld; the report grouped as Can't import, Needs your choice, Fixed for you, saved as Import notes in the sidecar. No UI.

**Tickets:** 01, 04, 08, 09, 11, 18.

**Done when:** fixture files cover every row of the report and every rejection, and normalized output loads in bare `GLTFLoader` with no decoders.

**Checks:** fixture tests; type-check, lint, format, spellcheck.

### C1.8: Artwork import pipeline

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.4, C1.5, C1.6

**Goal:** PNG, JPG, SVG and PDF in, an Artwork Version (original plus display texture) out.

**Scope:** physical size from template, trustworthy metadata (PDF/SVG page size; PNG pHYs other than 72/96 DPI) or the user; native DPI stored, "vector" for vector originals; a page picker for multi-page SVG and PDF (one Artwork per page); display texture rasterized or converted to sRGB by `sharp` at the kind's cap, with the "converted from CMYK for display" note; one size question per distinct aspect in multi-select.

**Tickets:** 03, 08, 11, 18.

**Done when:** fixtures for each format, a CMYK JPEG and a two-page PDF produce the right Versions and notes.

**Checks:** fixture tests; type-check, lint, format, spellcheck.

### C1.9: Import and Library IPC contract

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: C1.1

**Goal:** the channel list for picking files, running imports and reading and writing the local Library, recorded in ADR 0002 D-13 before code (no ticket or review answer names it).

**Scope:** decided by the owner or the lead with the owner; follows D-4's rules (hard-coded names, main validates, the editor is the only writer).

**Tickets:** 11.

**Done when:** D-13 lists the channels and their payloads.

**Checks:** none (a decision).

### C1.10: Import review modal

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: C1.7, C1.8, C1.9

**Goal:** the one-screen import review.

**Scope:** Library Import… and an Import… inside each picker (pre-fills kind, slot and size); `dialog.showOpenDialog` in main with the "3D model", "Artwork" and "All Files" filters; every import lands in the local Library (opened from the Library side panel in Visuals mode) and the show embeds a copy; an editor modal with its own code-split three.js canvas built from `view3d/core/` builders; the report on the right with pre-selected choices; manual grip and slot setting when `extras` are missing, with the "re-export with the OpenMarch preset" hint; kind asked unless the kit stamp pre-selects it; the Artwork size step (template chips, locked-aspect fields, "From file", live effective DPI); optional, collapsed author, license and source fields pre-filled from file metadata, with "Only import artwork and models you have the rights to use"; re-import matching (kit `itemId`, else filename); rejections on the same screen with a pointer to the Starter kit, never an `AlertModal`. The 3D window stays read-only.

**Tickets:** 08, 11, 16, 26.16.

**Done when:** a clean kit export imports in one click, and each "Needs your choice" item shows pre-selected.

**Checks:** component tests; a focused e2e for one clean import and one rejection; screenshots; type-check, lint, format, spellcheck.

### C1.11: Show embedding and `library_blobs`

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.3, C1.6

**Goal:** a show carries copies of everything it uses.

**Scope:** a migration (after the timeline's) for `library_blobs` (hash key, bytes, deduped) and the show Library item table (item id, kind, name, Version hash, metadata snapshot, sidecar JSON), both outside undo history; built-ins embedded too; prune on save (Library items nothing references, then orphan blobs; a Library item a cue or Item table names is never pruned); the table loaded at open, blobs read lazily by hash with a small cache, never originals for rendering; "update available" per Library item, never silent, including metadata-only updates; "Add to my Library"; opening a show never writes to the Library.

**Tickets:** 06, 11, 16.

**Done when:** a show opened on a machine with an empty Library renders from its embedded copies, and save leaves no orphan blobs.

**Checks:** schema and migration tests (page-mode and converted files); history tests showing both tables outside history; type-check, lint, format, spellcheck.

### C1.12: Artwork template downloads

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.4

**Goal:** people can author Artwork that fits.

**Scope:** per surface kind (each silk Cut, Base floor, Floor prop, prop top/front/back, Uniform part front/back): physical size, safe area, shape mask for arc, teardrop and swing cuts, minimum and recommended DPI, orientation marker, and bleed (⅛ in flags, ½ in sublimation) in the download only; PNG, SVG and PDF at size; Uniform part templates sized to the median v4u body, with the note that art wraps poorly onto sides and sleeves.

**Tickets:** 03, 08, 09.

**Done when:** every catalog surface has a template in all three formats, sized exactly.

**Checks:** unit tests on generated sizes; type-check, lint, format, spellcheck.

### C1.13: Starter kit

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C1.7, C1.12

**Goal:** the official Blender kit, bundled in the app.

**Scope:** template `.blend` files per kind; Artwork templates (the same files as C1.12); clean examples; a one-page guide; a glTF export preset; the "OpenMarch Tools" add-on (GPL-3.0-or-later): set kind, mark `OM_grip_*` and other `OM_*` points, declare artwork slots with real sizes, set stretch zones, stamp `itemId`, `kind`, `kitVersion` and the export license ("All rights reserved" pre-selected), pre-flight checks, and "Export for OpenMarch" (GLB, Y-up, custom properties on, modifiers applied, no quantization on skinned meshes, no Draco); Help ‣ Get the Blender starter kit saves a zip; `LICENSE` files (CC0 for templates, GPL for the add-on). The reference scene and uniform section (seven v4u bodies, v4 rig, `_PART` palette) are derived from upstream om-pose and wait for C1.2 and om-pose's license.

**Tickets:** 11, 16.

**Done when:** each template exported with the add-on imports through C1.7 with no "Needs your choice" items. Shipping waits for C1.2.

**Checks:** round-trip tests on committed exports; the minimum Blender version confirmed upstream; type-check, lint, format, spellcheck.

## Exit gate

- [ ] C1.1 and C1.3 done; C1.2 answered or still open with shipping held.
- [ ] Import fixtures pass for models and Artwork; packaged `sharp` runs on macOS, Windows and Linux.
- [ ] A show with embedded items opens with an empty local Library.
- [ ] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log

- 2026-10-11, C1.1 done: the owner approved the ADR 0002 amendment, the ADR
  0004 amendment draft, props-spec.md and the C track. WORKER.md's policy now
  names the C track; README, WORKER.md, plan.md, the 3d-work skill and the
  3d-worker agent accept `C<track>.<n>` IDs and `3d/c<track>-<name>`
  branches. The ADR 0004 amendment draft stays here until the cue work lands
  ADR 0004 on 3d-async, then merges into it (C3's tracker packages). The one
  remaining open point, the import IPC channels, is package C1.9.

### 2026-10-11 · 3d worker (3d/c1-model-import) · C1.7

- **Done:** the pipeline in `apps/desktop/electron/main/model-import/`
  (commit e48d022e, plus the follow-up recording these decisions). Owner
  decisions of 2026-10-11, now the rule in code and comments, not
  provisional:
  - Q36 (adopted): a Garment mesh marks its fit with
    `extras.openmarch.fit: "<body type>"` on the mesh node or its mesh (the
    node's wins, with a note when they differ); an untagged mesh is the median
    fit. Names are checked against `GARMENT_BODY_TYPES` (kept equal to
    `BODY_TYPES` by a test). An unknown name, or a value that isn't a string,
    is **Can't import** (`garmentUnknownFit`), like every other Garment rule
    break; it isn't a Needs-your-choice row because there's no safe
    pre-selection (guessing the median could hide a second median). A body
    type on more than one mesh node is a quiet note (`duplicateFits`), since
    several objects per fit are legal. The sidecar's `garment.fits` and
    `garment.meshesByFit` record the fits in body-type order, typed as body
    types.
  - Q37 (confirmed as built): Floor prop triangle cap 5k; Garment texture cap
    1024; default grip a quarter along the longest side when `OM_grip_R` is
    missing; the Z-up heuristic (Z largest and over 1.25 × Y; floors get the
    rotation offered but unchecked); grips stored in the sidecar, never
    re-centering; a Garment with any mesh lacking a skin is rejected; the v4
    skeleton numbers in `v4-skeleton.ts` fall under the om-pose license gate
    (C1.2), noted at the top of that file.
- **Checks:** see the commit; type-check, focused vitest for model-import,
  and desktop-scoped format, lint and spellcheck.
- **Next:** C1.9 decides the IPC channels and whether the pipeline runs in
  main or a `utilityProcess`. Draco's WASM decoder inside the packaged asar
  is unverified; check it on a packaged build.
- **Blockers:** none for C1.7's code; the two items above stay open.
- **Resume from:** open a PR from `3d/c1-model-import` into `3d-async` when
  the lead asks; nothing pushed yet.

### 2026-10-11 · Cross-phase note from C1.7 for C1.13

- The "OpenMarch Tools" add-on must write each Garment fit as exactly
  `extras.openmarch.fit: "<body type>"` (a custom property `openmarch` with
  key `fit`) on the mesh object, using one of the seven body-type names in
  `GARMENT_BODY_TYPES` (`apps/desktop/electron/main/model-import/rules.ts`),
  and may leave the median fit (`neutral-average`) untagged. C1.7 rejects any
  other name (owner decision Q36, 2026-10-11).

### 2026-10-12 · 3d worker (3d/c1-model-import) · C1.7

- 2026-10-12, C1.7 security fix: a `.gltf`'s buffer and image URIs are
  percent-decoded and refused when they leave the picked file's folder (`..`,
  absolute, Windows drive or UNC paths, backslashes, or a symlink whose real
  path is outside the folder's real path), as the new Can't import code
  `resourceOutsideFolder` naming the URI; any scheme, `file:` included, stays
  `externalUri`. Refused files are never read, so their bytes can't reach the
  stored source. Tests in `model-import/__test__/container.test.ts`.

- 2026-10-12, C1.8 (branch `3d/c1-artwork-import`, not yet in review):
  owner decisions of 2026-10-11. Q33: PDFs are read by pdf.js
  (`pdfjs-dist` 6.3.289, Apache-2.0, its legacy build) in a hidden
  BrowserWindow with the sandbox on, owned by main. Built as
  `createElectronPdfRenderer` in `electron/main/artwork-import`: no
  preload and no IPC; the window loads a private origin served only inside
  its own in-memory session (allow-listed pdf.js files read from the asar,
  the page script, the one PDF), and main calls it with
  `executeJavaScript`. pdfjs-dist's optional `@napi-rs/canvas` is ignored
  in `pnpm-workspace.yaml`, so no native module comes with it. Q34: Uniform
  part Artwork is a `uniformPart` surface, 1024 on the long edge, 150/300
  DPI. Q35 confirmed as built (sidecar third part, PNG-only resolution
  metadata, single-page SVG, floor DPI for Floor props, all pages
  pre-selected, aspect mismatch refused, 1.5-gigapixel input limit).
  Checked in dev Electron 40.8.5 on macOS arm64 (open, transparent render,
  corrupt PDF, full `importArtwork`), and with pdf.js served from a
  packaged `--dir` build's `app.asar`. Remaining: C1.9 wires the renderer
  into the import IPC (nothing calls it in the app yet), then a PDF import
  in a signed packaged app on macOS, Windows and Linux.
  Resume from: C1.9's channel list; then pass `createElectronPdfRenderer()`
  as `pdfRenderer` and run the packaged checks.

- 2026-10-12, C1.7 follow-ups for C1.9: `importModel` and `importModelFile`
  take an optional `onStage` callback, called once as each stage starts, in
  order: `reading`, `validating`, `decoding`, `checking`, `converting`,
  `writing` (type `ModelImportStage`). A rejection stops after the stage that
  found it; `needs-kind` stops after `decoding`; whatever the callback throws
  or rejects with is ignored. C1.9's `ImportStage` lacks `checking`: add it
  there or map it to `converting`. The module has no `electron` import and no
  top-level side effects beyond constants (the NodeIO and `sharp` load on
  first use); it loads and imports a fixture in plain Node, so it can run in
  a `utilityProcess` as is. Bug fix: a resource URI not in normal form
  (`textures/./logo.png`, `./model.bin`) was read but then failed the
  validator, which looks resources up by normalized path; after the
  containment check, resources are also keyed by their normalized path.
