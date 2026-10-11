---
phase: 11
title: Customization, items, silks and props in the 3D View
status: not-started
owner: none
branch: none
pr: none
depends_on: [9, 10]
updated: 2026-10-11
---

# Phase 11: Customization, items, silks and props in the 3D View

<!-- cspell:words ompose -->

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). This phase ends with the integrated-GPU run (P11.7), the gate for Phase 12.

## Goal

The 3D View draws what phases 9 and 10 store: props on and under performers, held and placed items, Library models, and silks with the new wave. It lands the per-look uniform texture that Phase 12 needs, then measures it all on integrated GPUs.

## Read first

- [ADR 0002](../../adr/0002-3d-view.md) D-15, D-17, D-18, D-19 and D-20 (amendment of 2026-10-11); [../design.md](../design.md) section 9 (budgets)
- `docs/3d/performer-behavior.md` section 8 (cue branches): window positions, layered animation, prop bones, om-pose
- Findings: `research/silk-motion`, `task/gpu-benchmark` (harness in `apps/desktop/view3d-web/bench/`), `research/ompose-uniform-limits`; the silk prototype on `prototype/silk-look` (`a7c7974f`)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P11.1: ADR 0004 step 4 merged (window positions and sync)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker. The lead marks it done when the window's timeline-mode positions and the `["timeline"]` invalidation key are in `3d-async`.

**Tickets:** 24.

**Done when:** the 3D window follows a converted show's timeline edits.

**Checks:** the lead records the merge in the progress log.

### P11.2: ADR 0004 step 6 merged (renderer in the repo, layering, prop bones)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker for the in-repo renderer with per-channel bakes, the compose pass and prop bones.

**Tickets:** 07.

**Done when:** prop bones are in `3d-async`.

**Checks:** the lead records the merge in the progress log.

### P11.3: Per-look uniform texture

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.1, P11.2

**Goal:** color and artwork uniforms cost no extra draws or bake rows.

**Scope:** palette, pattern and part visibility in a per-look `DataTexture` indexed by a per-instance `aLook`; parts hidden per instance instead of per-look index filtering; Band default and Guard default as the first two looks (built on P6.1 if it has landed). Where the change lives (in-repo renderer or upstream om-pose) per the owner's answer in `DRAFT-NOTES.md`.

**Tickets:** 04, 09, 18.

**Done when:** 16 uniform looks draw with the same call count as one, and the cost of skinning hidden-part triangles is measured on the M1 Pro and recorded in `docs/3d/findings.md`.

**Checks:** pixel parity against today's looks; the benchmark harness; focused `src/view3d` tests; type-check, lint, format, spellcheck.

### P11.4: Silk mesh and wave

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.1, P11.2

**Goal:** silks that read as fabric and seek exactly.

**Scope:** silks leave the instruments' metal material for their own instanced mesh with a cloth material (metalness 0, double-sided) and UVs; the stateless vertex wave driven by the show clock, a phase seed, ground speed and turn rate, with analytic normals, inserted before skinning; the fixed defaults (amplitude 0.055 m, wavelength 0.9 m, wave speed 0.2 m/s, speed coupling 0.25, turn coupling 0.05, droop 0.5, sheen 0, full mirrored back print); grids 24 × 16 at `high` and 12 × 8 at `low`; no shadows; swing silks at 44 × 66 in (P6.2 if it has landed). Default artwork only; swaps come in P12.4.

**Tickets:** 02, 03, 10, 15, 18.

**Done when:** 40 silks add at most one draw per tier, and scrubbing back and forth gives identical frames.

**Checks:** determinism test (same count, same vertices); the benchmark harness; screenshots beside the prototype; type-check, lint, format, spellcheck.

### P11.5: Props, platforms and obstacles in 3D

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P11.1, P9.1, P9.3, P9.6

**Goal:** props stand in the venue at their real size, and performers stand on platforms.

**Scope:** Outline boxes (or a prop's Library model) from the geometry table at each count; floor = flat, platform = stood on, obstacle = not stood on; Off field not drawn; a performer at the height of the tallest platform under their dot, stepping over about half a count at an edge; stacking makes steps; props and placed items on the tallest platform under their footprint center; Floor props stay on the Base floor; notes for steps over 16 in, performers inside obstacles, and dots leaving a moving platform.

**Tickets:** 05, 21, 24, 25.

**Done when:** a performer crossing onto a 24 in platform steps up in about half a count and the note names the count.

**Checks:** unit tests for the height rule; screenshots; focused `src/view3d` tests; type-check, lint, format, spellcheck.

### P11.6: Held items, placed items and Library models

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P11.2, P10.5, P9.3, P8.11

**Goal:** what the Carry channel and Placement say is what the 3D View draws.

**Scope:** Carry from compiled segments instead of `carryForSection` directly; held items as prop bones (hand × `OM_grip_*` offset); placed items at their position; during a hand conflict the newest is drawn and the displaced item isn't; normalized Library GLBs loaded with bare `GLTFLoader` from embedded blobs, read lazily; no CSP change.

**Tickets:** 01, 07, 21.

**Done when:** a rifle line switched to sabres by one Carry cue draws sabres from that count, and a prop handed between performers stays in the right hands.

**Checks:** unit tests; screenshots; a check that the window makes no network requests and logs no CSP violations; type-check, lint, format, spellcheck.

### P11.7: Integrated-GPU run

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P11.3, P11.4, P11.6

**Goal:** the measurement Phase 12 waits on.

**Scope:** with the `task/gpu-benchmark` harness, on an Intel Iris Xe (Windows) and a base M1: `hs` and `pro`; press box and a field-level camera; 24 Silk layers, Garments (fixture from P8.7) and the hidden-part skinning cost from P11.3. ADR 0004 section 8.5 asks for the same machines before its step 6 merges; whether one run serves both is open (`DRAFT-NOTES.md`).

**Tickets:** 15, 18.

**Done when:** the numbers are in `docs/3d/findings.md`, and the owner confirms or changes ADR 0002 D-19's thresholds, the texture sizes and whether BC7 KTX2 is needed.

**Checks:** the harness's JSON output committed beside the findings.

## Exit gate

- [ ] Props, platforms, held and placed items and the new silks render in a converted show.
- [ ] P11.7 recorded and the owner's verdict on D-19 logged.
- [ ] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log
