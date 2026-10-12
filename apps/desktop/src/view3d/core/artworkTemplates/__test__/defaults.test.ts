// cspell:words teardrop
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { lengthOf, toMeters } from "../../sizes/units";
import {
    artworkTemplateFiles,
    CUT_PENDING_NOTE,
    DEFAULT_TEMPLATE_POLICY,
    DPI_GUIDE,
    FLOOR_PNG_MAX_PX,
    FLOOR_PRINT_MASTER_NOTE,
    floorPropSurface,
    layoutTemplate,
    pngSize,
    propSurface,
    resolveTemplate,
    TEMPLATE_SURFACES,
    templateInfoLines,
    templatePng,
    templatePngDpi,
    templateSurface,
    type TemplateSurface,
} from "..";

const deflate = (data: Uint8Array) => deflateSync(data);
const resolved = (s: TemplateSurface) =>
    resolveTemplate(s, DEFAULT_TEMPLATE_POLICY);
const drawingOf = (s: TemplateSurface) => layoutTemplate(resolved(s));
const inches = (n: number) => toMeters(n, "in");

const floorProp = floorPropSurface(lengthOf(12, "ft"), lengthOf(8, "ft"));
const propTop = propSurface("top", lengthOf(48, "in"), lengthOf(24, "in"));
const propFront = propSurface("front", lengthOf(1.2, "m"), lengthOf(2.4, "m"));
const ALL = [...TEMPLATE_SURFACES, floorProp, propTop, propFront];

const byProcess = (process: TemplateSurface["process"]) =>
    ALL.filter((s) => s.process === process);

/** The `tEXt` chunks of a PNG, as keyword to text. */
function pngText(png: Uint8Array): Record<string, string> {
    const buf = Buffer.from(png);
    const out: Record<string, string> = {};
    for (let at = 8; at < buf.length; ) {
        const length = buf.readUInt32BE(at);
        const type = buf.toString("latin1", at + 4, at + 8);
        if (type === "tEXt") {
            const data = buf.toString("latin1", at + 8, at + 8 + length);
            const nul = data.indexOf("\0");
            out[data.slice(0, nul)] = data.slice(nul + 1);
        }
        at += 12 + length;
    }
    return out;
}

describe("DEFAULT_TEMPLATE_POLICY (owner, 2026-10-11)", () => {
    it("resolves every surface", () => {
        for (const s of ALL) expect(() => resolved(s), s.id).not.toThrow();
    });

    it("puts the safe area 1 in inside the trim on silks, props and uniform panels (Q29)", () => {
        const standard = ALL.filter((s) => s.process !== "floor");
        expect(standard.some((s) => s.kind === "silk")).toBe(true);
        expect(standard.some((s) => s.kind === "propTop")).toBe(true);
        expect(standard.some((s) => s.kind === "uniformFront")).toBe(true);
        for (const s of standard)
            expect(resolved(s).safeM, s.id).toEqual({
                top: inches(1),
                right: inches(1),
                bottom: inches(1),
                left: inches(1),
            });
    });

    it("puts the safe area 6 in inside the trim on floors and Floor props (Q29)", () => {
        const floors = byProcess("floor");
        expect(floors.map((s) => s.kind)).toContain("baseFloor");
        expect(floors.map((s) => s.kind)).toContain("floorProp");
        for (const s of floors)
            expect(resolved(s).safeM, s.id).toEqual({
                top: inches(6),
                right: inches(6),
                bottom: inches(6),
                left: inches(6),
            });
    });

    it("bleeds 2 in on floors, 1/2 in on props, and keeps the spec's flag and sublimation bleed (Q30)", () => {
        const expected = {
            floor: inches(2),
            prop: inches(0.5),
            flag: inches(0.125),
            sublimation: inches(0.5),
        };
        for (const s of ALL)
            expect(resolved(s).bleedM, s.id).toBe(expected[s.process]);
        expect(byProcess("prop").length).toBeGreaterThan(0);
    });

    it("leaves arc, teardrop and swing outlines pending, without inventing one (Q28)", () => {
        const masked = ALL.filter((s) => s.cut !== "rectangle");
        expect(new Set(masked.map((s) => s.cut))).toEqual(
            new Set(["arc", "teardrop", "swing"]),
        );
        for (const s of masked) {
            const t = resolved(s);
            expect(t.outlineM, s.id).toBeUndefined();
            expect(t.cutPending, s.id).toBe(true);
            const text = templateInfoLines(t).join(" ");
            expect(text, s.id).toContain(CUT_PENDING_NOTE);
            // Drawn as the full rectangle: no mask area.
            expect(
                drawingOf(s).shapes.some(
                    (shape) => shape.type === "area" && shape.fill === "mask",
                ),
                s.id,
            ).toBe(false);
        }
        for (const s of ALL.filter((s) => s.cut === "rectangle"))
            expect(resolved(s).cutPending, s.id).toBeUndefined();
    });

    it("names the safe-area inset in the template", () => {
        const silk = templateInfoLines(
            resolved(templateSurface("silk-6ft-36x54")!),
        );
        expect(silk).toContain(
            'Keep important content inside the dashed safe area, 1" from the trim.',
        );
        const floor = templateInfoLines(
            resolved(templateSurface("base-floor-wgi-minimum-60x90ft")!),
        );
        expect(floor).toContain(
            'Keep important content inside the dashed safe area, 6" from the trim.',
        );
        const top = templateInfoLines(
            resolved(templateSurface("uniform-top-front")!),
        );
        expect(top).toContain(
            "Keep important content inside the dashed safe area, 25.4 mm from the trim.",
        );
    });
});

