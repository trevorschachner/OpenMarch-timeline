import { describe, expect, it } from "vitest";
import {
    GARMENT_PARTS,
    garmentShell,
    offsetShell,
    pickSpread,
    subdivideShell,
    type Shell,
} from "../garment";

/** Two triangles sharing an edge, flat-shaded: four vertices per corner pair split. */
function quad(): Shell {
    // a unit square in the z = 0 plane, as two triangles with split vertices
    // on the shared edge (0,0)-(1,1), as the v4u bodies are split
    return {
        position: new Float32Array([
            0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0,
        ]),
        normal: new Float32Array([
            0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
        ]),
        skinIndex: new Float32Array([
            1, 0, 0, 0, 2, 0, 0, 0, 2, 3, 0, 0, 1, 0, 0, 0, 2, 3, 0, 0, 3, 0, 0,
            0,
        ]),
        skinWeight: new Float32Array([
            1, 0, 0, 0, 1, 0, 0, 0, 0.5, 0.5, 0, 0, 1, 0, 0, 0, 0.5, 0.5, 0, 0,
            1, 0, 0, 0,
        ]),
        part: new Float32Array([1, 1, 1, 2, 2, 2]),
        index: new Uint32Array([0, 1, 2, 3, 4, 5]),
    };
}

const triangles = (s: Shell) => s.index.length / 3;

describe("garmentShell", () => {
    it("keeps only the triangles of the parts asked for", () => {
        const s = garmentShell(quad(), [2]);
        expect(triangles(s)).toBe(1);
        expect([...s.part]).toEqual([2, 2, 2]);
        expect(s.position.length).toBe(9);
    });

    it("carries each vertex's skinning across unchanged", () => {
        const s = garmentShell(quad(), [1]);
        expect([...s.skinIndex.slice(8, 12)]).toEqual([2, 3, 0, 0]);
        expect([...s.skinWeight.slice(8, 12)]).toEqual([0.5, 0.5, 0, 0]);
    });

    it("takes the jacket, sleeves and pants by default", () => {
        expect([...GARMENT_PARTS]).toEqual([1, 2, 3]);
    });
});

describe("subdivideShell", () => {
    it("splits each triangle in four", () => {
        const s = subdivideShell(quad());
        expect(triangles(s)).toBe(8);
    });

    it("puts edge midpoints halfway, the same point from either side", () => {
        const s = subdivideShell(quad());
        const points = new Set<string>();
        for (let i = 0; i < s.position.length; i += 3)
            points.add(
                [s.position[i], s.position[i + 1], s.position[i + 2]].join(),
            );
        // the four corners, four outer midpoints and the diagonal's midpoint
        expect(points.size).toBe(9);
        expect(points.has("0.5,0.5,0")).toBe(true);
    });

    it("merges two vertices' influences, at most four, summing to one", () => {
        const s = subdivideShell(quad());
        for (let v = 0; v < s.part.length; v++) {
            const w = s.skinWeight.slice(v * 4, v * 4 + 4);
            expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
        }
        // the midpoint of (bone 1) and (bone 2) weighs each half
        const at = (x: number, y: number) => {
            for (let v = 0; v < s.part.length; v++)
                if (s.position[v * 3] === x && s.position[v * 3 + 1] === y)
                    return v;
            throw new Error("no vertex");
        };
        const v = at(0.5, 0);
        const weights = new Map<number, number>();
        for (let k = 0; k < 4; k++)
            if (s.skinWeight[v * 4 + k] > 0)
                weights.set(s.skinIndex[v * 4 + k], s.skinWeight[v * 4 + k]);
        expect(Object.fromEntries(weights)).toEqual({ 1: 0.5, 2: 0.5 });
    });

    it("keeps the four heaviest of more than four influences", () => {
        const s: Shell = {
            position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
            normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
            skinIndex: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4]),
            skinWeight: new Float32Array([
                0.4, 0.3, 0.2, 0.1, 0.4, 0.3, 0.2, 0.1, 0.4, 0.3, 0.2, 0.1,
            ]),
            part: new Float32Array([1, 1, 1]),
            index: new Uint32Array([0, 1, 2]),
        };
        const out = subdivideShell(s);
        // the midpoint of the first two vertices: 1 and 5 at 0.2, 2 and 6 at 0.15
        const v = 3; // first new vertex: edge (0, 1)
        const pairs: [number, number][] = [];
        for (let k = 0; k < 4; k++)
            pairs.push([out.skinIndex[v * 4 + k], out.skinWeight[v * 4 + k]]);
        expect(pairs.map((p) => p[0]).sort()).toEqual([1, 2, 5, 6]);
        expect(pairs.reduce((a, p) => a + p[1], 0)).toBeCloseTo(1, 6);
    });
});

describe("offsetShell", () => {
    it("moves split vertices at one point by the same averaged normal", () => {
        const s = quad();
        // tilt the second triangle's normals so the averages differ from either
        s.normal.set([1, 0, 0, 1, 0, 0, 1, 0, 0], 9);
        const out = offsetShell(s, 0.01);
        // vertices 0 and 3 are both at the origin: still together after
        expect([...out.position.slice(0, 3)]).toEqual([
            ...out.position.slice(9, 12),
        ]);
        const d = Math.hypot(...out.position.slice(0, 3));
        expect(d).toBeCloseTo(0.01, 6);
        // the input is untouched
        expect([...s.position.slice(0, 3)]).toEqual([0, 0, 0]);
    });
});

describe("pickSpread", () => {
    it("spreads n picks evenly across the range", () => {
        expect(pickSpread(10, 5)).toEqual([0, 2, 4, 6, 8]);
        expect(pickSpread(385, 0)).toEqual([]);
    });

    it("takes everything when asked for more than there is", () => {
        expect(pickSpread(4, 40)).toEqual([0, 1, 2, 3]);
    });

    it("never picks the same index twice", () => {
        const p = pickSpread(385, 300);
        expect(new Set(p).size).toBe(300);
        expect(Math.max(...p)).toBeLessThan(385);
    });
});
