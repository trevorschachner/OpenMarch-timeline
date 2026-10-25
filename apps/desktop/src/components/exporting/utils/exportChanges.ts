/**
 * The changes page-grained exports can list under each page (C3.8, props-spec "Exports",
 * ADR 0004 section 11 as amended): each performer's Carry, Silk, Uniform and Placement changes,
 * worded with their count ("from count 9: Red silk; holding Flag · F1"), never rounded to the
 * page. Behavior cues (Feet, Horn/Equipment, Facing, Body) are never listed. Counts are said as
 * Visuals mode says them (`countWords`): a change's beat is placed in the page box that holds it.
 *
 * Changes are listed as they are written: a hand conflict (an item held in hands a Carry cue or a
 * newer item takes) is the show's notes list's to raise, not the sheet's. Pure, for its tests;
 * the words come in (`ChangeWords`), so the sheet can be translated.
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

/** How the changes are worded. */
export interface ChangeWords {
    carrying: (name: string) => string;
    carryingNothing: () => string;
    silk: (name: string) => string;
    noSilk: () => string;
    wearing: (name: string) => string;
    noUniform: () => string;
    holding: (item: string) => string;
    crewFor: (item: string) => string;
    putsDown: (item: string) => string;
    handsOff: (item: string) => string;
    takesOffField: (item: string) => string;
    /** A count in a page */
    count: (count: number) => string;
    /** A count past the last page's flag */
    countAfter: (count: number, page: string) => string;
    /** At home, before the first count */
    theStart: () => string;
    /** One line: where, and the changes there joined */
    line: (where: string, changes: string) => string;
}

/** The words in English, as `en.json` has them. */
export const englishChangeWords: ChangeWords = {
    carrying: (name) => `carrying ${name}`,
    carryingNothing: () => "carrying nothing",
    silk: (name) => name,
    noSilk: () => "no silk",
    wearing: (name) => `wearing ${name}`,
    noUniform: () => "no uniform",
    holding: (item) => `holding ${item}`,
    crewFor: (item) => `crew for ${item}`,
    putsDown: (item) => `puts down ${item}`,
    handsOff: (item) => `hands off ${item}`,
    takesOffField: (item) => `takes ${item} off field`,
    count: (count) => `count ${count}`,
    countAfter: (count, page) => `count ${count} after Page ${page}`,
    theStart: () => "the start",
    line: (where, changes) => `from ${where}: ${changes}`,
};

/** The words from the app's translations (`exportCoordinates.change…` in `i18n/`). */
export function translatedChangeWords(
    t: (key: string, params: Record<string, string | number>) => string,
): ChangeWords {
    const k = (key: string) => `exportCoordinates.${key}`;
    return {
        carrying: (name) => t(k("changeCarrying"), { name }),
        carryingNothing: () => t(k("changeCarryingNothing"), {}),
        silk: (name) => t(k("changeSilk"), { name }),
        noSilk: () => t(k("changeNoSilk"), {}),
        wearing: (name) => t(k("changeWearing"), { name }),
        noUniform: () => t(k("changeNoUniform"), {}),
        holding: (item) => t(k("changeHolding"), { item }),
        crewFor: (item) => t(k("changeCrewFor"), { item }),
        putsDown: (item) => t(k("changePutsDown"), { item }),
        handsOff: (item) => t(k("changeHandsOff"), { item }),
        takesOffField: (item) => t(k("changeTakesOffField"), { item }),
        count: (count) => t(k("changeCount"), { count }),
        countAfter: (count, page) => t(k("changeCountAfter"), { count, page }),
        theStart: () => t(k("changeTheStart"), {}),
        line: (where, changes) => t(k("changeLine"), { where, changes }),
    };
}

/** An item's name and drill number: "Flag · F1", or the drill number alone. */
export function itemExportName(marcher: {
    name: string | null;
    drill_prefix: string;
    drill_order: number;
}): string {
    const drill = `${marcher.drill_prefix}${marcher.drill_order}`;
    return marcher.name ? `${marcher.name} · ${drill}` : drill;
}

