import { useCallback, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FieldProperties } from "@openmarch/core";
import {
    allItemsQueryOptions,
    createItemsMutationOptions,
} from "@/hooks/queries/useItems";
import { useTimingObjects } from "@/hooks";
import {
    useItemDrawingStore,
    type EquipmentPlacement,
} from "@/stores/ItemDrawingStore";
import { useUiSettingsStore } from "@/stores/UiSettingsStore";
import { getRoundCoordinates2 } from "@/utilities/CoordinateActions";
import { outlineWriteBeatNow } from "@/items/itemOutlineTimeline";
import { newPropFromDrawing } from "@/items/newPropFromDrawing";
import { PIXELS_PER_METER, type DrawnOutline } from "@/items/itemOutlines";
import { newEquipment, nextEquipmentName } from "@/items/newEquipment";
import type { PropToolStamp } from "@/field/editor/propTool";
import type { FieldEditor, FieldPoint } from "@/field/editor/fieldEditor";

/** The footprint equipment is placed with, in field units */
const stampOf = (placing: EquipmentPlacement | null): PropToolStamp | null =>
    placing
        ? {
              widthPixels: placing.variant.footprint.width * PIXELS_PER_METER,
              depthPixels: placing.variant.footprint.depth * PIXELS_PER_METER,
          }
        : null;

/**
 * Turns the field's prop tool on and off with the Props panel's Draw and
 * Front ensemble (`ItemDrawingStore`, C2.1). Escape turns it off through the
 * canvas's cancel action.
 */
export function useFieldPropTool(editor: FieldEditor) {
    useEffect(() => {
        const { drawingMode, placing } = useItemDrawingStore.getState();
        editor.setPropTool(drawingMode, stampOf(placing));
        const unsubscribe = useItemDrawingStore.subscribe((now, before) => {
            if (
                now.drawingMode !== before.drawingMode ||
                now.placing !== before.placing
            )
                editor.setPropTool(now.drawingMode, stampOf(now.placing));
        });
        return () => {
            unsubscribe();
            editor.setPropTool(null);
        };
    }, [editor]);
}

/**
 * A point snapped as a marcher's coordinates are (`coordinateRounding`), the
 * prop tool's corners; as it is with no field yet.
 */
export function snapToRounding(
    point: FieldPoint,
    grid: FieldProperties | null | undefined,
): FieldPoint {
    if (!grid) return point;
    const rounded = getRoundCoordinates2({
        coordinate: { xPixels: point.x, yPixels: point.y },
        uiSettings: {
            coordinateRounding:
                useUiSettingsStore.getState().uiSettings.coordinateRounding,
        },
        fieldProperties: grid,
    });
    return { x: rounded.xPixels, y: rounded.yPixels };
}

/**
 * Makes the prop the prop tool drew, or the equipment it placed: home at its
 * Outline's center, on field from the beat at or before the playhead, then
 * turns the tool off. Returns the editor's `propDrawn` port.
 */
export function usePropDrawn(): (outline: DrawnOutline) => void {
    const queryClient = useQueryClient();
    const { beats } = useTimingObjects()!;
    const { data: items } = useQuery(allItemsQueryOptions());
    const { mutate } = useMutation(createItemsMutationOptions(queryClient));
    const latest = useRef({ beats, items, mutate });
    useEffect(() => {
        latest.current = { beats, items, mutate };
    });
    return useCallback((outline) => {
        const { beats, items, mutate } = latest.current;
        const { placing, resetDrawingState } = useItemDrawingStore.getState();
        resetDrawingState();
        const beat = outlineWriteBeatNow(beats);
        if (!beat) return;
        if (!placing) {
            mutate([newPropFromDrawing(outline, beat.id)]);
            return;
        }
        mutate([
            newEquipment({
                variant: placing.variant,
                name: nextEquipmentName(
                    placing.baseName,
                    (items ?? []).map((item) => item.marcher.name),
                ),
                home: [outline.centerX, outline.centerY],
                beatId: beat.id,
            }),
        ]);
    }, []);
}
