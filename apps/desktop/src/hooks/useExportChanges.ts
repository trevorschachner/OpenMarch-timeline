/**
 * What coordinate sheets need to list the show's changes under each page when asked (C3.8):
 * the show's cues compiled (`useShowCompiledCues`), its items and their Placement changes, and
 * the beats' order by position, which places them as the show's notes do (`useShowNotes`).
 * The lines are built only when an export asks for them (`build`), by `exportChanges.ts`.
 */
import { useCallback } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { toPlacementChanges, type DatabaseItemPlacement } from "@/db-functions";
import { allItemsQueryOptions } from "@/hooks/queries/useItems";
import { useTimingObjects } from "@/hooks/useTimingObjects";
import { useShowCompiledCues } from "@/hooks/useShowCueChecks";
import {
    beatOrderQueryOptions,
    placementsQueryOptions,
} from "@/hooks/useShowNotes";
import {
    changesByPage,
    cueChanges,
    itemExportName,
    placementChanges,
    type ChangeWords,
    type ExportChanges,
} from "@/components/exporting/utils/exportChanges";

type ItemRow = Awaited<
    ReturnType<NonNullable<ReturnType<typeof allItemsQueryOptions>["queryFn"]>>
>[number];

type BeatOrder = { beatIds: number[] };

/** What the changes read from the database. */
export interface ExportChangesData {
    items: readonly ItemRow[];
    placements: readonly DatabaseItemPlacement[];
    grid: BeatOrder;
}

export type ExportChangesQueries = {
    data: ExportChangesData | null;
    isLoading: boolean;
    hasError: boolean;
};

export const _combineExportChangesQueries = (
    results: [
        UseQueryResult<ItemRow[]>,
        UseQueryResult<DatabaseItemPlacement[]>,
        UseQueryResult<BeatOrder>,
    ],
): ExportChangesQueries => {
    const [items, placements, grid] = results;
    const isLoading = results.some((r) => r.isLoading);
    const hasError = results.some((r) => r.isError);
    if (isLoading || hasError || !items.data || !placements.data || !grid.data)
        return { data: null, isLoading, hasError };
    return {
        data: {
            items: items.data,
            placements: placements.data,
            grid: grid.data,
        },
        isLoading: false,
        hasError: false,
    };
};

export type ExportChangesReturn = {
    /** Each performer's change lines by page id, in `words`; null until the show loads */
    build: ((words: ChangeWords) => ExportChanges) | null;
    isLoading: boolean;
    hasError: boolean;
};

/** The show's changes for coordinate sheets. */
export function useExportChanges(): ExportChangesReturn {
    const show = useShowCompiledCues();
    const { pages } = useTimingObjects();
    const { data, isLoading, hasError } = useQueries({
        queries: [
            allItemsQueryOptions(),
            placementsQueryOptions(),
            beatOrderQueryOptions(),
        ],
        combine: _combineExportChangesQueries,
    });
    const build = useCallback(
        (words: ChangeWords): ExportChanges => {
            if (!show || !data) return new Map();
            const ordinal = new Map(data.grid.beatIds.map((id, i) => [id, i]));
            const names = new Map(
                data.items.map((i) => [i.id, itemExportName(i.marcher)]),
            );
            const itemMarchers = new Set(data.items.map((i) => i.marcher_id));
            return changesByPage(
                [
                    ...cueChanges({
                        marcherIds: show.marchers
                            .filter((m) => !itemMarchers.has(m.id))
                            .map((m) => m.id),
                        segments: (id, channel) =>
                            show.compiled.segments(id, channel),
                        countBeats: show.countBeatIds.map((id) =>
                            ordinal.get(id),
                        ),
                        name: (value) => show.lookup(value)?.name,
                        words,
                    }),
                    ...placementChanges(
                        toPlacementChanges(data.placements, ordinal),
                        (id) => names.get(id) ?? "",
                        words,
                    ),
                ],
                pages,
                words,
            );
        },
        [show, data, pages],
    );
    return {
        build: show && data ? build : null,
        isLoading: isLoading || (!show && !hasError),
        hasError,
    };
}
