import { lengthOf } from "../../sizes/units";
import type { TemplatePolicy } from "../policy";

/**
 * Stand-in values for tests only. The real safe area, floor and prop bleed
 * and cut outlines are undecided (see ../policy.ts).
 */
export const TEST_POLICY: TemplatePolicy = {
    safeArea: (surface) => {
        const inset =
            surface.unit === "mm" ? lengthOf(10, "mm") : lengthOf(1, "in");
        return { top: inset, right: inset, bottom: inset, left: inset };
    },
    bleed: () => lengthOf(0.25, "in"),
    cutOutline: (surface) => {
        const w = surface.width.m;
        const h = surface.height.m;
        return [
            [0, 0],
            [w, h * 0.25],
            [w, h * 0.75],
            [0, h],
        ];
    },
};
