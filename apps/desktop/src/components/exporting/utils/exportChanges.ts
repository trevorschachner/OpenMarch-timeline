/**
 * The changes page-grained exports can list under each page (C3.8, props-spec "Exports",
 * ADR 0004 section 11 as amended): each performer's Carry, Silk, Uniform and Placement changes,
 * worded with their count ("from count 9: Red silk; holding Flag · F1"), never rounded to the
 * page. Behavior cues (Feet, Horn/Equipment, Facing, Body) are never listed. Counts are said as
 * Visuals mode says them (`countWords`): a change's beat is placed in the page box that holds it.
 * Pure, for its tests.
 */
import type { CueChannel, CueSegment, PlacementChange } from "@openmarch/core";
import { pageFlags, type FlagPage } from "@/timeline/timelinePlayhead";

/** One change for one performer, at a show beat (its place among the beats by position). */
export interface ChangeAt {
    readonly marcherId: number;
    readonly beat: number;
    readonly text: string;
}

/** Each performer's change lines by page id (`changesByPage`) */
export type ExportChanges = ReadonlyMap<
    number,
    ReadonlyMap<number, readonly string[]>
>;

const LISTED: readonly CueChannel[] = ["carry", "silk", "uniform"];

function cueText(
    channel: CueChannel,
    value: string | null,
    name: string,
): string {
    const none = value === null || value === "none";
    switch (channel) {
        case "carry":
            return none ? "carrying nothing" : `carrying ${name}`;
        case "silk":
            return none ? "no silk" : name;
        default:
            return none ? "no uniform" : `wearing ${name}`;
    }
}

/**
 * Each performer's Carry, Silk and Uniform changes from the compile: where a cue gives something
 * other than what came before. The defaults are not changes.
 *
 * @param countBeats each compile count's show beat (undefined where it has none)
 * @param name a cue value's name ("Red silk"); the segment's label where it has none
 */
export function cueChanges({
    marcherIds,
    segments,
    countBeats,
    name,
}: {
    marcherIds: readonly number[];
    segments: (marcherId: number, channel: CueChannel) => readonly CueSegment[];
    countBeats: readonly (number | undefined)[];
    name: (value: string) => string | undefined;
}): ChangeAt[] {
    const out: ChangeAt[] = [];
    for (const marcherId of marcherIds)
        for (const channel of LISTED) {
            let last: string | null | undefined;
            for (const seg of segments(marcherId, channel)) {
                const beat = countBeats[seg.from];
                if (beat === undefined || seg.to <= seg.from) continue;
                const changed = seg.value !== last;
                last = seg.value;
                if (seg.cueId === null || !changed) continue;
                const text = cueText(
                    channel,
                    seg.value,
                    (seg.value && name(seg.value)) || seg.label,
                );
                out.push({ marcherId, beat, text });
            }
        }
    return out;
}

type Part = "holding" | "crew" | null;

const partOf = (
    change: PlacementChange | undefined,
    marcherId: number,
): Part =>
    !change
        ? null
        : change.state === "held" &&
            change.holders.some((h) => h.marcherId === marcherId)
          ? "holding"
          : change.state === "placed" && change.crew.includes(marcherId)
            ? "crew"
            : null;

function releaseText(next: PlacementChange, item: string): string {
    switch (next.state) {
        case "placed":
            return `puts down ${item}`;
        case "off_field":
            return `takes ${item} off field`;
        default:
            return `hands off ${item}`;
    }
}

/**
 * Each performer's part in the items' Placement changes: taking an item ("holding Flag · F1"),
 * letting it go (put down, handed off, taken off field) and crewing it. Of an item's changes on
 * one count, the last is the one that holds.
 *
 * @param changesByItem each item's changes, in order (`toPlacementChanges`)
 */
export function placementChanges(
    changesByItem: ReadonlyMap<number, readonly PlacementChange[]>,
    itemName: (itemId: number) => string,
): ChangeAt[] {
    const out: ChangeAt[] = [];
    for (const [itemId, all] of changesByItem) {
        const item = itemName(itemId);
        const changes = all.filter((c, i) => all[i + 1]?.beat !== c.beat);
        changes.forEach((next, i) => {
            const prev = changes[i - 1];
            const marcherIds = new Set(
                [prev, next].flatMap((c) =>
                    c ? [...c.holders.map((h) => h.marcherId), ...c.crew] : [],
                ),
            );
            for (const marcherId of marcherIds) {
                const was = partOf(prev, marcherId);
                const is = partOf(next, marcherId);
                if (was === is) continue;
                const text =
                    is === "holding"
                        ? `holding ${item}`
                        : is === "crew"
                          ? `crew for ${item}`
                          : was === "holding"
                            ? releaseText(next, item)
                            : null;
                if (text) out.push({ marcherId, beat: next.beat, text });
            }
        });
    }
    return out;
}

type ChangePage = FlagPage & { readonly name: string };

/** Where a beat is: the page whose row lists it, and the words for its count. */
function whereOf(
    beat: number,
    pages: readonly ChangePage[],
): { pageId: number; words: string } | null {
    const flags = pageFlags(pages);
    if (flags.length === 0) return null;
    const boxed = flags.filter((f) => f.range);
    for (const f of boxed)
        if (f.range!.start < beat && beat <= f.range!.end)
            return {
                pageId: f.page.id,
                words: `count ${beat - f.range!.start}`,
            };
    const last = boxed[boxed.length - 1];
    if (last && beat > last.range!.end)
        return {
            pageId: last.page.id,
            words: `count ${beat - last.range!.end} after Page ${last.page.name}`,
        };
    return { pageId: flags[0]!.page.id, words: "the start" };
}

/**
 * The changes as each performer's lines under each page: one line a count, its changes joined
 * ("from count 6: carrying Rifle; holding Flag · F1"), in count order. Changes at home go under
 * the first page; past the last flag, under the last page.
 */
export function changesByPage(
    changes: readonly ChangeAt[],
    pages: readonly ChangePage[],
): Map<number, Map<number, string[]>> {
    // marcher → page → beat → texts, in the order given
    const grouped = new Map<
        number,
        Map<number, Map<number, { words: string; texts: string[] }>>
    >();
    for (const change of [...changes].sort((a, b) => a.beat - b.beat)) {
        const where = whereOf(change.beat, pages);
        if (!where) continue;
        let byPage = grouped.get(change.marcherId);
        if (!byPage) grouped.set(change.marcherId, (byPage = new Map()));
        let byBeat = byPage.get(where.pageId);
        if (!byBeat) byPage.set(where.pageId, (byBeat = new Map()));
        const at = byBeat.get(change.beat);
        if (at) at.texts.push(change.text);
        else
            byBeat.set(change.beat, {
                words: where.words,
                texts: [change.text],
            });
    }
    return new Map(
        [...grouped].map(([marcherId, byPage]) => [
            marcherId,
            new Map(
                [...byPage].map(([pageId, byBeat]) => [
                    pageId,
                    [...byBeat.values()].map(
                        (at) => `from ${at.words}: ${at.texts.join("; ")}`,
                    ),
                ]),
            ),
        ]),
    );
}
