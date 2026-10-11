---
phase: 8
title: Customization, Library and import
status: not-started
owner: none
branch: none
pr: none
depends_on: [5]
updated: 2026-10-11
---

# Phase 8: Customization, Library and import

<!-- cspell:words meshopt dedup CMYK -->

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). Phases 8 to 12 slice the 3D customization design (props, equipment, uniforms and artwork). No package here can be claimed until P8.1 is done.

## Goal

The approvals and outside gates the whole customization effort waits on, then the parts that don't need the timeline: real units and the size catalog, `sharp`, the local Library, the model and Artwork import pipelines, the import review, Artwork templates and the Starter kit. The show-side Library tables follow once the timeline is merged.

## Read first

- [ADR 0002](../../adr/0002-3d-view.md), amendment of 2026-10-11 (D-9 to D-22), and `DRAFT-NOTES.md` on the branch that drafted it
- `CONTEXT.md` at the repo root: **Library**, **Library item**, **Version**, **Artwork**, **Artwork template**, **Starter kit**, **Credits**
- The resolved tickets each package cites, in `.scratch/3d-customization/issues/` on `3d/architecture-props`, until the design spec lands in `docs/3d/`
- Findings: `research/gltf-import`, `research/ktx2-wasm-sharp`, `task/ktx2-sharp-spike`, `research/size-standards`, `research/ip-licensing` (branch, file `research/<name>.md`)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P8.1: Approve the amendments and open customization work

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: —

**Goal:** the owner approves the ADR 0002 amendment (D-9 to D-22), the ADR 0004 amendment draft, and these phase files, or asks for changes.

**Scope:** answer or defer each item in `DRAFT-NOTES.md`; lift [../WORKER.md](../WORKER.md)'s "Scope is the MVP" policy for phases 8 to 12 (it forbids imports today); add phases 8 to 12 to [../plan.md](../plan.md) section 3.

**Tickets:** 26.

**Done when:** the amendment's status line reads approved, WORKER.md's policy names phases 8 to 12, and the ADR 0004 text has a home on the cue branch.

**Checks:** none (a human verdict).

