import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import {
    propModelScale,
    writePropModelMatrix,
    type ModelBounds,
} from "../propModelFit";

/** A riser modeled 2.44 × 0.41 × 1.22 m, off-center and below its origin. */
const riser: ModelBounds = {
    min: [1, -0.1, 2],
    max: [3.44, 0.31, 3.22],
    size: [2.44, 0.41, 1.22],
};
const sameSize = { width: 2.44, depth: 1.22, height: 0.41 };

const place = (
    geometry: {
        width: number;
        depth: number;
        height: number;
        rotation: number;
    },
    center = { x: 10, z: -5 },
) => {
    const out = new Float32Array(16);
    writePropModelMatrix(out, 0, geometry, riser, center);
    return new Matrix4().fromArray(out);
};

const at = (m: Matrix4, x: number, y: number, z: number) =>
    new Vector3(x, y, z).applyMatrix4(m);

describe("propModelScale", () => {
    it("is 1:1 when the Outline is the model's size", () => {
        expect(propModelScale(sameSize, riser)).toBeCloseTo(1);
    });

    it("fits evenly inside a resized Outline, never stretching", () => {
        // Twice as wide but the same depth: depth limits the scale
        expect(propModelScale({ ...sameSize, width: 4.88 }, riser)).toBeCloseTo(
            1,
        );
        // Everything halved
        expect(
            propModelScale({ width: 1.22, depth: 0.61, height: 0.205 }, riser),
        ).toBeCloseTo(0.5);
    });

    it("leaves height out for a flat Outline", () => {
        expect(propModelScale({ ...sameSize, height: 0 }, riser)).toBeCloseTo(
            1,
        );
    });

    it("is 1 for a model with no size", () => {
        const point: ModelBounds = {
            min: [0, 0, 0],
            max: [0, 0, 0],
            size: [0, 0, 0],
        };
        expect(propModelScale(sameSize, point)).toBe(1);
    });
});

describe("writePropModelMatrix", () => {
    it("stands the model's footprint center on the prop's center", () => {
        const m = place({ ...sameSize, rotation: 0 });
        const footprintCenter = at(m, 2.22, -0.1, 2.61);
        expect(footprintCenter.x).toBeCloseTo(10);
        expect(footprintCenter.y).toBeCloseTo(0);
        expect(footprintCenter.z).toBeCloseTo(-5);
        // The top is the model's height above the ground
        expect(at(m, 2.22, 0.31, 2.61).y).toBeCloseTo(0.41);
    });

    it("turns with the prop, about its center", () => {
        const m = place({ ...sameSize, rotation: 90 });
        // The model's +X end turns to +Z (clockwise on screen, as the 2D field)
        const plusX = at(m, 3.44, -0.1, 2.61);
        expect(plusX.x).toBeCloseTo(10);
        expect(plusX.z).toBeCloseTo(-5 + 1.22);
        // The center stays put
        expect(at(m, 2.22, -0.1, 2.61).x).toBeCloseTo(10);
    });

    it("writes at its index", () => {
        const out = new Float32Array(32);
        writePropModelMatrix(out, 1, { ...sameSize, rotation: 0 }, riser, {
            x: 0,
            z: 0,
        });
        expect(out.slice(0, 16).every((v) => v === 0)).toBe(true);
        expect(out[31]).toBe(1);
    });
});
