// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_THEME } from "@openmarch/core";
import type { DrawnItemOutline } from "../fieldItems";
import {
    DIMMED_ITEM_ALPHA,
    COLORED_ITEM_FILL_ALPHA,
    ITEM_FILL_ALPHA,
    ITEM_STROKE_WIDTH,
    LOCK_BADGE_RADIUS,
    planItems,
    SELECTED_ITEM_STROKE_WIDTH,
} from "../itemsPlan";
import { playingSpotOf } from "@/view3d/core/pit/playingSpot";
import { SELECTION_RGBA01 } from "../selectionRing";

const square = (
    id: number,
    closed = true,
    color: DrawnItemOutline["color"] = null,
): DrawnItemOutline => ({
    id,
    color,
    points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
    ],
    closed,
    locked: false,
    playingSpot: null,
    center: { x: 5, y: 5 },
    geometry: {
        outlineType: "rectangle",
        width: 1,
        depth: 1,
        height: 0,
        rotation: 0,
        customOutline: null,
        rollsOut: false,
        leadingEdge: null,
        progress: 1,
    },
});

const options = {
    theme: DEFAULT_FIELD_THEME,
    selected: new Set<number>(),
    isDimmed: () => false,
};

describe("planItems", () => {
    it("fills an Outline faintly and closes its line", () => {
        const plan = planItems([square(1)], options);
        expect(plan.fills).toHaveLength(1);
        expect(plan.fills[0].color[3]).toBeCloseTo(
            (DEFAULT_FIELD_THEME.primaryStroke.a ?? 1) * ITEM_FILL_ALPHA,
        );
        const [stroke] = plan.strokes;
        expect(stroke.points).toHaveLength(5);
        expect(stroke.points.at(-1)).toEqual(stroke.points[0]);
        expect(stroke.width).toBe(ITEM_STROKE_WIDTH);
    });

    it("fills a colored prop with its color and keeps the theme's line", () => {
        const red = { r: 220, g: 38, b: 38, a: 1 };
        const plan = planItems([square(1, true, red)], options);
        const [r, g, b, a] = plan.fills[0].color;
        expect([r, g, b]).toEqual([220 / 255, 38 / 255, 38 / 255]);
        expect(a).toBeCloseTo(COLORED_ITEM_FILL_ALPHA);
        const line = DEFAULT_FIELD_THEME.primaryStroke;
        expect(plan.strokes[0].color.slice(0, 3)).toEqual([
            line.r / 255,
            line.g / 255,
            line.b / 255,
        ]);
    });

    it("dims a colored prop like the others", () => {
        const red = { r: 220, g: 38, b: 38, a: 1 };
        const plan = planItems([square(1, true, red)], {
            ...options,
            isDimmed: () => true,
        });
        expect(plan.fills[0].color[3]).toBeCloseTo(
            COLORED_ITEM_FILL_ALPHA * DIMMED_ITEM_ALPHA,
        );
    });

    it("leaves an open freehand line open", () => {
        expect(
            planItems([square(1, false)], options).strokes[0].points,
        ).toHaveLength(4);
    });

    it("outlines a selected item in the selection color, thicker", () => {
        const [stroke] = planItems([square(1)], {
            ...options,
            selected: new Set([1]),
        }).strokes;
        expect(stroke.color).toEqual(SELECTION_RGBA01);
        expect(stroke.width).toBe(SELECTED_ITEM_STROKE_WIDTH);
    });

    it("fades a dimmed item", () => {
        const plain = planItems([square(1)], options);
        const dimmed = planItems([square(1)], {
            ...options,
            isDimmed: () => true,
        });
        expect(dimmed.strokes[0].color[3]).toBeCloseTo(
            plain.strokes[0].color[3] * DIMMED_ITEM_ALPHA,
        );
    });
});

describe("planItems for the front ensemble", () => {
    const zoom = 2;
    const withZoom = { ...options, zoom };

    it("marks a locked item with a lock at its top left corner, the same size at every zoom", () => {
        const plain = planItems([square(1)], withZoom);
        expect(plain.locks).toEqual([]);
        const locked = planItems([{ ...square(1), locked: true }], withZoom);
        expect(locked.locks).toEqual([{ x: 0, y: 0 }]);
        expect(locked.fills.length).toBeGreaterThan(plain.fills.length);
        // Everything the lock draws is within its badge, in CSS px
        const reach = LOCK_BADGE_RADIUS / zoom + 1e-9;
        for (const fill of locked.fills.slice(plain.fills.length))
            for (const p of fill.points) {
                expect(Math.abs(p.x - 0)).toBeLessThanOrEqual(reach);
                expect(Math.abs(p.y - 0)).toBeLessThanOrEqual(reach);
            }
        const zoomedIn = planItems([{ ...square(1), locked: true }], {
            ...withZoom,
            zoom: 4,
        });
        const span = (plan: typeof locked) => {
            const xs = plan.fills
                .slice(plain.fills.length)
                .flatMap((f) => f.points.map((p) => p.x));
            return Math.max(...xs) - Math.min(...xs);
        };
        expect(span(zoomedIn)).toBeCloseTo(span(locked) / 2);
    });

    it("shrinks the lock on an item small on screen, and leaves it out when tiny", () => {
        const plain = planItems([square(1)], { ...withZoom, zoom: 1 });
        const badge = (zoom: number) =>
            planItems([{ ...square(1), locked: true }], { ...withZoom, zoom })
                .fills.slice(plain.fills.length)
                .flatMap((f) => f.points.map((p) => p.x));
        // At zoom 1 the 10-unit square is 10 px: a badge of radius 5 px
        const small = badge(1);
        expect(Math.max(...small) - Math.min(...small)).toBeCloseTo(10);
        // At 0.5 it is 5 px: no badge, though it is still locked
        expect(badge(0.5)).toEqual([]);
        expect(
            planItems([{ ...square(1), locked: true }], {
                ...withZoom,
                zoom: 0.5,
            }).locks,
        ).toHaveLength(1);
    });

    it("draws a pit instrument's playing spot as a faint ring of its reach", () => {
        const spot = playingSpotOf("pit/marimba-5.0", {
            center: { x: 5, y: 5 },
            depth: 1,
            rotation: 0,
        });
        const plain = planItems([square(1)], withZoom);
        const plan = planItems([{ ...square(1), playingSpot: spot }], withZoom);
        expect(plan.spots).toEqual([spot]);
        const ring = plan.strokes.slice(plain.strokes.length);
        expect(ring).toHaveLength(1);
        expect(ring[0].dash).not.toBeNull();
        for (const p of ring[0].points)
            expect(Math.hypot(p.x - spot!.x, p.y - spot!.y)).toBeCloseTo(
                spot!.reach,
            );
        // Fainter than the Outline's line
        expect(ring[0].color[3]).toBeLessThan(plain.strokes[0].color[3]);
    });
});
