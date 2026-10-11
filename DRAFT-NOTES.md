# Draft notes: 3D customization ADR and slicing

<!-- cspell:words retargets -->

Branch `3d/props-adr-slicing`, 2026-10-11. Delete this file when the owner
has answered everything below and before the branch merges.

What this branch drafts (ticket 26 on the 3D customization map):

- `docs/adr/0002-3d-view.md`: the amendment of 2026-10-11 (D-9 to D-22),
  plus two dated notes in D-7.
- `docs/adr/0004-amendment-draft.md`: the ADR 0004 amendment, kept here
  because ADR 0004 isn't on this branch.
- `docs/3d/phases/08-library-import.md` to `12-artwork-uniforms.md`.

Every design statement cites a resolved ticket. Where the tickets are silent
or disagree, the item is below instead of decided.

## Open for the owner

### Conflicts between tickets, or with ADR 0004

1. **Slot picker writes appearance rows.** Ticket 11 ("Assigning from a slot
   picker") says implicit Equipment writes "the section or tag appearance
   row" and labels the scope "Apply from page 12 on". Ticket 07's revision
   replaced the appearance cascade with Carry and Silk cues keyed by count.
   The drafts follow 07; confirm, and say how the button reads on counts.
2. **Rule 7 of ADR 0004 section 2.3.** It says a rifle state "puts a rifle
   in their hands". Ticket 07's revision makes Carry say what is held and
   Horn/Equipment say how. What does a rifle state do when Carry says flag:
   not fit (flagged), or change the Carry?
3. **Where `aLook` lands.** Tickets 04 and 09 put the per-look texture
   upstream in om-pose (an app patch first). ADR 0004 D-7 and section 8.4
   move the renderer into the repo as owned code. Upstream, in-repo, or both?
   P11.3 waits on the answer and is ordered after ADR 0004 step 6.
4. **`equipment_state`.** The map keeps the appearance column reserved for
   equipment pose; ADR 0004 section 7.6 asks Alex to approve dropping the
   dormant equipment columns. Keep or drop?
5. **Exports listing changes.** Ticket 21 adds an export option listing
   changes with counts; ADR 0004 section 11 keeps printing cues out of scope.
   Is P10.8 in v1?
6. **om-pose asset license.** ADR 0002 D-7 says om-pose assets ship under
   the app's license; ticket 16 puts a `LICENSE` in the om-pose asset folder
   and fixes `SOURCE.json` and the vendor README, and makes the kit's bodies
   CC0 only after Q3 and an upstream license. Which license do the meshes
   the app ships carry in the meantime?
7. **2D Outline editing.** Ticket 24 keeps PR 1013's "2D Outline UI" and
   says geometry is "edited on Visuals mode's Items tab"; ticket 22 says the
   2D editor gains "nothing new beyond PR 1013's prop outlines". Can the 2D
   editor still resize an Outline, or only draw it?

### Gaps the tickets leave

8. **Cue values that name Library items.** How a Carry, Silk or Uniform cue
   encodes `(item id, Version)` in `cues.value`, and what deleting the item
   does (ADR 0004 uses ON DELETE RESTRICT for phrase assets).
9. **Silk default.** No ticket says what a flag's silk shows with no Silk
   cue.
10. **Transitions on the new channels.** A silk swap is a hard cut (ticket
    10). Nothing says whether a Carry or Uniform change has a transition, or
    whether `transition_length` is ignored on all three.
11. **Silk fits.** What a Silk cue does for targets carrying no flag, or
    flags of different Cuts.
12. **Implicit to explicit carry.** When an item row is made from a
    performer's implicit flag, the performer "stops carrying the default"
    (ticket 07). Under cues: does the editor write a Carry cue, or does
    compile subtract the item?
13. **History for item tables.** Ticket 06 keeps `library_blobs` and the
    show item table out of undo. Nothing states that Placement, geometry and
    slot rows join history and repair as ADR 0004 D-5's cue tables do; the
    drafts assume they do.
14. **Import IPC.** No ticket names the channels for file picking, import
    and the local Library. P8.9 is a human package to decide them.
15. **Uniform editor location.** Ticket 09 fixes the palette-only editor;
    no ticket says where it lives (Visuals mode, the Library panel, Show
    settings). Same for the Library panel itself, which ticket 16 mentions.
16. **Uniforms made in a show.** "Duplicate as variant" makes a uniform in
    the show. Does it also land in the local Library, as imports do?
17. **Base floor Artwork.** ADR 0002 D-5 uses the field background image as
    the gym tarp. Tickets 11 and 18 treat Base floor as an import kind with a
    2048 texture. Does Base floor Artwork replace D-5's tarp rule?
18. **Notes list placement.** Ticket 18 names "the show's notes list"; no
    ticket says where it lives in the UI (P9.6).
19. **Crew-less warning setting storage.** A show setting, default off
    (ticket 07); workspace settings like ADR 0004's `performerDefaults`, or
    elsewhere?
20. **Migration order.** Whether the widened `cues.channel` CHECK goes into
    ADR 0004's own migration if that hasn't shipped, and where the items
    migration falls relative to the cue migration.

### Process

21. **Phase numbers.** The early packages are drafted as Phase 6
    (`.scratch/3d-customization/drafts/06-customization-early.md`, local
    only), and branch names already use `p7` for instruments, though there is
    no Phase 7 file. These drafts use 8 to 12. Renumber if you like.
22. **WORKER.md's MVP policy** forbids imports today. P8.1 lifts it for
    phases 8 to 12 once you approve.
23. **Who retargets PR 1013**, and where its PR goes: it is open on
    `OpenMarch/OpenMarch`, while `/3d-work` PRs go to `3d-async` on the fork.
24. **One GPU run or two.** Ticket 18's integrated-GPU run (P11.7) and ADR
    0004 section 8.5's run (before its step 6) use the same machines. One run
    could serve both if step 6 waits for P11.3 and P11.4, which would invert
    the order drafted here.
25. **The design spec.** Workers can't read `.scratch/` tickets on another
    branch. The map's destination is "an approved design spec"; the phase
    files cite tickets until one lands in `docs/3d/`.

## Phase order and gates

```text
P8.1 approval ─┬─ P8 Library and import (no timeline needed)
P8.2 legal ────┼──────────────────────────────── gates P8.13 ship, P12.8
P8.3 timeline ─┴─ P8.11 show tables ── P9 items on the timeline
ADR 0004 steps 2, 3, 8 (P10.1-3) ──── P10 Carry, Silk, Uniform cues; Items tab
ADR 0004 steps 4, 6 (P11.1-2) ─────── P11 render items, silks, props; P11.3 aLook
P11.3 + P11.4 + P11.6 ─────────────── P11.7 integrated-GPU run (human)
P11.7 + P11.3 ─────────────────────── P12 Artwork and uniforms
```
