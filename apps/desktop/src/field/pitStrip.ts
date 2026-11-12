import { FieldProperties } from "@openmarch/core";
import type { FieldRect } from "@/field/editor/selectionArea";
import type { FieldSize } from "@/field/editor/view";

/**
 * The pit strip (instruments.md section 6, "2D"): a band in front of the front sideline, toward
 * the audience, where the front ensemble's equipment stands, drawn so it can be seen and placed
 * there. A drawing aid only: the field (`FieldProperties`) doesn't change, and nothing stops a
 * marcher or item from standing past it.
 *
 * Field units throughout: the front sideline is `centerFrontPoint.yPixels` (y = 0 steps) and y
 * grows toward the audience.
 */

/** How deep the strip is: room for two rows of keyboards and the podium in front of them */
export const PIT_STRIP_DEPTH_FT = 30;

const STRIP_DEPTH = PIT_STRIP_DEPTH_FT * 12 * FieldProperties.PIXELS_PER_INCH;

/**
 * The strip across the whole field, from the front sideline 30 ft toward the audience, or null
 * when the show has no front ensemble (no equipment) to put there.
 */
export function pitStripOf(
    fieldProperties: Pick<FieldProperties, "width" | "centerFrontPoint">,
    hasEquipment: boolean,
): FieldRect | null {
    if (!hasEquipment) return null;
    const front = fieldProperties.centerFrontPoint.yPixels;
    return {
        left: 0,
        right: fieldProperties.width,
        top: front,
        bottom: front + STRIP_DEPTH,
    };
}

/**
 * The back strip (instruments.md section 6): the same band behind the back sideline, the field's
 * top edge (y = 0), for a drum major's podium at the back of the field. Null when no equipment
 * stands there.
 */
export function backStripOf(
    fieldProperties: Pick<FieldProperties, "width">,
    hasEquipmentBehind: boolean,
): FieldRect | null {
    if (!hasEquipmentBehind) return null;
    return {
        left: 0,
        right: fieldProperties.width,
        top: -STRIP_DEPTH,
        bottom: 0,
    };
}

/**
 * Whether any of the equipment `ids` stands behind the back sideline (y < 0), where `positionAt` (the
 * resolver at the start of the show; a locked item is there all show) has it.
 */
export function hasEquipmentBehind(
    ids: readonly number[],
    positionAt: (id: number) => readonly [number, number],
): boolean {
    return ids.some((id) => positionAt(id)[1] < 0);
}

/**
 * The area the view fits, centers and keeps in reach: the field, and the strips in front of and
 * behind it when there are any. The field's own origin stays at (0, 0); a back strip makes the
 * area start above it (`top`).
 */
export function fieldViewSize(
    fieldProperties: Pick<FieldProperties, "width" | "height">,
    strips: readonly (FieldRect | null)[],
): FieldSize {
    let top = 0;
    let bottom = fieldProperties.height;
    for (const strip of strips) {
        if (!strip) continue;
        top = Math.min(top, strip.top);
        bottom = Math.max(bottom, strip.bottom);
    }
    return { width: fieldProperties.width, height: bottom - top, top };
}
