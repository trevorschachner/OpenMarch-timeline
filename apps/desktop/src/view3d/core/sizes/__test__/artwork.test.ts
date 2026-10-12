import { describe, expect, it } from "vitest";
import {
    catalogSizesForAspect,
    displaySize,
    effectiveDpi,
    fitScale,
    nativeDpi,
    pixelAspectTolerance,
    printReadiness,
    sameAspect,
} from "../artwork";
import { toMeters } from "../units";

const inches = (w: number, h: number) => ({
    widthM: toMeters(w, "in"),
    heightM: toMeters(h, "in"),
});

describe("displaySize", () => {
    it("fits silks inside 1024 × 1536, turned to match the image", () => {
        expect(displaySize("silk", { width: 3600, height: 5400 })).toEqual({
            width: 1024,
            height: 1536,
        });
        expect(displaySize("silk", { width: 5400, height: 3600 })).toEqual({
            width: 1536,
            height: 1024,
        });
        // 44 × 66 in swing silk, landscape, limited by the short side.
        expect(displaySize("silk", { width: 4400, height: 1000 })).toEqual({
            width: 1536,
            height: 349,
        });
    });

    it("caps floors at 2048 and prop slots at 1024 on the long edge", () => {
        expect(displaySize("baseFloor", { width: 9000, height: 6000 })).toEqual(
            { width: 2048, height: 1365 },
        );
        expect(displaySize("floorProp", { width: 1000, height: 4000 })).toEqual(
            { width: 512, height: 2048 },
        );
        expect(displaySize("propSlot", { width: 3000, height: 3000 })).toEqual({
            width: 1024,
            height: 1024,
        });
    });

    it("caps Uniform part artwork at 1024 on the long edge, like prop slots", () => {
        expect(
            displaySize("uniformPart", { width: 2000, height: 3000 }),
        ).toEqual({ width: 683, height: 1024 });
        expect(printReadiness("uniformPart", 149)).toBe("not-print-ready");
        expect(printReadiness("uniformPart", 300)).toBe("recommended");
    });

    it("never enlarges a raster, but renders a vector at the cap", () => {
        expect(displaySize("propSlot", { width: 300, height: 200 })).toEqual({
            width: 300,
            height: 200,
        });
        expect(
            displaySize("propSlot", { width: 3, height: 2 }, { enlarge: true }),
        ).toEqual({ width: 1024, height: 683 });
    });
});

describe("DPI and fit", () => {
    it("measures native DPI against the physical width", () => {
        expect(nativeDpi(5400, toMeters(36, "in"))).toBeCloseTo(150, 9);
    });

    it("scales same-aspect artwork the same way in fill and fit", () => {
        const art = inches(36, 54);
        const slot = inches(30, 45);
        expect(fitScale(art, slot, "fill")).toBeCloseTo(30 / 36, 12);
        expect(fitScale(art, slot, "fit")).toBeCloseTo(30 / 36, 12);
    });

    it("fills by covering and fits by staying inside, never stretching", () => {
        const art = inches(36, 54);
        const slot = inches(44, 66 * 2);
        expect(fitScale(art, slot, "fill")).toBeCloseTo(132 / 54, 12);
        expect(fitScale(art, slot, "fit")).toBeCloseTo(44 / 36, 12);
    });

    it("divides native DPI by the scale and keeps vectors vector", () => {
        expect(effectiveDpi(300, 2)).toBe(150);
        expect(effectiveDpi("vector", 10)).toBe("vector");
    });

    it("warns below the minimum per surface, floors at 1:1 lower", () => {
        expect(printReadiness("silk", 149)).toBe("not-print-ready");
        expect(printReadiness("silk", 150)).toBe("minimum");
        expect(printReadiness("propSlot", 300)).toBe("recommended");
        expect(printReadiness("baseFloor", 30)).toBe("minimum");
        expect(printReadiness("floorProp", 29)).toBe("not-print-ready");
        expect(printReadiness("baseFloor", 60)).toBe("recommended");
        expect(printReadiness("silk", "vector")).toBe("vector");
    });
});

describe("aspect matching", () => {
    it("compares aspects within a tolerance", () => {
        expect(sameAspect(36 / 54, 1000 / 1500)).toBe(true);
        expect(sameAspect(36 / 54, 36 / 56)).toBe(false);
        expect(pixelAspectTolerance({ width: 10, height: 15 })).toBe(0.1);
        expect(pixelAspectTolerance({ width: 4000, height: 6000 })).toBe(0.005);
    });

    it("offers catalog chips in the image's orientation", () => {
        const portrait = catalogSizesForAspect(36 / 54);
        const chip = portrait.find((c) => c.catalogId === "silk-6ft-36x54");
        expect(chip?.label).toBe("Silk 36 × 54 in");
        expect(chip?.width.m).toBe(toMeters(36, "in"));
        expect(chip?.height.m).toBe(toMeters(54, "in"));

        const landscape = catalogSizesForAspect(54 / 36);
        const turned = landscape.find((c) => c.catalogId === "silk-6ft-36x54");
        expect(turned?.label).toBe("Silk 54 × 36 in");

        expect(catalogSizesForAspect(8 / 4).map((c) => c.label)).toContain(
            "Flat prop 8 × 4 ft",
        );
        expect(catalogSizesForAspect(90 / 60).map((c) => c.label)).toContain(
            "Floor 90 × 60 ft",
        );
        expect(catalogSizesForAspect(1)).toEqual([]);
    });
});
