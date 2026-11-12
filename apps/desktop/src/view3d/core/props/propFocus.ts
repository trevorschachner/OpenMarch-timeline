/**
 * The view the 3D View flies to for the editor's "View in 3D" on a prop. Pure: no three.js.
 *
 * It looks at the middle of the prop from the audience side (+Z, where a prop's front faces),
 * a little to the side and above, far enough back to see all of it with some field around it.
 */
import type { ItemGeometry, WorldPoint } from "@openmarch/core";

export type Vec3 = [number, number, number];

/** Closest and farthest the view stands from the prop, in meters. */
const NEAREST_M = 4;
const FARTHEST_M = 80;
/** How many of the prop's largest sides back the view stands, plus `NEAREST_M`. */
const SIZES_BACK = 2.2;
/** Up and to the side, as fractions of the distance back. */
const UP = 0.55;
const SIDE = 0.35;

export function propFocusView(
    center: WorldPoint,
    geometry: Pick<ItemGeometry, "width" | "depth" | "height">,
    baseY = 0,
): { position: Vec3; target: Vec3 } {
    const largest = Math.max(geometry.width, geometry.depth, geometry.height);
    const back = Math.min(
        FARTHEST_M,
        Math.max(NEAREST_M, NEAREST_M + SIZES_BACK * largest),
    );
    const target: Vec3 = [center.x, baseY + geometry.height / 2, center.z];
    return {
        position: [
            center.x + SIDE * back,
            baseY + geometry.height / 2 + UP * back,
            center.z + back,
        ],
        target,
    };
}
