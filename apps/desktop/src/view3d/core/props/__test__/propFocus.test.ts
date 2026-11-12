import { describe, expect, it } from "vitest";
import { propFocusView } from "../propFocus";

describe("propFocusView", () => {
    const riser = { width: 2.44, depth: 1.22, height: 0.41 };

    it("looks at the middle of the prop from the audience side, above it", () => {
        const { position, target } = propFocusView({ x: 10, z: -5 }, riser);
        expect(target).toEqual([10, 0.205, -5]);
        // In front (+Z), above and a little to the side
        expect(position[2]).toBeGreaterThan(-5);
        expect(position[1]).toBeGreaterThan(target[1]);
        expect(position[0]).toBeGreaterThan(10);
    });

    it("stands farther back from a bigger prop", () => {
        const near = propFocusView({ x: 0, z: 0 }, riser).position[2];
        const far = propFocusView(
            { x: 0, z: 0 },
            { width: 20, depth: 4, height: 3 },
        ).position[2];
        expect(far).toBeGreaterThan(near);
    });

    it("keeps a tiny prop a few meters away and a huge one in reach", () => {
        const tiny = propFocusView(
            { x: 0, z: 0 },
            { width: 0.05, depth: 0.05, height: 0 },
        );
        expect(tiny.position[2]).toBeGreaterThanOrEqual(4);
        const huge = propFocusView(
            { x: 0, z: 0 },
            { width: 500, depth: 500, height: 10 },
        );
        expect(huge.position[2]).toBeLessThanOrEqual(80);
    });

    it("stands on the field's surface height", () => {
        const { target } = propFocusView({ x: 0, z: 0 }, riser, 0.02);
        expect(target[1]).toBeCloseTo(0.225);
    });
});
