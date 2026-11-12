/**
 * The show's props as the 3D View stands them (C4.5): each prop's surface type and Outline
 * changes, beats as ordinals (their place among the beats by position), as the timeline resolver
 * counts them. Podium items join them as platforms at their standing height. The played pit
 * instruments come with them, for the performers who play them (`pitPlayers.ts`).
 */
import { useMemo } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import type { DatabaseBeat } from "@/db-functions";
import type { DatabaseItem, DatabaseItemGeometry } from "@/db-functions/items";
import { allDatabaseBeatsQueryOptions } from "@/hooks/queries/useBeats";
import {
    allItemsQueryOptions,
    itemGeometryQueryOptions,
} from "@/hooks/queries/useItems";
import {
    itemOutlineChanges,
    type ItemOutlineChanges,
} from "@/items/itemOutlineTimeline";
import type { PropInput } from "@/view3d/core/props/propLayout";
import { podiumStandTop } from "@/view3d/core/pit/pitModels";
import { isPlayedPitModel } from "@/view3d/core/pit/playingSpot";
import type { PlayedInstrumentInput } from "@/view3d/core/pit/pitPlayers";

type ShowPropItem = Pick<
    DatabaseItem,
    "id" | "marcher_id" | "kind" | "surface_type" | "model"
>;

export type ShowPropsReturn = {
    props: PropInput[];
    /** The played pit instruments, whose playing spots performers snap onto */
    instruments: PlayedInstrumentInput[];
    isLoading: boolean;
    hasError: boolean;
};

const NO_PROPS: PropInput[] = [];
const NO_INSTRUMENTS: PlayedInstrumentInput[] = [];
const NONE_HIDDEN: ReadonlySet<number> = new Set();

/**
 * The props among the items, with their Outline changes by marchers row, and the podium items
 * (docs/3d/instruments.md §6): a podium is stood on like a platform, at its model's standing
 * height rather than through `surface_type`, which equipment never has. Other equipment isn't
 * stood on. An item hidden on the field in the editor (`hidden`, by item id) is left out: it
 * isn't drawn, so nobody stands on it.
 */
export function propInputs(
    items: readonly ShowPropItem[],
    outlines: ItemOutlineChanges,
    hidden: ReadonlySet<number> = NONE_HIDDEN,
): PropInput[] {
    return items.flatMap((item): PropInput[] => {
        if (hidden.has(item.id)) return [];
        const changes = outlines.get(item.marcher_id) ?? [];
        if (item.kind === "prop" && item.surface_type)
            return [
                { id: item.marcher_id, surface: item.surface_type, changes },
            ];
        const standTop =
            item.kind === "equipment" ? podiumStandTop(item.model) : null;
        return standTop === null
            ? []
            : [
                  {
                      id: item.marcher_id,
                      surface: "platform",
                      changes,
                      standTop,
                      facesAcross: true,
                  },
              ];
    });
}

/**
 * The played pit instruments among the items (docs/3d/instruments.md §6, "Players are
 * marchers"): equipment whose model someone plays (`isPlayedPitModel`), with its Outline changes
 * by marchers row. Speakers, the mixer and podiums aren't played; an item hidden on the field in
 * the editor (`hidden`, by item id) isn't drawn, so nobody plays it.
 */
export function playedInstrumentInputs(
    items: readonly ShowPropItem[],
    outlines: ItemOutlineChanges,
    hidden: ReadonlySet<number> = NONE_HIDDEN,
): PlayedInstrumentInput[] {
    return items.flatMap((item): PlayedInstrumentInput[] =>
        item.kind === "equipment" &&
        item.model &&
        isPlayedPitModel(item.model) &&
        !hidden.has(item.id)
            ? [
                  {
                      id: item.marcher_id,
                      model: item.model,
                      changes: outlines.get(item.marcher_id) ?? [],
                  },
              ]
            : [],
    );
}

/** Every prop with its item id, before the hidden ones are left out. */
type CombinedProps = {
    items: readonly ShowPropItem[];
    outlines: ItemOutlineChanges;
} | null;

export const _combineShowPropsQueries = (
    results: [
        UseQueryResult<ShowPropItem[]>,
        UseQueryResult<DatabaseItemGeometry[]>,
        UseQueryResult<Pick<DatabaseBeat, "id" | "position">[]>,
    ],
): { combined: CombinedProps; isLoading: boolean; hasError: boolean } => {
    const [items, geometry, beats] = results;
    const isLoading = results.some((r) => r.isLoading);
    const hasError = results.some((r) => r.isError);
    if (isLoading || hasError || !items.data || !geometry.data || !beats.data)
        return { combined: null, isLoading, hasError };

    const ordered = [...beats.data].sort(
        (a, b) => a.position - b.position || a.id - b.id,
    );
    const outlines = itemOutlineChanges({
        items: items.data,
        geometry: geometry.data,
        beatIndexes: new Map(ordered.map((b, i) => [b.id, i])),
    });
    return {
        combined: { items: items.data, outlines },
        isLoading: false,
        hasError: false,
    };
};

/**
 * The show's props, for the 3D View window.
 *
 * @param hidden - item ids hidden on the field in the editor
 */
export function useShowProps(
    hidden: ReadonlySet<number> = NONE_HIDDEN,
): ShowPropsReturn {
    const { combined, isLoading, hasError } = useQueries({
        queries: [
            allItemsQueryOptions(),
            itemGeometryQueryOptions(),
            allDatabaseBeatsQueryOptions(),
        ],
        combine: _combineShowPropsQueries,
    });
    const props = useMemo(
        () =>
            combined
                ? propInputs(combined.items, combined.outlines, hidden)
                : NO_PROPS,
        [combined, hidden],
    );
    const instruments = useMemo(
        () =>
            combined
                ? playedInstrumentInputs(
                      combined.items,
                      combined.outlines,
                      hidden,
                  )
                : NO_INSTRUMENTS,
        [combined, hidden],
    );
    return { props, instruments, isLoading, hasError };
}
