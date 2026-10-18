/**
 * Measurement only (C4.9). Draws the test Garment (`garment.ts`) beside the
 * window's marchers, on the performers asked for, through step 6's renderer:
 * `composedGeometry` and `composedSkinning` read the same composer texture
 * as the bodies, so the Garment plays every channel the body plays with no
 * extra bake rows.
 *
 * - One `InstancedMesh` per fitted body type among the wearers, one
 *   primitive each: props-spec.md's "+1 draw per fitted body type ×
 *   primitives".
 * - No shadows.
 * - Painted by `_PART` with the uniform shader, in its own palette (one
 *   material, one program for every fit).
 * - The bodies keep the parts the Garment covers. A real Garment hides them
 *   per instance (the per-look texture, still skinned), so the body's
 *   skinning cost stays; only their fragments would go. The shell sits
 *   `offset` outside the body, so they don't fight.
 * - Each frame copies the wearers' instance matrices from their body
 *   meshes; the composer gives the pose.
 */
import * as THREE from "three";
import {
    composedGeometry,
    composedSkinning,
    writeInstance,
    type Composer,
} from "@/view3d/render/composer";
import { createUniformMaterial } from "@/view3d/render/uniform-shader.js";
import {
    garmentShell,
    offsetShell,
    subdivideShell,
    type Shell,
} from "./garment";

export interface GarmentOptions {
    /** Subdivision levels: 0 is the body's 788 triangles, 1 is 3,152. */
    subdivide: number;
    /** How far outside the body the shell sits, m. */
    offset: number;
}

/** A body geometry's skinned data as a {@link Shell}, whatever its array types. */
function shellOf(g: THREE.BufferGeometry): Shell {
    const a = (name: string, size: number) => {
        const attr = g.getAttribute(name) as THREE.BufferAttribute;
        const out = new Float32Array(attr.count * size);
        for (let i = 0; i < attr.count; i++)
            for (let k = 0; k < size; k++)
                out[i * size + k] = attr.getComponent(i, k);
        return out;
    };
    const index = g.index!;
    const idx = new Uint32Array(index.count);
    for (let i = 0; i < index.count; i++) idx[i] = index.getX(i);
    return {
        position: a("position", 3),
        normal: a("normal", 3),
        skinIndex: a("skinIndex", 4),
        skinWeight: a("skinWeight", 4),
        part: a("_part", 1),
        index: idx,
    };
}

/** A fit's geometry: the body's covered parts, subdivided and pushed out. */
export function fitGeometry(
    body: THREE.BufferGeometry,
    opts: GarmentOptions,
): THREE.BufferGeometry {
    let s = garmentShell(shellOf(body));
    for (let i = 0; i < opts.subdivide; i++) s = subdivideShell(s);
    s = offsetShell(s, opts.offset);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(s.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(s.normal, 3));
    g.setAttribute("skinIndex", new THREE.BufferAttribute(s.skinIndex, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(s.skinWeight, 4));
    g.setAttribute("_part", new THREE.BufferAttribute(s.part, 1));
    g.setIndex(new THREE.BufferAttribute(s.index, 1));
    return g;
}

/** The Garment's own look: a split jacket, so it reads apart from the band's. */
const GARMENT_COLORS = {
    primary: 0xe8743b,
    secondary: 0x1b1b1d,
    accent: 0xffd36e,
    trim: 0xffd36e,
    pants: 0x1b1b1d,
};

interface Fit {
    mesh: THREE.InstancedMesh;
    fit: THREE.BufferGeometry;
    /** Per garment instance: the body mesh and instance it copies. */
    from: { mesh: THREE.InstancedMesh; k: number }[];
}

export class TestGarment {
    readonly group = new THREE.Group();
    private readonly fits: Fit[] = [];
    private readonly material: THREE.Material;
    /** Triangles per fit, by body type. */
    readonly trianglesByFit: Record<string, number> = {};

    constructor(
        /** The window's body meshes (`view3d-marchers-<type>`). */
        bodies: readonly THREE.InstancedMesh[],
        wearers: ReadonlySet<number>,
        composer: Composer,
        opts: GarmentOptions,
    ) {
        this.group.name = "bench-garment";
        this.material = composedSkinning(
            createUniformMaterial(THREE, {
                style: "split",
                colors: GARMENT_COLORS,
                options: { stripe: false, hat: false },
            }),
            composer,
        );
        // wearers by body type, from each body mesh's slots
        const byType = new Map<
            string,
            {
                source: THREE.InstancedMesh;
                from: Fit["from"];
                skin: number[];
            }
        >();
        for (const mesh of bodies) {
            const type = mesh.name.replace(/^view3d-marchers-/, "");
            const slots = mesh.geometry.getAttribute(
                "aSlot",
            ) as THREE.InstancedBufferAttribute;
            const skin = mesh.geometry.getAttribute(
                "aSkin",
            ) as THREE.InstancedBufferAttribute;
            let entry = byType.get(type);
            for (let k = 0; k < mesh.count; k++) {
                const slot = Math.round(slots.getX(k));
                if (!wearers.has(slot)) continue;
                if (!entry) {
                    entry = { source: mesh, from: [], skin: [] };
                    byType.set(type, entry);
                }
                entry.from.push({ mesh, k });
                entry.skin.push(slot, skin.getX(k), skin.getY(k), skin.getZ(k));
            }
            // the fullest source geometry: a look's filtered index may drop parts
            if (
                entry &&
                (mesh.geometry.index?.count ?? 0) >
                    (entry.source.geometry.index?.count ?? 0)
            )
                entry.source = mesh;
        }
        for (const [type, entry] of byType) {
            const fit = fitGeometry(entry.source.geometry, opts);
            const n = entry.from.length;
            const geometry = composedGeometry(fit, n);
            const mesh = new THREE.InstancedMesh(geometry, this.material, n);
            mesh.name = `bench-garment-${type}`;
            mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.frustumCulled = false;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            const aSkin = geometry.getAttribute(
                "aSkin",
            ) as THREE.InstancedBufferAttribute;
            for (let i = 0; i < n; i++) {
                writeInstance(mesh, i, entry.skin[i * 4]);
                aSkin.setXYZ(
                    i,
                    entry.skin[i * 4 + 1],
                    entry.skin[i * 4 + 2],
                    entry.skin[i * 4 + 3],
                );
            }
            aSkin.needsUpdate = true;
            this.trianglesByFit[type] = fit.index!.count / 3;
            this.fits.push({ mesh, fit, from: entry.from });
            this.group.add(mesh);
        }
        this.writeFrame();
    }

    /** Draw calls a frame: one per fit (one primitive each). */
    get drawCalls(): number {
        return this.fits.length;
    }

    get instances(): number {
        return this.fits.reduce((n, f) => n + f.from.length, 0);
    }

    /** Each wearer where its body is this frame. */
    writeFrame(): void {
        for (const { mesh, from } of this.fits) {
            const out = mesh.instanceMatrix.array as Float32Array;
            from.forEach(({ mesh: body, k }, i) => {
                const src = body.instanceMatrix.array as Float32Array;
                for (let e = 0; e < 16; e++) out[i * 16 + e] = src[k * 16 + e];
            });
            mesh.instanceMatrix.needsUpdate = true;
        }
    }

    dispose(): void {
        for (const { mesh, fit } of this.fits) {
            mesh.geometry.dispose();
            fit.dispose();
            mesh.dispose();
        }
        this.material.dispose();
        this.group.removeFromParent();
        this.group.clear();
        this.fits.length = 0;
    }
}
