/**
 * The changes coordinate sheets list under each page when asked (C3.8): the show's Carry, Silk
 * and Uniform changes from the cue compile (`useShowCompiledCues`) and its items' Placement
 * changes, as each performer's lines by page (`exportChanges.ts`). Beats are placed by their
 * order by position, as the show's notes place them (`useShowNotes`).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPlacementChanges } from "@/db-functions";
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
    placementChanges,
    type ExportChanges,
} from "./utils/exportChanges";

/** An item's name and drill number: "Flag · F1", or the drill number alone. */
export function itemExportName(marcher: {
    name: string | null;
    drill_prefix: string;
    drill_order: number;
}): string {
    const drill = `${marcher.drill_prefix}${marcher.drill_order}`;
    return marcher.name ? `${marcher.name} · ${drill}` : drill;
}

/** The show's change lines, or null while the show loads. */
export function useExportChanges(): ExportChanges | null {
    const show = useShowCompiledCues();
    const { pages } = useTimingObjects();
    const { data: items } = useQuery(allItemsQueryOptions());
    const { data: placements } = useQuery(placementsQueryOptions());
    const { data: grid } = useQuery(beatOrderQueryOptions());
    return useMemo(() => {
        if (!show || !items || !placements || !grid) return null;
        const ordinal = new Map(grid.beatIds.map((id, i) => [id, i]));
        const names = new Map(
            items.map((i) => [i.id, itemExportName(i.marcher)]),
        );
        const performers = show.marchers.filter(
            (m) => !items.some((i) => i.marcher_id === m.id),
        );
        return changesByPage(
            [
                ...cueChanges({
                    marcherIds: performers.map((m) => m.id),
                    segments: (id, channel) =>
                        show.compiled.segments(id, channel),
                    countBeats: show.countBeatIds.map((id) => ordinal.get(id)),
                    name: (value) => show.lookup(value)?.name,
                }),
                ...placementChanges(
                    toPlacementChanges(placements, ordinal),
                    (id) => names.get(id) ?? "",
                ),
            ],
            pages,
        );
    }, [show, pages, items, placements, grid]);
}
