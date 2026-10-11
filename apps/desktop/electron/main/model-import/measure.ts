/**
 * Measuring a glTF-Transform document: bounds, triangles, draw calls,
 * textures, joints and influences (ADR 0002 D-13, "measure").
 */
import {
    ImageUtils,
    type Document,
    type Mesh,
    type Node,
    type Primitive,
    type Scene,
} from "@gltf-transform/core";
import { Matrix4, Vector3 } from "three";
import type { ModelMeasurements, Vec3 } from "./types";

/** Triangles a primitive draws (lines and points draw none). */
export function primitiveTriangles(prim: Primitive): number {
    const count =
        prim.getIndices()?.getCount() ??
        prim.getAttribute("POSITION")?.getCount() ??
        0;
    switch (prim.getMode()) {
        case 4: // TRIANGLES
            return Math.floor(count / 3);
        case 5: // TRIANGLE_STRIP
        case 6: // TRIANGLE_FAN
            return Math.max(0, count - 2);
        default:
            return 0;
    }
}

export function meshTriangles(mesh: Mesh): number {
    return mesh
        .listPrimitives()
        .reduce((sum, p) => sum + primitiveTriangles(p), 0);
}

/** Every node under a scene, parents before children. */
export function sceneNodes(scene: Scene): Node[] {
    const out: Node[] = [];
    const visit = (node: Node) => {
        out.push(node);
        node.listChildren().forEach(visit);
    };
    scene.listChildren().forEach(visit);
    return out;
}

export function worldMatrix(node: Node): Matrix4 {
    return new Matrix4().fromArray(node.getWorldMatrix());
}

/**
 * World-space bounds over every vertex. A skinned mesh's node transform is
 * ignored, as the glTF spec says, so its bind-pose vertices count as is.
 */
export function measureBounds(
    scene: Scene,
): { min: Vec3; max: Vec3; size: Vec3 } | null {
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    const v = new Vector3();
    for (const node of sceneNodes(scene)) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        const m = node.getSkin() ? new Matrix4() : worldMatrix(node);
        for (const prim of mesh.listPrimitives()) {
            const pos = prim.getAttribute("POSITION");
            if (!pos) continue;
            const el: number[] = [];
            for (let i = 0; i < pos.getCount(); i++) {
                pos.getElement(i, el);
                v.set(el[0], el[1], el[2]).applyMatrix4(m);
                min.min(v);
                max.max(v);
            }
        }
    }
    if (!isFinite(min.x)) return null;
    return {
        min: min.toArray() as Vec3,
        max: max.toArray() as Vec3,
        size: max.clone().sub(min).toArray() as Vec3,
    };
}

export function measureDocument(
    doc: Document,
    scene: Scene,
    trianglesByFit: Record<string, number> | null = null,
): ModelMeasurements {
    let triangles = 0;
    let drawCalls = 0;
    for (const node of sceneNodes(scene)) {
        const mesh = node.getMesh();
        if (!mesh) continue;
        triangles += meshTriangles(mesh);
        drawCalls += mesh.listPrimitives().length;
    }

    const textures = doc
        .getRoot()
        .listTextures()
        .map((t, i) => {
            const image = t.getImage();
            const mimeType = t.getMimeType();
            const size = image ? ImageUtils.getSize(image, mimeType) : null;
            return {
                name: t.getName() || t.getURI() || `texture ${i}`,
                width: size?.[0] ?? 0,
                height: size?.[1] ?? 0,
                mimeType,
            };
        });

    const joints = new Set<string>();
    for (const skin of doc.getRoot().listSkins()) {
        skin.listJoints().forEach((j) => joints.add(j.getName()));
    }

    let maxInfluences = 0;
    for (const mesh of doc.getRoot().listMeshes()) {
        for (const prim of mesh.listPrimitives()) {
            maxInfluences = Math.max(maxInfluences, primitiveInfluences(prim));
        }
    }

    return {
        bounds: measureBounds(scene),
        triangles,
        trianglesByFit,
        drawCalls,
        textures,
        joints: [...joints],
        maxInfluences,
    };
}

/** The most non-zero joint weights any vertex of a primitive has. */
export function primitiveInfluences(prim: Primitive): number {
    const sets = prim
        .listSemantics()
        .filter((s) => /^WEIGHTS_\d+$/.test(s))
        .map((s) => prim.getAttribute(s)!);
    if (sets.length === 0) return 0;
    let max = 0;
    const el: number[] = [];
    const count = sets[0].getCount();
    for (let i = 0; i < count; i++) {
        let n = 0;
        for (const set of sets) {
            set.getElement(i, el);
            n += el.filter((w) => w > 0).length;
        }
        max = Math.max(max, n);
    }
    return max;
}
