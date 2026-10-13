// cspell:ignore unitard tris
/**
 * THROWAWAY (C4.9). The test Garment for the GPU run: a measurement fixture,
 * not a shipped path (docs/3d/phases/C4-render-items.md, C4.9).
 *
 * A Garment is a rigged model on the exact v4 rig with `_PART` paint and a
 * fit per body type (props-spec.md section 8, "Garments"). This one is made
 * from each body type's own jacket, sleeves and pants: those triangles,
 * subdivided once (788 triangles become 3,152, about the provisional 3k cap a
 * body type) and pushed out along the welded normal, so every fit sits on its
 * own body and keeps that body's v4 skin weights. It skins from the shared
 * bake through step 6's composer, like the bodies.
 *
 * The functions here are pure, on plain arrays, so they're tested apart from
 * three.js and the window.
 */

/** A triangle mesh's skinned vertex data: 3, 3, 4, 4 and 1 floats a vertex. */
export interface Shell {
    position: Float32Array;
    normal: Float32Array;
    skinIndex: Float32Array;
    skinWeight: Float32Array;
    /** The uniform shader's `_PART` (uniform-shader.js): 1 jacket, 2 sleeves, 3 pants. */
    part: Float32Array;
    index: Uint32Array;
}

/** What a unitard replaces: jacket, sleeves and pants. */
export const GARMENT_PARTS: readonly number[] = [1, 2, 3];

/** The source's triangles whose first vertex is one of `parts`, with only the vertices they use. */
export function garmentShell(
    source: Shell,
    parts: readonly number[] = GARMENT_PARTS,
): Shell {
    const keep = new Set(parts);
    const remap = new Map<number, number>();
    const index: number[] = [];
    for (let t = 0; t < source.index.length; t += 3) {
        const a = source.index[t];
        if (!keep.has(Math.round(source.part[a]))) continue;
        for (let k = 0; k < 3; k++) {
            const v = source.index[t + k];
            let to = remap.get(v);
            if (to === undefined) {
                to = remap.size;
                remap.set(v, to);
            }
            index.push(to);
        }
    }
    const n = remap.size;
    const out = emptyShell(n, index.length);
    out.index.set(index);
    for (const [from, to] of remap) copyVertex(source, from, out, to);
    return out;
}

function emptyShell(vertices: number, indices: number): Shell {
    return {
        position: new Float32Array(vertices * 3),
        normal: new Float32Array(vertices * 3),
        skinIndex: new Float32Array(vertices * 4),
        skinWeight: new Float32Array(vertices * 4),
        part: new Float32Array(vertices),
        index: new Uint32Array(indices),
    };
}

function copyVertex(src: Shell, from: number, dst: Shell, to: number) {
    dst.position.set(src.position.subarray(from * 3, from * 3 + 3), to * 3);
    dst.normal.set(src.normal.subarray(from * 3, from * 3 + 3), to * 3);
    dst.skinIndex.set(src.skinIndex.subarray(from * 4, from * 4 + 4), to * 4);
    dst.skinWeight.set(src.skinWeight.subarray(from * 4, from * 4 + 4), to * 4);
    dst.part[to] = src.part[from];
}

/**
 * Splits every triangle in four at its edge midpoints. A midpoint's
 * influences are both ends' at half weight, the four heaviest kept and
 * renormalized, so it skins between its ends. New vertices follow the
 * originals, an edge (a, b) once whichever triangle meets it first.
 */
export function subdivideShell(s: Shell): Shell {
    const n0 = s.part.length;
    const mids = new Map<string, number>();
    const tris: number[] = [];
    const pending: [number, number][] = [];
    const mid = (a: number, b: number) => {
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        let v = mids.get(key);
        if (v === undefined) {
            v = n0 + pending.length;
            mids.set(key, v);
            pending.push(a < b ? [a, b] : [b, a]);
        }
        return v;
    };
    for (let t = 0; t < s.index.length; t += 3) {
        const a = s.index[t];
        const b = s.index[t + 1];
        const c = s.index[t + 2];
        const ab = mid(a, b);
        const bc = mid(b, c);
        const ca = mid(c, a);
        tris.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const out = emptyShell(n0 + pending.length, tris.length);
    out.index.set(tris);
    for (let v = 0; v < n0; v++) copyVertex(s, v, out, v);
    pending.forEach(([a, b], i) => {
        const v = n0 + i;
        for (let k = 0; k < 3; k++) {
            out.position[v * 3 + k] =
                (s.position[a * 3 + k] + s.position[b * 3 + k]) / 2;
            out.normal[v * 3 + k] =
                (s.normal[a * 3 + k] + s.normal[b * 3 + k]) / 2;
        }
        normalize(out.normal, v);
        out.part[v] = s.part[a];
        const w = new Map<number, number>();
        for (const end of [a, b])
            for (let k = 0; k < 4; k++) {
                const weight = s.skinWeight[end * 4 + k];
                if (weight <= 0) continue;
                const bone = s.skinIndex[end * 4 + k];
                w.set(bone, (w.get(bone) ?? 0) + weight / 2);
            }
        const top = [...w]
            .sort((x, y) => y[1] - x[1] || x[0] - y[0])
            .slice(0, 4);
        const sum = top.reduce((acc, [, x]) => acc + x, 0) || 1;
        top.forEach(([bone, weight], k) => {
            out.skinIndex[v * 4 + k] = bone;
            out.skinWeight[v * 4 + k] = weight / sum;
        });
    });
    return out;
}

function normalize(a: Float32Array, v: number) {
    const l = Math.hypot(a[v * 3], a[v * 3 + 1], a[v * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) a[v * 3 + k] /= l;
}

/**
 * A copy pushed out `meters` along each point's averaged normal. The bodies'
 * vertices are split per face (flat shading), so the normals are welded by
 * position first, or the shell would crack along every edge.
 */
export function offsetShell(s: Shell, meters: number): Shell {
    const n = s.part.length;
    const key = (v: number) =>
        `${s.position[v * 3].toFixed(5)},${s.position[v * 3 + 1].toFixed(5)},${s.position[v * 3 + 2].toFixed(5)}`;
    const sums = new Map<string, [number, number, number]>();
    for (let v = 0; v < n; v++) {
        const k = key(v);
        const acc = sums.get(k) ?? [0, 0, 0];
        for (let c = 0; c < 3; c++) acc[c] += s.normal[v * 3 + c];
        sums.set(k, acc);
    }
    const out: Shell = {
        position: s.position.slice(),
        normal: s.normal.slice(),
        skinIndex: s.skinIndex.slice(),
        skinWeight: s.skinWeight.slice(),
        part: s.part.slice(),
        index: s.index.slice(),
    };
    for (let v = 0; v < n; v++) {
        const [x, y, z] = sums.get(key(v))!;
        const l = Math.hypot(x, y, z) || 1;
        out.position[v * 3] += (x / l) * meters;
        out.position[v * 3 + 1] += (y / l) * meters;
        out.position[v * 3 + 2] += (z / l) * meters;
    }
    return out;
}

/** `n` indexes spread evenly over `0..total-1`, or all of them when n ≥ total. */
export function pickSpread(total: number, n: number): number[] {
    const count = Math.max(0, Math.min(total, Math.floor(n)));
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push(Math.floor((i * total) / count));
    return out;
}
