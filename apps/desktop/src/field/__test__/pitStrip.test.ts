// @vitest-environment node
import { describe, expect, it } from "vitest";
import { FieldProperties } from "@openmarch/core";
import FieldPropertiesTemplates from "@/global/classes/FieldProperties.templates";
import { PIT_STRIP_DEPTH_FT, fieldViewSize, pitStripOf } from "../pitStrip";

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

describe("fieldViewSize", () => {
    it("is the field alone with no strip", () => {
        expect(fieldViewSize(fp, null)).toEqual({
            width: fp.width,
            height: fp.height,
        });
    });

    it("reaches the strip's far edge, so fitting the field shows the pit", () => {
        expect(fieldViewSize(fp, pitStripOf(fp, true))).toEqual({
            width: fp.width,
            height: fp.height + THIRTY_FEET,
        });
    });
});
