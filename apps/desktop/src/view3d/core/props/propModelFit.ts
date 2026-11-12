/**
 * Where an imported prop model goes in the 3D View (ADR 0010 D-16: never stretched). Pure: no
 * three.js.
 *
 * - The model's own axes follow glTF: +Y up, +Z its front. Its +X lies along the prop's width
 *   and its front faces the prop's +Z (field y, toward the audience), turned with the prop.
 * - Its footprint center sits on the prop's center and its lowest point on the ground.
 * - One uniform scale fits it inside the prop's width, depth and height. A prop whose Outline
 *   is the model's size (as a new import makes it) draws the model at 1:1; a resized Outline
 *   scales it evenly to fit. A flat Outline (height 0) leaves height out of the fit.
 */
import type { ItemGeometry, WorldPoint } from "@openmarch/core";

export type Vec3 = readonly [number, number, number];

/** A model's axis-aligned bounds in its own meters, from its sidecar. */
export interface ModelBounds {
    min: Vec3;
    max: Vec3;
    size: Vec3;
}

/** The uniform scale that fits `bounds` inside the Outline. 1 when the model has no size. */
export function propModelScale(
    geometry: Pick<ItemGeometry, "width" | "depth" | "height">,
    bounds: ModelBounds,
): number {
    const [sx, sy, sz] = bounds.size;
    const fits: number[] = [];
    if (sx > 0) fits.push(geometry.width / sx);
    if (sz > 0) fits.push(geometry.depth / sz);
    if (sy > 0 && geometry.height > 0) fits.push(geometry.height / sy);
    const scale = Math.min(...fits);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * Writes the model's world matrix (column-major, as three stores it) into `out` at `index`:
 * centered, scaled to fit, turned with the prop and moved to `center`.
 */
export function writePropModelMatrix(
    out: Float32Array | number[],
    index: number,
    geometry: Pick<ItemGeometry, "width" | "depth" | "height" | "rotation">,
    bounds: ModelBounds,
    center: WorldPoint,
    baseY = 0,
): void {
    const s = propModelScale(geometry, bounds);
    const radians = (geometry.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    // The model's footprint center and lowest point, in its own meters
    const ox = (bounds.min[0] + bounds.max[0]) / 2;
    const oy = bounds.min[1];
    const oz = (bounds.min[2] + bounds.max[2]) / 2;
    // Model +X to (cos, 0, sin), +Y up, +Z to (-sin, 0, cos), each × s, as `writePropMatrix`
    const o = index * 16;
    out[o] = s * cos;
    out[o + 1] = 0;
    out[o + 2] = s * sin;
    out[o + 3] = 0;
    out[o + 4] = 0;
    out[o + 5] = s;
    out[o + 6] = 0;
    out[o + 7] = 0;
    out[o + 8] = -s * sin;
    out[o + 9] = 0;
    out[o + 10] = s * cos;
    out[o + 11] = 0;
    // Translation: center minus the turned, scaled offset of the model's anchor
    out[o + 12] = center.x - s * (cos * ox - sin * oz);
    out[o + 13] = baseY - s * oy;
    out[o + 14] = center.z - s * (sin * ox + cos * oz);
    out[o + 15] = 1;
}
