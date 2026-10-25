import { describe, expect, it } from "vitest";
import type { CueChannel, CueSegment, PlacementChange } from "@openmarch/core";
import en from "../../../../../i18n/en.json";
import {
    changesByPage,
    cueChanges,
    englishChangeWords,
    itemExportName,
    placementChanges,
    translatedChangeWords,
    type ChangeAt,
    type ChangeWords,
} from "../exportChanges";

const beats = (from: number, to: number) =>
    Array.from({ length: to - from }, (_, i) => ({ index: from + i }));

/** Home, then Page 2 over beats (0, 8], Page 3 over (8, 16] */
const pages = [
    { id: 11, name: "1", beats: [] },
    { id: 12, name: "2", beats: beats(0, 8) },
    { id: 13, name: "3", beats: beats(8, 16) },
];

const seg = (
    from: number,
    to: number,
    value: string | null,
    cueId: number | null = 1,
): CueSegment => ({
    from,
    to,
    kind: cueId === null ? "default" : "state",
    value,
    label: value ?? "",
    settings: {},
    cueId,
});

const names: Record<string, string> = {
    "builtin:rifle": "Rifle",
    "builtin:flag": "Flag",
    "show:7": "Red silk",
    "show:8": "West Point",
};

describe("changesByPage", () => {
    it("lists a change under the page whose box holds its beat, with its count", () => {
        const byPage = changesByPage(
            [{ marcherId: 1, beat: 9, text: "Red silk" }],
            pages,
        );
        expect(byPage.get(1)?.get(13)).toEqual(["from count 1: Red silk"]);
    });

    it("joins changes on one count, and keeps counts apart", () => {
        const changes: ChangeAt[] = [
            { marcherId: 1, beat: 6, text: "carrying Rifle" },
            { marcherId: 1, beat: 3, text: "Red silk" },
            { marcherId: 1, beat: 6, text: "holding Flag · F1" },
        ];
        expect(changesByPage(changes, pages).get(1)?.get(12)).toEqual([
            "from count 3: Red silk",
            "from count 6: carrying Rifle; holding Flag · F1",
        ]);
    });

    it("counts a change on a page's flag as that page's last count", () => {
        expect(
            changesByPage([{ marcherId: 1, beat: 8, text: "x" }], pages)
                .get(1)
                ?.get(12),
        ).toEqual(["from count 8: x"]);
    });

    it("puts changes at home under the first page", () => {
        expect(
            changesByPage([{ marcherId: 1, beat: 0, text: "x" }], pages)
                .get(1)
                ?.get(11),
        ).toEqual(["from the start: x"]);
    });

    it("lists every change before the first count in one line", () => {
        expect(
            changesByPage(
                [
                    { marcherId: 1, beat: 0, text: "a" },
                    { marcherId: 1, beat: -1, text: "b" },
                ],
                pages,
            )
                .get(1)
                ?.get(11),
        ).toEqual(["from the start: b; a"]);
    });

    it("puts changes past the last flag under the last page", () => {
        expect(
            changesByPage([{ marcherId: 1, beat: 19, text: "x" }], pages)
                .get(1)
                ?.get(13),
        ).toEqual(["from count 3 after Page 3: x"]);
    });

    it("keeps each performer's changes apart", () => {
        const byPage = changesByPage(
            [
                { marcherId: 1, beat: 3, text: "a" },
                { marcherId: 2, beat: 3, text: "b" },
            ],
            pages,
        );
        expect(byPage.get(1)?.get(12)).toEqual(["from count 3: a"]);
        expect(byPage.get(2)?.get(12)).toEqual(["from count 3: b"]);
    });
});

describe("cueChanges", () => {
    const run = (
        segments: Partial<Record<CueChannel, CueSegment[]>>,
        countBeats = Array.from({ length: 32 }, (_, i) => i),
    ) =>
        cueChanges({
            marcherIds: [1],
            segments: (_, channel) => segments[channel] ?? [],
            countBeats,
            name: (value) => names[value],
        });

    it("words each channel's changes from their counts", () => {
        expect(
            run({
                carry: [
                    seg(0, 4, "builtin:flag", null),
                    seg(4, 32, "builtin:rifle"),
                ],
                silk: [seg(0, 6, null, null), seg(6, 32, "show:7")],
                uniform: [seg(0, 2, null, null), seg(2, 32, "show:8")],
            }),
        ).toEqual([
            { marcherId: 1, beat: 4, text: "carrying Rifle" },
            { marcherId: 1, beat: 6, text: "Red silk" },
            { marcherId: 1, beat: 2, text: "wearing West Point" },
        ]);
    });

    it("leaves out the defaults and cues that change nothing", () => {
        expect(
            run({
                carry: [
                    seg(0, 4, "builtin:flag", null),
                    seg(4, 8, "builtin:flag"),
                    seg(8, 12, "builtin:rifle", 2),
                    seg(12, 32, "builtin:rifle", 3),
                ],
            }),
        ).toEqual([{ marcherId: 1, beat: 8, text: "carrying Rifle" }]);
    });

    it("lists a cue at the start of the show", () => {
        expect(run({ silk: [seg(0, 32, "show:7")] })).toEqual([
            { marcherId: 1, beat: 0, text: "Red silk" },
        ]);
    });

    it("says when a cue takes equipment, a silk or a uniform away", () => {
        expect(
            run({
                carry: [seg(0, 4, "builtin:flag", null), seg(4, 32, "none")],
                silk: [seg(0, 4, "show:7"), seg(4, 32, "none", 2)],
            }).map((c) => c.text),
        ).toEqual(["carrying nothing", "Red silk", "no silk"]);
    });

    it("places a count on its beat, skipping empty segments", () => {
        expect(
            run(
                {
                    carry: [
                        seg(0, 2, "builtin:flag", null),
                        seg(2, 2, "builtin:flag", 5),
                        seg(2, 32, "builtin:rifle"),
                    ],
                },
                [0, 2, 5, 6],
            ),
        ).toEqual([{ marcherId: 1, beat: 5, text: "carrying Rifle" }]);
    });

    it("falls back to the segment's label for a value it can't name", () => {
        expect(run({ uniform: [seg(0, 32, "library:x@1")] })[0]?.text).toBe(
            "wearing library:x@1",
        );
    });
});

