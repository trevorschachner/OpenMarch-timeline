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
 * The area the view fits, centers and keeps in reach: the field, and the pit strip below it when
 * there is one. The field's own origin stays at (0, 0).
 */
export function fieldViewSize(
    fieldProperties: Pick<FieldProperties, "width" | "height">,
    strip: FieldRect | null,
): FieldSize {
    return {
        width: fieldProperties.width,
        height: Math.max(fieldProperties.height, strip?.bottom ?? 0),
    };
}
