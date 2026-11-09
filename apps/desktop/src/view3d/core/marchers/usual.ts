/**
 * What a marcher does when no cue says otherwise, by what they carry
 * (docs/3d/technique.md, "Percussion crab step"):
 *
 * - snares, tenors and bass drums crab when they travel sideways or on a
 *   diagonal; everyone else marches straight leg. A Feet cue's "usual"
 *   moving technique plays this, so a cue can switch a drum to straight leg
 *   and back at any count;
 * - bass drums face side 1, the whole line the same way, so their heads
 *   face the sidelines; everyone else faces the front. A Facing cue
 *   overrides it from its count.
 *
 * Pure: no React, three.js or database.
 */
import type { HoldFamily } from "../instruments/holds";
import type { MovingTechnique } from "./planner";

/** The drums that crab (cymbals don't). */
const CRABBING: ReadonlySet<HoldFamily> = new Set(["snare", "tenors", "bass"]);

/** Side 1, as a heading (radians about +Y; 0 faces the audience). */
export const SIDE_1_HEADING = -Math.PI / 2;

/** The moving technique a marcher carrying `family` uses by default. */
export function usualMovingFor(family: HoldFamily | null): MovingTechnique {
    return family && CRABBING.has(family) ? "crab" : "straightLeg";
}

/** Where a marcher carrying `family` faces by default (radians). */
export function usualHeadingFor(family: HoldFamily | null): number {
    return family === "bass" ? SIDE_1_HEADING : 0;
}
