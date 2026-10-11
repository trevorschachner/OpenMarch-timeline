# 0004 amendment (draft): Carry, Silk and Uniform channels, and item tables beside cues

> **Draft, not on ADR 0004's branch.** ADR 0004 (`docs/adr/0004-performer-cues.md`)
> and its spec (`docs/3d/performer-behavior.md`) live on the 3D cue branches
> (worktree `OpenMarch-3d-planner`, branch `3d/cue-planner`), not on this
> branch. This file holds the amendment text so the owner can approve it
> beside the ADR 0002 amendment. Once approved, it moves into ADR 0004 as a
> dated section, and this file is deleted.

- Status: draft for the owner's approval
- Date: 2026-10-11
- Amends: ADR 0004 D-1, D-5, D-6 and D-7; spec sections 2.3, 3, 7.1 and 7.6
- Companion: [ADR 0002](0002-3d-view.md), amendment of 2026-10-11 (D-9 to D-11)

## Context

The 3D customization map (`.scratch/3d-customization/` on
`3d/architecture-props`) resolved, after the 2D editing prototype was
rejected, that what performers carry, their silk and their uniform are state
cues on new channels, and that item Placement lives in its own beat-keyed
table edited in Visuals mode [07 revision, 22]. Bracketed numbers cite the
map's resolved tickets. Gaps the tickets leave are in `DRAFT-NOTES.md` at the
root of this branch; this draft doesn't fill them.

## Decision

### Three new channels

`cues.channel` gains `carry`, `silk` and `uniform`, beside `feet`,
`horn_equipment`, `facing` and `body` [07 revision].

- All three are **states only**: a `phrase` cue on them is rejected, like
  Facing [07 revision: "beat-keyed state cue channels"].
- They use ADR 0004's targets (band, section, tag, hand-picked set),
  `beat_id` keys, resolution rules and ripples. A per-performer uniform
  override is a hand-picked set [07 revision, 09].
- **Ripples are allowed** on all three. A silk swap with no ripple changes the
  whole group at once [10].
- **Items are never targets.** Band and section targets never reach
  `marchers` rows of type `prop` or `equipment`, and the Who list leaves them
  out [24].

| Channel | Says                                                    | Default                                                                                                 | Source              |
| ------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------- |
| Carry   | What is held: flag, rifle, sabre, horn, none            | The section's usual equipment; `carryForSection` (`view3d/core/instruments/catalog.ts`) as the fallback | 07 revision         |
| Silk    | Which Artwork a carried flag's Silk shows (not its Cut) | Not set by a ticket (open; today's built-in silk is the obvious reading)                                | 07 revision, 08, 10 |
| Uniform | Which uniform a performer wears                         | Band default, or Guard default when `isGuard`; nothing stored                                           | 09                  |

### Carry is separate from Horn/Equipment

Carry says **what** is held; Horn/Equipment says **how**. A rifle line can
switch to sabres without touching its equipment work [07 revision]. This
changes the spec:

- Section 3, Horn / Equipment: its default "horn up, or the section's carry"
  reads "horn up, or the set position of whatever Carry gives".
- Section 2.3 rule 7: "a rifle state fits any guard performer (and puts a
  rifle in their hands)" no longer puts anything in hands; what a rifle state
  does when Carry says flag is open (`DRAFT-NOTES.md`).

### Silk and Uniform

- A **silk swap** happens at the cue's instant (the click of its beat), as a
  hard cut [10].
- A Silk cue changes Artwork only. A different Cut is a different flag,
  which is a Carry change [08].
- A **Uniform** cue holds one uniform reference, never per-part overrides.
  Hats off is "Trumpets → _Band, hats off_ from count N" [09].

### Cue values that name Library items

Carry, Silk and Uniform values name Library items (a model, an Artwork, a
Uniform) at an exact Version, embedded in the show (ADR 0002 D-12) [06]. Save
must not prune an item a cue still names [06]. The `value` encoding and the
delete rule (by analogy with `phrase_asset_id` ON DELETE RESTRICT) are open
(`DRAFT-NOTES.md`).

### Item tables beside cues

ADR 0002 D-10 adds three tables keyed by `beat_id`, **beside** the cues, not
cues [07 revision, 24]:

- Placement: held (performers and hands), placed (optional Crew) or Off
  field; rows of one item ripple share a group id [07, 21].
- Outline geometry: width, depth, height, rotation, outline type, custom
  outline, transition length; Floor props add "rolls out" [21, 24].
- Artwork slot assignments: item, slot, beat → Artwork Version, with fill or
  fit, pan and pad color [07, 08].

They borrow cue-state semantics: the latest change at or before a count
wins; a change takes effect at the start of its beat; geometry eases in over
its transition; deleting a beat deletes its rows (ON DELETE CASCADE) [21,
24]. Whether they also join D-5's history and repair lists is not stated in a
ticket (`DRAFT-NOTES.md`).

### Visuals mode (spec section 7.1)

The tabs gain **Carry**, **Silk** and **Uniform**, and an **Items** tab where
Placement, Outline geometry and artwork slots are edited [07 revision, 22,
24]. Item ripple groups edit like a cue ripple, with the same orders [21].

### Held items render as prop bones (D-7)

A held item renders as D-7's prop bone: the holder's hand times the grip
offset from the model's `OM_grip_*` nodes [07 revision, 01].

### The 2D appearance cascade (spec section 7.6)

Unchanged: Carry, Silk and Uniform don't read the cascade or its
`equipment_name` column [07 revision]. Equipment pose (`equipment_state`) is
out of scope for this map, which keeps the column reserved for it, while
section 7.6 suggests dropping it later (`DRAFT-NOTES.md`).

## Consequences

- The `channel` CHECK widens; if ADR 0004's migration hasn't shipped by
  then, the new values could go in that migration instead of a second one
  (open).
- `compileCues` and `traceCue` carry three more channels. If the Carry and
  Uniform defaults are computed there, their input must also carry each
  section's usual equipment and each marcher's `isGuard`, a public package
  API change under D-6. Where defaults are computed is not in a ticket.
- Item Placement, geometry and artwork slot rows are not cues, so
  `compileCues` doesn't read them; the 3D View and the notes list resolve
  them on their own.

## Verification

- Compile unit tests: Carry, Silk and Uniform defaults; latest wins and
  specificity on each; ripples; phrases rejected on the three channels; items
  never reached by band or section targets.
- Schema tests: the widened CHECK; beat delete cascades on the item tables.
- E2E: a Silk cue in Visuals mode swaps the silk in the 3D window at its
  count without reopening.
