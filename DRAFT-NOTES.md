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

1. **Import and Library IPC channels.** No ticket or review answer names the
   channels for picking files, running imports and reading and writing the
   local Library. Package C1.9 (human) decides them and records them in ADR
   0002 D-13 before any import code.
2. **Where the Carry, Silk and Uniform defaults are computed.** In
   `compileCues`, whose input then also carries each section's usual
   equipment and 2D color and each marcher's `isGuard` (a public package API
   change under ADR 0004 D-6), or in the 3D View. The Silk default added in
   review (a plain silk in the section's 2D color) adds the 2D color to that
   input. Needed before C3.5 is claimed.

The phase order and gates diagram is in
`docs/3d/phases/C1-library-import.md`.
