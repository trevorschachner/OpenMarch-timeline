// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import {
    PIT_STRIP_DEPTH_FT,
    backStripOf,
    fieldViewSize,
    hasEquipmentBehind,
    pitStripOf,
} from "../pitStrip";

const fp: FieldProperties =
    FieldPropertiesTemplates.HIGH_SCHOOL_FOOTBALL_FIELD_NO_END_ZONES;
/** 30 ft in field units: 360 in at half a unit per inch, 16 8-to-5 steps */
const THIRTY_FEET = 360 * FieldProperties.PIXELS_PER_INCH;

describe("pitStripOf", () => {
    it("is 30 ft deep in front of the front sideline, across the whole field", () => {
        expect(PIT_STRIP_DEPTH_FT).toBe(30);
        expect(THIRTY_FEET).toBeCloseTo(16 * fp.pixelsPerStep);
        expect(pitStripOf(fp, true)).toEqual({
            left: 0,
            right: fp.width,
            top: fp.centerFrontPoint.yPixels,
            bottom: fp.centerFrontPoint.yPixels + THIRTY_FEET,
        });
    });

    it("is toward the audience: past the front sideline, where y grows", () => {
        const strip = pitStripOf(fp, true)!;
        expect(strip.top).toBe(fp.height);
        expect(strip.bottom).toBeGreaterThan(fp.height);
    });

    it("is not drawn in a show with no front ensemble", () => {
        expect(pitStripOf(fp, false)).toBeNull();
    });
});

describe("backStripOf", () => {
    it("is 30 ft deep behind the back sideline, across the whole field", () => {
        expect(backStripOf(fp, true)).toEqual({
            left: 0,
            right: fp.width,
            top: -THIRTY_FEET,
            bottom: 0,
        });
    });

    it("is not drawn with no equipment behind the field", () => {
        expect(backStripOf(fp, false)).toBeNull();
    });
});

describe("hasEquipmentBehind", () => {
    const at = new Map([
        [1, [900, 980] as const],
        [2, [900, -40] as const],
        [3, [900, 400] as const],
    ]);
    const positionAt = (id: number) => at.get(id)!;

    it("is true when an equipment item stands behind the back sideline", () => {
        expect(hasEquipmentBehind([1, 2], positionAt)).toBe(true);
    });

    it("is false for equipment on the field or in front of it", () => {
        expect(hasEquipmentBehind([1, 3], positionAt)).toBe(false);
        expect(hasEquipmentBehind([], positionAt)).toBe(false);
    });
});

describe("fieldViewSize", () => {
    it("is the field alone with no strip", () => {
        expect(fieldViewSize(fp, [])).toEqual({
            width: fp.width,
            height: fp.height,
            top: 0,
        });
    });

    it("reaches the strip's far edge, so fitting the field shows the pit", () => {
        expect(fieldViewSize(fp, [pitStripOf(fp, true)])).toEqual({
            width: fp.width,
            height: fp.height + THIRTY_FEET,
            top: 0,
        });
    });

    it("reaches up over the back strip too", () => {
        expect(
            fieldViewSize(fp, [pitStripOf(fp, true), backStripOf(fp, true)]),
        ).toEqual({
            width: fp.width,
            height: fp.height + 2 * THIRTY_FEET,
            top: -THIRTY_FEET,
        });
    });
});
