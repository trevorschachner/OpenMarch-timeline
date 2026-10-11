# Draft notes: 3D customization ADR and slicing

Branch `3d/props-adr-slicing`, 2026-10-11. The owner's review answers
(ticket 26, items 1 to 24) are applied to the ADR 0002 amendment, the ADR 0004
amendment draft, the customization track (C1 to C5, which replaces the
drafted phases 8 to 12 and folds in the early Phase 6 draft as C4.10 and
C4.11), and the design spec `docs/3d/props-spec.md`.
The silk motion variant is decided (B, hang and billow; ticket 10). Delete
this file when the items below are answered and before the branch merges
(package C1.1).

## Still open

1. **Import and Library IPC channels.** Decided when building starts, by the
   human package C1.9, and recorded in ADR 0002 D-13 before any import code
   (owner, 2026-10-11).

Settled in the last review: Carry, Silk and Uniform defaults are computed in
`compileCues` (ADR 0004 amendment draft); C2.1 depends on C3.1; C4.10 and
C4.11 can be claimed before C1.1; the item slot picker reads "from the
current count on".

The phase order and gates diagram is in
`docs/3d/phases/C1-library-import.md`.