describe("placementChanges", () => {
    const change = (
        beat: number,
        state: PlacementChange["state"],
        holders: number[] = [],
        crew: number[] = [],
    ): PlacementChange => ({
        id: beat,
        beat,
        state,
        holders: holders.map((marcherId) => ({ marcherId, hand: "both" })),
        crew,
        groupId: null,
    });
    const run = (changes: PlacementChange[]) =>
        placementChanges(new Map([[5, changes]]), () => "Flag · F1");

    it("says when a performer takes an item and puts it down", () => {
        expect(run([change(3, "held", [1]), change(9, "placed")])).toEqual([
            { marcherId: 1, beat: 3, text: "holding Flag · F1" },
            { marcherId: 1, beat: 9, text: "puts down Flag · F1" },
        ]);
    });

    it("words a hand-off for both performers", () => {
        expect(run([change(3, "held", [1]), change(6, "held", [2])])).toEqual([
            { marcherId: 1, beat: 3, text: "holding Flag · F1" },
            { marcherId: 1, beat: 6, text: "hands off Flag · F1" },
            { marcherId: 2, beat: 6, text: "holding Flag · F1" },
        ]);
    });

    it("words taking an item off field, and crew", () => {
        expect(
            run([
                change(2, "placed", [], [3]),
                change(4, "held", [1]),
                change(8, "off_field"),
            ]),
        ).toEqual([
            { marcherId: 3, beat: 2, text: "crew for Flag · F1" },
            { marcherId: 1, beat: 4, text: "holding Flag · F1" },
            { marcherId: 1, beat: 8, text: "takes Flag · F1 off field" },
        ]);
    });

    it("leaves out changes that don't change a performer's part", () => {
        expect(
            run([change(3, "held", [1]), change(5, "held", [1, 2])]),
        ).toEqual([
            { marcherId: 1, beat: 3, text: "holding Flag · F1" },
            { marcherId: 2, beat: 5, text: "holding Flag · F1" },
        ]);
    });

    it("takes the last of an item's changes on one count", () => {
        expect(run([change(3, "held", [1]), change(3, "held", [2])])).toEqual([
            { marcherId: 2, beat: 3, text: "holding Flag · F1" },
        ]);
    });
});

describe("translatedChangeWords", () => {
    it("words changes as englishChangeWords does, from en.json", () => {
        const strings = en.exportCoordinates as Record<string, string>;
        const t = (key: string, params: Record<string, string | number>) =>
            strings[key.replace("exportCoordinates.", "")]!.replace(
                /\{(\w+)\}/g,
                (_, name: string) => String(params[name]),
            );
        const words = translatedChangeWords(t);
        const args: Record<keyof ChangeWords, (string | number)[]> = {
            carrying: ["Rifle"],
            carryingNothing: [],
            silk: ["Red silk"],
            noSilk: [],
            wearing: ["West Point"],
            noUniform: [],
            holding: ["Flag · F1"],
            crewFor: ["Cart · P2"],
            putsDown: ["Flag · F1"],
            handsOff: ["Flag · F1"],
            takesOffField: ["Flag · F1"],
            count: [9],
            countAfter: [3, "12"],
            theStart: [],
            line: ["count 9", "Red silk"],
        };
        for (const [key, a] of Object.entries(args)) {
            const word = key as keyof ChangeWords;
            const call = (w: ChangeWords) =>
                (w[word] as (...x: (string | number)[]) => string)(...a);
            expect(call(words)).toBe(call(englishChangeWords));
        }
    });
});

describe("itemExportName", () => {
    it("names an item with its drill number", () => {
        expect(
            itemExportName({ name: "Flag", drill_prefix: "F", drill_order: 1 }),
        ).toBe("Flag · F1");
        expect(
            itemExportName({ name: "", drill_prefix: "P", drill_order: 2 }),
        ).toBe("P2");
    });
});