const LISTED: readonly CueChannel[] = ["carry", "silk", "uniform"];

function cueText(
    words: ChangeWords,
    channel: CueChannel,
    value: string | null,
    name: string,
): string {
    const none = value === null || value === "none";
    switch (channel) {
        case "carry":
            return none ? words.carryingNothing() : words.carrying(name);
        case "silk":
            return none ? words.noSilk() : words.silk(name);
        default:
            return none ? words.noUniform() : words.wearing(name);
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
    words = englishChangeWords,
}: {
    marcherIds: readonly number[];
    segments: (marcherId: number, channel: CueChannel) => readonly CueSegment[];
    countBeats: readonly (number | undefined)[];
    name: (value: string) => string | undefined;
    words?: ChangeWords;
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
                    words,
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

function releaseText(
    words: ChangeWords,
    next: PlacementChange,
    item: string,
): string {
    switch (next.state) {
        case "placed":
            return words.putsDown(item);
        case "off_field":
            return words.takesOffField(item);
        default:
            return words.handsOff(item);
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
    words: ChangeWords = englishChangeWords,
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
                        ? words.holding(item)
                        : is === "crew"
                          ? words.crewFor(item)
                          : was === "holding"
                            ? releaseText(words, next, item)
                            : null;
                if (text) out.push({ marcherId, beat: next.beat, text });
            }
        });
    }
    return out;
}

type ChangePage = FlagPage & { readonly name: string };

/** Where a beat is: the page whose row lists it, and the words for its count. */
function whereFinder(pages: readonly ChangePage[], words: ChangeWords) {
    const flags = pageFlags(pages);
    const boxed = flags.filter((f) => f.range);
    const last = boxed[boxed.length - 1];
    return (beat: number): { pageId: number; where: string } | null => {
        if (flags.length === 0) return null;
        for (const f of boxed)
            if (f.range!.start < beat && beat <= f.range!.end)
                return {
                    pageId: f.page.id,
                    where: words.count(beat - f.range!.start),
                };
        if (last && beat > last.range!.end)
            return {
                pageId: last.page.id,
                where: words.countAfter(beat - last.range!.end, last.page.name),
            };
        return { pageId: flags[0]!.page.id, where: words.theStart() };
    };
}

/**
 * The changes as each performer's lines under each page: one line a count, its changes joined
 * ("from count 6: carrying Rifle; holding Flag · F1"), in count order. Changes at home go under
 * the first page, in one line; past the last flag, under the last page.
 */
export function changesByPage(
    changes: readonly ChangeAt[],
    pages: readonly ChangePage[],
    words: ChangeWords = englishChangeWords,
): Map<number, Map<number, string[]>> {
    const whereOf = whereFinder(pages, words);
    // marcher → page → where → texts, in the order given
    const grouped = new Map<number, Map<number, Map<string, string[]>>>();
    for (const change of [...changes].sort((a, b) => a.beat - b.beat)) {
        const at = whereOf(change.beat);
        if (!at) continue;
        let byPage = grouped.get(change.marcherId);
        if (!byPage) grouped.set(change.marcherId, (byPage = new Map()));
        let byWhere = byPage.get(at.pageId);
        if (!byWhere) byPage.set(at.pageId, (byWhere = new Map()));
        const texts = byWhere.get(at.where);
        if (texts) texts.push(change.text);
        else byWhere.set(at.where, [change.text]);
    }
    return new Map(
        [...grouped].map(([marcherId, byPage]) => [
            marcherId,
            new Map(
                [...byPage].map(([pageId, byWhere]) => [
                    pageId,
                    [...byWhere].map(([where, texts]) =>
                        words.line(where, texts.join("; ")),
                    ),
                ]),
            ),
        ]),
    );
}
