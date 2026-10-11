---
phase: 10
title: Customization, Carry, Silk and Uniform cues
status: not-started
owner: none
branch: none
pr: none
depends_on: [9]
updated: 2026-10-11
---

# Phase 10: Customization, Carry, Silk and Uniform cues

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). This phase builds on ADR 0004's cue work, which has no phase file yet; P10.1 to P10.3 track its build steps (`docs/3d/performer-behavior.md` section 10, on the cue branches).

## Goal

Three new cue channels (Carry, Silk, Uniform) in storage and compile, their Visuals mode tabs, the Items tab for Placement, Outline geometry and artwork slots, and the optional export listing of changes.

## Read first

- [ADR 0002](../../adr/0002-3d-view.md) D-10 and D-11; [ADR 0004 amendment draft](../../adr/0004-amendment-draft.md)
- ADR 0004 and `docs/3d/performer-behavior.md` sections 2, 3, 6, 7 and 10 (cue branches)
- `CONTEXT.md`: **Visuals mode**, **Silk**, **Cut**, **Uniform**

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P10.1: ADR 0004 step 2 merged (cue storage)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker. The lead marks it done when ADR 0004's storage (migration, schema, db-functions, query hooks, history, repair) is in `3d-async`.

**Tickets:** 07.

**Done when:** the `cues` tables exist on `3d-async`.

**Checks:** the lead records the merge in the progress log.

### P10.2: ADR 0004 step 3 merged (catalog and compile)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker for `compileCues` and `traceCue` in `@openmarch/core`.

**Tickets:** 07.

**Done when:** the compile module and its tests are in `3d-async`.

**Checks:** the lead records the merge in the progress log.

### P10.3: ADR 0004 step 8 merged (Visuals mode)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker for Visuals mode (tabs, Who list, lanes, result row, why readout).

**Tickets:** 22.

**Done when:** Visuals mode is in `3d-async`.

**Checks:** the lead records the merge in the progress log.

### P10.4: Carry, Silk and Uniform in cue storage

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: P8.1, P8.11, P10.1

**Goal:** the three channels can be stored.

**Scope:** widen `cues.channel`; reject phrases on the three channels; cue values that name a show item at its Version (encoding and delete rule per the owner's answer in `DRAFT-NOTES.md`); save-prune counts cue references; items never targets.

**Tickets:** 06, 07, 09, 24.

**Done when:** a Silk cue naming an embedded Artwork survives save, and deleting that Artwork behaves as the owner chose.

**Checks:** schema and history tests; type-check, lint, format, spellcheck.

### P10.5: Compile Carry, Silk and Uniform

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: P10.2, P10.4

**Goal:** per-marcher segments for the three channels.

**Scope:** defaults (Carry: the section's usual equipment with `carryForSection` as the fallback; Uniform: Band default or Guard default by `isGuard`; Silk: per the owner's answer); latest wins, specificity, ripples; fits as the owner rules for Carry against Horn/Equipment states; an item that became a row stops the original performer's default carry from that count; `traceCue` covers the three channels.

**Tickets:** 07, 09, 10.

**Done when:** a show with no Carry, Silk or Uniform cues compiles to today's carry for every section.

**Checks:** core unit tests for each rule; type-check, lint, format, spellcheck.

### P10.6: Carry, Silk and Uniform tabs

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P10.3, P10.5

**Goal:** designers set what performers carry, their silks and their uniforms over time.

**Scope:** three Visuals mode tabs with the Who list, lane, result row and why readout; pickers with Import… (P8.10) that pre-fill kind and slot; the apply scope always on the button and switchable (wording on counts, per `DRAFT-NOTES.md`); a silk swap previewed on the field as a cut at its count.

**Tickets:** 07, 10, 11, 22.

**Done when:** "the guard changes to the red silks on count N" is one cue, made in the Silk tab.

**Checks:** component tests; a focused e2e adding a Silk cue; screenshots; type-check, lint, format, spellcheck.

### P10.7: Items tab

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P10.3, P9.3, P9.4

**Goal:** item Placement, Outline geometry and artwork slots edited in Visuals mode.

**Scope:** the Items tab: held, placed with Crew, Off field; resizes at a count with a transition; Floor prop "rolls out" and its leading edge; artwork slot assignments with fill or fit and pan; item ripple groups edited like a cue ripple with the same orders; hand-conflict notes on the lane.

**Tickets:** 07, 21, 22, 24.

**Done when:** a prop can be pulled on, resized, handed to a performer and taken off field without leaving Visuals mode.

**Checks:** component tests; a focused e2e; screenshots; type-check, lint, format, spellcheck.

### P10.8: Changes listed in page-grained exports

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P10.5, P9.3

**Goal:** coordinate sheets and mobile exports can list each change under its page with its count.

**Scope:** an export option, off unless chosen: "from count 9: red silk; holding Flag · F1"; never rounded to the page. ADR 0004 section 11 keeps printing cues out of scope; the owner reconciles the two before this is claimed (`DRAFT-NOTES.md`).

**Tickets:** 21.

**Done when:** a coordinate sheet with the option on lists Carry, Silk, Uniform and Placement changes with their counts.

**Checks:** export unit tests; type-check, lint, format, spellcheck.

## Exit gate

- [ ] A show with no new cues compiles and looks exactly as before.
- [ ] Carry, Silk, Uniform and Items tabs edit, undo and reach the 3D window through invalidation.
- [ ] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log