describe("templatePngDpi (Q31)", () => {
    it("writes silks, props and uniform panels at their minimum print DPI", () => {
        for (const s of ALL.filter((s) => s.process !== "floor"))
            expect(templatePngDpi(drawingOf(s)), s.id).toBe(s.dpi.minimum);
    });

    it("caps floors at 8192 px on the long edge", () => {
        const floors = byProcess("floor");
        for (const s of floors) {
            const d = drawingOf(s);
            const dpi = templatePngDpi(d);
            const size = pngSize(d, dpi);
            expect(dpi, s.id).toBeLessThanOrEqual(s.dpi.minimum);
            expect(Math.max(size.width, size.height), s.id).toBeLessThanOrEqual(
                FLOOR_PNG_MAX_PX,
            );
        }
        // 90 ft + 2 x 2 in bleed = 1084 in on the long edge.
        const wgi = drawingOf(
            templateSurface("base-floor-wgi-minimum-60x90ft")!,
        );
        expect(templatePngDpi(wgi)).toBeCloseTo(FLOOR_PNG_MAX_PX / 1084, 9);
        expect(pngSize(wgi, templatePngDpi(wgi)).width).toBe(FLOOR_PNG_MAX_PX);
    });

    it("keeps a small floor prop at its minimum DPI", () => {
        // 12 ft + 4 in = 148 in at 30 DPI = 4440 px, under the cap.
        expect(templatePngDpi(drawingOf(floorProp))).toBe(30);
    });

    it("says on every floor template that the PDF or SVG is the print master", () => {
        for (const s of byProcess("floor")) {
            expect(s.notes, s.id).toContain(FLOOR_PRINT_MASTER_NOTE);
            const lines = templateInfoLines(resolved(s)).join(" ");
            expect(lines, s.id).toContain("print master");
        }
        for (const s of ALL.filter((s) => s.process !== "floor"))
            expect(s.notes, s.id).not.toContain(FLOOR_PRINT_MASTER_NOTE);
    });

    it("writes the print-master note into a floor PNG's metadata", () => {
        const [, , floorPng] = artworkTemplateFiles(floorProp, {
            deflate,
            pngDpi: 1,
        });
        expect(pngText(floorPng.data as Uint8Array)).toEqual({
            Comment: FLOOR_PRINT_MASTER_NOTE,
        });
        const [, , silkPng] = artworkTemplateFiles(
            templateSurface("silk-6ft-36x54")!,
            { deflate, pngDpi: 4 },
        );
        expect(pngText(silkPng.data as Uint8Array)).toEqual({});
    });

    it("rejects a PNG comment that isn't printable ASCII", () => {
        expect(() =>
            templatePng(drawingOf(floorProp), {
                dpi: 1,
                deflate,
                comment: "café",
            }),
        ).toThrow(/printable ASCII/);
    });
});

describe("as built (Q32)", () => {
    it("lays silks fly wide by header tall, pole side on the left", () => {
        const silk = templateSurface("silk-6ft-36x54")!;
        expect(silk.width.m).toBe(inches(54));
        expect(silk.height.m).toBe(inches(36));
        expect(silk.orientation).toBe("poleLeft");
    });

    it("gives Floor props the floor DPI guide (30/60)", () => {
        expect(floorProp.dpi).toEqual(DPI_GUIDE.floor);
        expect(DPI_GUIDE.floor).toEqual({ minimum: 30, recommended: 60 });
    });

    it("makes default downloads with the default policy and PNG DPI", () => {
        const s = templateSurface("uniform-top-front")!;
        const files = artworkTemplateFiles(s, { deflate });
        const png = Buffer.from(files[2].data as Uint8Array);
        const d = drawingOf(s);
        const size = pngSize(d, s.dpi.minimum);
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([
            size.width,
            size.height,
        ]);
    });
});
