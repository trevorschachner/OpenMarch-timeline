import type { XY } from "@openmarch/core";
import type { NewItemArgs } from "@/db-functions/items";
import type { PitVariant } from "@/view3d/core/pit/catalog";

/**
 * A new equipment item from the front ensemble catalog (instruments.md §6): it names its built-in
 * model, is locked, and its Outline is the model's footprint, a rectangle centered on `home`, on
 * field from `beatId`.
 */
export function newEquipment({
    variant,
    name,
    home,
    beatId,
}: {
    variant: PitVariant;
    name: string;
    home: XY;
    beatId: number;
}): NewItemArgs {
    const { width, depth, height } = variant.footprint;
    return {
        kind: "equipment",
        name,
        model: variant.modelId,
        locked: true,
        home,
        beatId,
        geometry: { outlineType: "rectangle", width, depth, height },
    };
}

const escapeRegExp = (text: string) =>
    text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `base` and the next number for it among `names`: one past the highest "<base> <n>", so a
 * deleted one's number isn't reused while a higher one is in the show ("Marimba 2").
 */
export function nextEquipmentName(
    base: string,
    names: readonly (string | null)[],
): string {
    const pattern = new RegExp(`^${escapeRegExp(base)} (\\d+)$`);
    const highest = names.reduce((max, name) => {
        const match = name ? pattern.exec(name) : null;
        return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${base} ${highest + 1}`;
}