### P8.2: Legal gate for built-ins and the Starter kit

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** counsel answers lawyer questions Q1 (CC0 art beside AGPL code; whether the CLA covers relicensing contributed assets), Q3 (om-pose clips derived from Cadets 2019 footage), Q4 (GPL vs AGPL `LICENSE` text) and Q5 (Terms §9.1's reach), from `research/ip-licensing.md` §7.

**Scope:** blocks shipping built-ins (P12.8) and the Starter kit (P8.13), not building them. The Starter kit's reference bodies and v4 skeleton also wait for om-pose to adopt a license upstream. The `LICENSE` and Terms §9.1 fix ships as its own change outside this effort once Q4 and Q5 are answered.

**Tickets:** 14, 16.

**Done when:** the answers are recorded in `docs/3d/findings.md` and the owner says built-ins may ship.

**Checks:** none (a human verdict).

### P8.3: Timeline merged into 3d-async

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

### P8.4: Real units and the size catalog

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.1

**Goal:** one platform-free module that every later package uses for sizes.

**Scope:** meters in storage, never rounded on write; exact feet input (`4'6"`, `4.5 ft`, `54 in`, 0.3048 m/ft); display rounding to ⅛ in or 1 cm per setting, with a value typed in feet re-displayed as typed; the size standards catalog (poles, silk Cuts, rifles, sabres, floors, flat props) stored from its source units; per-kind plausible model size ranges; soft "WGI" warnings (equipment under 24 in, floors over 78 × 106 ft); the size preset shape the local Library saves.

**Tickets:** 03, 05, 08.

**Done when:** catalog sizes round-trip without drift (a 36 × 54 in silk stays exact) and every catalog entry names its source.

**Checks:** unit tests for parsing, rounding and the catalog; type-check, lint, format, spellcheck.

### P8.5: `sharp` in the packaged app

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.1

**Goal:** `sharp` runs in main in packaged builds on every release platform.

**Scope:** add `sharp` to `apps/desktop`; `asarUnpack` for `sharp` and `@img`; a `files` filter; macOS dylib signing and notarization; the Linux glib check; Windows. Reuse the spike in `task/ktx2-sharp-spike` (`spike/ktx2-sharp/`, `app-hooks.patch`). Use `pnpm exec electron-builder`, not `npx`.

**Tickets:** 11, 12, 20.

**Done when:** a packaged, signed and notarized macOS build, a Windows build and a Linux build each resize a 2048² image to 512² in main; the app-size delta per platform is in `docs/3d/findings.md`.

**Checks:** the three packaged runs, recorded; type-check, lint, format.

### P8.6: Local Library store

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.1

**Goal:** the user's Library on disk, shaped like a future cloud cache.

**Scope:** `userData/library/`: content-addressed `blobs/sha256/ab/<hash>`, one manifest JSON per item listing its Versions, an index rebuilt from manifests; items with a stable UUID, kind (Model, Artwork, Uniform), name, tags, timestamps, original filename, `derivedFrom`; license metadata (`license` as SPDX or `LicenseRef-Proprietary` / `LicenseRef-Unknown`, `author`, `sourceUrl`, `attribution`, `modified`) outside the Version hash; built-ins read-only with fixed UUIDs, editing one makes a copy with `modified` set; identical bytes reuse the existing item; original source files kept outside the hash; never pruned automatically; size presets. Main process only.

**Tickets:** 06, 08, 11, 16.

**Done when:** the store round-trips items and Versions, the index rebuilds from manifests alone, and editing a built-in yields a copy that inherits its license fields.

**Checks:** unit tests over a temp directory; type-check, lint, format, spellcheck.

### P8.7: Model import pipeline

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.4, P8.5, P8.6

**Goal:** a GLB or glTF in, a normalized GLB plus sidecar and an import report out, in Node.

**Scope:** `gltf-validator` (errors block); reject `extensionsRequired` outside the allow-list; decode Draco and meshopt; measure bounds, triangles, textures and joints; read `OM_grip_R`, `OM_grip_L`, other `OM_*` nodes and `extras.openmarch` (`artworkSlot`, `stretch`, `itemId`, `kind`, `kitVersion`) from raw JSON; pre-selected unit conversion and Z-up rotate (Equipment, Garments, non-flat Props); per-kind triangle caps with simplify and the 4× rejection; texture downsizing to per-kind caps; Garments only on the exact v4 joints and rest pose with ≤4 influences, no quantization and `_PART` paint, with median fit required; dedup, prune, weld; the report grouped as Can't import, Needs your choice, Fixed for you, saved as Import notes in the sidecar. No UI.

**Tickets:** 01, 04, 08, 09, 11, 18.

**Done when:** fixture files cover every row of the report and every rejection, and normalized output loads in bare `GLTFLoader` with no decoders.

**Checks:** fixture tests; type-check, lint, format, spellcheck.

### P8.8: Artwork import pipeline

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.4, P8.5, P8.6

**Goal:** PNG, JPG, SVG and PDF in, an Artwork Version (original plus display texture) out.

**Scope:** physical size from template, trustworthy metadata (PDF/SVG page size; PNG pHYs other than 72/96 DPI) or the user; native DPI stored, "vector" for vector originals; a page picker for multi-page SVG and PDF (one Artwork per page); display texture rasterized or converted to sRGB by `sharp` at the kind's cap, with the "converted from CMYK for display" note; one size question per distinct aspect in multi-select.

**Tickets:** 03, 08, 11, 18.

**Done when:** fixtures for each format, a CMYK JPEG and a two-page PDF produce the right Versions and notes.

**Checks:** fixture tests; type-check, lint, format, spellcheck.

### P8.9: Import and Library IPC contract

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P8.1

**Goal:** the channel list for picking files, running imports and reading and writing the local Library, recorded in ADR 0002 D-13 before code (the tickets don't name it).

**Scope:** decided by the owner or the lead with the owner; follows D-4's rules (hard-coded names, main validates, the editor is the only writer).

**Tickets:** 11.

**Done when:** D-13 lists the channels and their payloads.

**Checks:** none (a decision).

### P8.10: Import review modal

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: P8.7, P8.8, P8.9

**Goal:** the one-screen import review.

**Scope:** Library Import… and an Import… inside each picker (pre-fills kind, slot and size); `dialog.showOpenDialog` in main with the "3D model", "Artwork" and "All Files" filters; an editor modal with its own code-split three.js canvas built from `view3d/core/` builders; the report on the right with pre-selected choices; manual grip and slot setting when `extras` are missing, with the "re-export with the OpenMarch preset" hint; kind asked unless the kit stamp pre-selects it; the Artwork size step (template chips, locked-aspect fields, "From file", live effective DPI); optional, collapsed author, license and source fields pre-filled from file metadata, with "Only import artwork and models you have the rights to use"; re-import matching (kit `itemId`, else filename); rejections on the same screen with a pointer to the Starter kit, never an `AlertModal`. The 3D window stays read-only.

**Tickets:** 08, 11, 16.

**Done when:** a clean kit export imports in one click, and each "Needs your choice" item shows pre-selected.

**Checks:** component tests; a focused e2e for one clean import and one rejection; screenshots; type-check, lint, format, spellcheck.

### P8.11: Show embedding and `library_blobs`

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.3, P8.6

**Goal:** a show carries copies of everything it uses.

**Scope:** a migration (after the timeline's) for `library_blobs` (hash key, bytes, deduped) and the show item table (item id, kind, name, Version hash, metadata snapshot, sidecar JSON), both outside undo history; built-ins embedded too; prune on save (items nothing references, then orphan blobs); item table loaded at open, blobs read lazily by hash with a small cache, never originals for rendering; "update available" per item, never silent, including metadata-only updates; "Add to my Library"; opening a show never writes to the Library.

**Tickets:** 06, 11, 16.

**Done when:** a show opened on a machine with an empty Library renders from its embedded copies, and save leaves no orphan blobs.

**Checks:** schema and migration tests (page-mode and converted files); history tests showing both tables outside history; type-check, lint, format, spellcheck.

### P8.12: Artwork template downloads

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.4

**Goal:** people can author Artwork that fits.

**Scope:** per surface kind (each silk Cut, Base floor, Floor prop, prop top/front/back, Uniform part front/back): physical size, safe area, shape mask for arc, teardrop and swing cuts, minimum and recommended DPI, orientation marker, and bleed (⅛ in flags, ½ in sublimation) in the download only; PNG, SVG and PDF at size; Uniform part templates sized to the median v4u body, with the note that art wraps poorly onto sides and sleeves.

**Tickets:** 03, 08, 09.

**Done when:** every catalog surface has a template in all three formats, sized exactly.

**Checks:** unit tests on generated sizes; type-check, lint, format, spellcheck.

### P8.13: Starter kit

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.7, P8.12

**Goal:** the official Blender kit, bundled in the app.

**Scope:** template `.blend` files per kind; Artwork templates (the same files as P8.12); clean examples; a one-page guide; a glTF export preset; the "OpenMarch Tools" add-on (GPL-3.0-or-later): set kind, mark `OM_grip_*` and other `OM_*` points, declare artwork slots with real sizes, set stretch zones, stamp `itemId`, `kind`, `kitVersion` and the export license ("All rights reserved" pre-selected), pre-flight checks, and "Export for OpenMarch" (GLB, Y-up, custom properties on, modifiers applied, no quantization on skinned meshes, no Draco); Help ‣ Get the Blender starter kit saves a zip; `LICENSE` files (CC0 for templates, GPL for the add-on). The reference scene and uniform section (seven v4u bodies, v4 rig, `_PART` palette) are derived from upstream om-pose and wait for P8.2 and om-pose's license.

**Tickets:** 11, 16.

**Done when:** each template exported with the add-on imports through P8.7 with no "Needs your choice" items. Shipping waits for P8.2.

**Checks:** round-trip tests on committed exports; the minimum Blender version confirmed upstream; type-check, lint, format, spellcheck.

## Exit gate

- [ ] P8.1 and P8.3 done; P8.2 answered or still open with shipping held.
- [ ] Import fixtures pass for models and Artwork; packaged `sharp` runs on macOS, Windows and Linux.
- [ ] A show with embedded items opens with an empty local Library.
- [ ] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log
