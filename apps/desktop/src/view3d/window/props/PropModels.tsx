/**
 * Props drawn as their imported 3D models (ADR 0010 D-12, D-13 and D-16), beside the plain
 * blocks of `PropBlocks.tsx`, which leaves out every prop drawn here.
 *
 * - Each prop gets a clone of its model's scene. Clones share the geometry and materials, so a
 *   show with ten copies of one riser parses it once and draws it per material per copy (the
 *   import already merged parts by material).
 * - Placement follows the block exactly: the prop's Outline at the beat the 2D field draws and
 *   its timeline position, turned with it and fitted inside it without stretching
 *   (`propModelFit.ts`). Matrices update in `useFrame` only when the show time or inputs change.
 * - Shadows follow the scene's quality, like the blocks.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import { itemGeometryAt, type FieldProperties } from "@openmarch/core";
import type { Group, Mesh, Object3D } from "three";
import {
    allItemsQueryOptions,
    itemGeometryQueryOptions,
} from "@/hooks/queries/useItems";
import {
    beatIndexesById,
    itemOutlineChanges,
} from "@/items/itemOutlineTimeline";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { FIELD_SURFACE_Y } from "@/view3d/core/field";
import { propTracks } from "@/view3d/core/props/propBlocks";
import { writePropModelMatrix } from "@/view3d/core/props/propModelFit";
import { useShowPositions } from "@/view3d/positions";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { useView3dSceneStore } from "../sceneStore";
import { requestDraw } from "../drawWake";
import { usePropModelScenes, type LoadedPropModel } from "./usePropModelScenes";

/** Marcher ids of the props drawn as a loaded model, by the model they draw. */
export function useModelledProps(): Map<number, LoadedPropModel> {
    const { data: items } = useQuery(allItemsQueryOptions());
    const loaded = usePropModelScenes();
    return useMemo(() => {
        const byMarcher = new Map<number, LoadedPropModel>();
        for (const item of items ?? []) {
            if (item.kind !== "prop" || !item.library_version_hash) continue;
            const model = loaded.get(item.library_version_hash);
            if (model) byMarcher.set(item.marcher_id, model);
        }
        return byMarcher;
    }, [items, loaded]);
}

const isMesh = (o: Object3D): o is Mesh => (o as Mesh).isMesh === true;

interface PropModelsProps {
    fieldProperties: FieldProperties;
}

export default function PropModels({ fieldProperties }: PropModelsProps) {
    const quality = useView3dSceneStore((s) => s.quality);
    const modelled = useModelledProps();
    const { data: items } = useQuery(allItemsQueryOptions());
    const { data: geometry } = useQuery(itemGeometryQueryOptions());
    const { beats } = useTimingObjects();
    const { positions } = useShowPositions();
    const hiddenItemIds = useView3dSyncStore((s) => s.hiddenItemIds);

    const tracks = useMemo(() => {
        const rows = items ?? [];
        const hidden = new Set(
            rows
                .filter(
                    (item) =>
                        hiddenItemIds.has(item.id) ||
                        !modelled.has(item.marcher_id),
                )
                .map((item) => item.marcher_id),
        );
        return propTracks(
            itemOutlineChanges({
                items: rows,
                geometry: geometry ?? [],
                beatIndexes: beatIndexesById(beats),
            }),
            { hidden },
        );
    }, [items, geometry, beats, hiddenItemIds, modelled]);

    // One clone per prop, sharing its model's geometry and materials
    const clones = useMemo(() => {
        const list: {
            marcherId: number;
            object: Group;
            model: LoadedPropModel;
        }[] = [];
        for (const track of tracks) {
            const model = modelled.get(track.marcherId);
            if (!model) continue;
            const object = model.scene.clone(true);
            object.name = "view3d-prop-model";
            object.matrixAutoUpdate = false;
            object.visible = false;
            object.traverse((o) => {
                // Props move anywhere on the field; skip the stale bounds test
                o.frustumCulled = false;
            });
            list.push({ marcherId: track.marcherId, object, model });
        }
        return list;
    }, [tracks, modelled]);

    useEffect(() => {
        for (const { object } of clones)
            object.traverse((o) => {
                if (!isMesh(o)) return;
                o.castShadow = quality === "high";
                o.receiveShadow = quality === "high";
            });
    }, [clones, quality]);

    const dirtyRef = useRef(true);
    useEffect(() => {
        dirtyRef.current = true;
        requestDraw(1000);
    }, [clones, tracks, positions, fieldProperties]);

    const lastMsRef = useRef(Number.NaN);
    const center = useRef({ x: 0, z: 0 }).current;
    useFrame(() => {
        if (clones.length === 0) return;
        const ms = useView3dSyncStore.getState().showMs();
        if (!dirtyRef.current && ms === lastMsRef.current) return;
        const beat = positions?.beatAt(ms);
        const changes = new Map(tracks.map((t) => [t.marcherId, t.changes]));
        for (const { marcherId, object, model } of clones) {
            const list = changes.get(marcherId);
            const at =
                positions && beat !== undefined && list
                    ? itemGeometryAt(list, beat)
                    : null;
            const placed =
                !!at &&
                positions!.positionInto(marcherId, ms, fieldProperties, center);
            object.visible = placed;
            if (!placed) continue;
            writePropModelMatrix(
                object.matrix.elements,
                0,
                at,
                model.model.bounds,
                center,
                FIELD_SURFACE_Y,
            );
            object.matrixWorldNeedsUpdate = true;
        }
        lastMsRef.current = ms;
        dirtyRef.current = false;
    });

    return (
        <>
            {clones.map(({ object }) => (
                <primitive key={object.uuid} object={object} />
            ))}
        </>
    );
}
