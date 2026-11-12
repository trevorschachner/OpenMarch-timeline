/**
 * Flies the camera to a prop when the editor asks (its "View in 3D", `view3d:focus`). The
 * request may come before the window has the venue, the show's positions or the prop itself,
 * as when it opens the window: it waits for them, then flies once.
 */
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { itemGeometryAt, type FieldProperties } from "@openmarch/core";
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
import { propFocusView } from "@/view3d/core/props/propFocus";
import { useShowPositions } from "@/view3d/positions";
import { useView3dSyncStore } from "@/view3d/sync/view3dSyncStore";
import { useView3dSceneStore } from "../sceneStore";
import { useCameraStore } from "../camera/cameraStore";

export default function PropFocus({
    fieldProperties,
}: {
    fieldProperties: FieldProperties;
}) {
    const focus = useView3dSyncStore((s) => s.focus);
    const kit = useView3dSceneStore((s) => s.kit);
    const { data: items } = useQuery(allItemsQueryOptions());
    const { data: geometry } = useQuery(itemGeometryQueryOptions());
    const { beats } = useTimingObjects();
    const { positions } = useShowPositions();
    const handledSeq = useRef(0);

    useEffect(() => {
        if (!focus || focus.seq === handledSeq.current) return;
        if (!kit || !positions || !items || !geometry) return;
        const item = items.find((i) => i.marcher_id === focus.marcherId);
        // A prop the window doesn't have yet: wait for the items to refetch
        if (!item) return;
        const seq = focus.seq;
        const ms = useView3dSyncStore.getState().showMs();
        const beat = positions.beatAt(ms);
        const changes = itemOutlineChanges({
            items: [item],
            geometry,
            beatIndexes: beatIndexesById(beats),
        }).get(item.marcher_id);
        const sorted = changes && [...changes].sort((a, b) => a.beat - b.beat);
        const at =
            sorted && beat !== undefined ? itemGeometryAt(sorted, beat) : null;
        const center = { x: 0, z: 0 };
        if (
            !at ||
            !positions.positionInto(
                item.marcher_id,
                ms,
                fieldProperties,
                center,
            )
        ) {
            handledSeq.current = seq; // Off field now: nothing to look at
            return;
        }
        const view = propFocusView(center, at, FIELD_SURFACE_Y);
        // After the venue's own opening fly-in, which starts on the same kit
        const frame = requestAnimationFrame(() => {
            handledSeq.current = seq;
            useCameraStore.getState().lookAt(view.position, view.target);
        });
        return () => cancelAnimationFrame(frame);
    }, [focus, kit, positions, items, geometry, beats, fieldProperties]);

    return null;
}
