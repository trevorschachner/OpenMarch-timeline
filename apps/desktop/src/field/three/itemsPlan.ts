import type { FieldTheme } from "@openmarch/core";
import { rgbaOf, type Rgba, type StrokePlan } from "@/field/timelineOverlays";
import type { Pt } from "@/items/itemOutlines";
import type { PlayingSpot } from "@/view3d/core/pit/playingSpot";
import type { DrawnItemOutline } from "./fieldItems";
import { SELECTION_RGBA01 } from "./selectionRing";

/** An Outline's line, in CSS px: thicker while selected. */
export const ITEM_STROKE_WIDTH = 1.5;
export const SELECTED_ITEM_STROKE_WIDTH = 2.5;
/** An Outline's fill: the theme's line color, faint enough for the field to show through. */
export const ITEM_FILL_ALPHA = 0.25;
/**
 * A prop with its own color: filled with it, strong enough to read as that color on both themes'
 * fields, still letting the grid show through. Its line stays the theme's, so a pale color keeps
 * an edge on a light field.
 */
export const COLORED_ITEM_FILL_ALPHA = 0.6;
/** A dimmed item (outside an isolated move), as dimmed marchers. */
export const DIMMED_ITEM_ALPHA = 0.3;

/** A filled polygon, in field units. */
export type FillPlan = { readonly points: readonly Pt[]; readonly color: Rgba };

/**
 * A locked item's badge: a disc of this radius in CSS px, holding a padlock. On an item small on
 * screen it shrinks to half the item's narrower side, and below `MIN_LOCK_BADGE_RADIUS` it isn't
 * drawn, so a zoomed-out pit doesn't turn into a row of locks.
 */
export const LOCK_BADGE_RADIUS = 9;
export const MIN_LOCK_BADGE_RADIUS = 4;
/** A playing spot's ring: as faint as this share of the Outline's line, 1 CSS px wide */
export const PLAYING_SPOT_ALPHA = 0.55;
const PLAYING_SPOT_WIDTH = 1;
/** Points around a circle drawn as a polygon */
const CIRCLE_POINTS = 24;

/**
 * What the items layer draws: each Outline's fill, then its line; a padlock badge on each locked
 * item (`locks`, the badges' centers) and a faint ring on each pit instrument's playing spot
 * (`spots`). Line widths are CSS px.
 */
export type ItemsPlan = {
    readonly fills: readonly FillPlan[];
    readonly strokes: readonly StrokePlan[];
    readonly locks: readonly Pt[];
    readonly spots: readonly PlayingSpot[];
};

const faded = (color: Rgba, alpha: number): Rgba => [
    color[0],
    color[1],
    color[2],
    color[3] * alpha,
];

/**
 * The items layer's plan: every Outline filled in its prop's color (or
 * faintly in the theme's line color) and outlined in the theme's line color,
 * a selected one outlined in the selection color. A locked item gets a
 * padlock badge at its top left corner, the same size on screen at every
 * `zoom` (CSS px per field unit, 1 by default); a pit instrument a faint ring
 * on its playing spot, as wide as the spot's reach.
 */
export function planItems(
    outlines: readonly DrawnItemOutline[],
    {
        theme,
        selected,
        isDimmed,
        zoom = 1,
    }: {
        theme: FieldTheme;
        selected: ReadonlySet<number>;
        isDimmed: (id: number) => boolean;
        zoom?: number;
    },
): ItemsPlan {
    const line = rgbaOf(theme.primaryStroke);
    const selection = SELECTION_RGBA01 as unknown as Rgba;
    const fills: FillPlan[] = [];
    const strokes: StrokePlan[] = [];
    const locks: Pt[] = [];
    const spots: PlayingSpot[] = [];
    // The badges and spots go over every Outline
    const badgeFills: FillPlan[] = [];
    const markStrokes: StrokePlan[] = [];
    for (const outline of outlines) {
        const alpha = isDimmed(outline.id) ? DIMMED_ITEM_ALPHA : 1;
        const isSelected = selected.has(outline.id);
        fills.push({
            points: outline.points,
            color: outline.color
                ? rgbaOf(outline.color, COLORED_ITEM_FILL_ALPHA * alpha)
                : faded(line, ITEM_FILL_ALPHA * alpha),
        });
        strokes.push({
            points: outline.closed
                ? [...outline.points, outline.points[0]]
                : outline.points,
            color: faded(isSelected ? selection : line, alpha),
            width: isSelected ? SELECTED_ITEM_STROKE_WIDTH : ITEM_STROKE_WIDTH,
            dash: null,
            round: true,
        });
        const spot = outline.playingSpot;
        if (spot) {
            spots.push(spot);
            markStrokes.push({
                points: circle(spot, spot.reach, true),
                color: faded(line, PLAYING_SPOT_ALPHA * alpha),
                width: PLAYING_SPOT_WIDTH,
                dash: [spot.reach / 3, spot.reach / 3],
                round: false,
            });
        }
        if (outline.locked) {
            const corner = topLeft(outline.points);
            locks.push(corner);
            const radius = Math.min(
                LOCK_BADGE_RADIUS,
                (narrowerSide(outline.points) * zoom) / 2,
            );
            if (radius >= MIN_LOCK_BADGE_RADIUS)
                badgeFills.push(
                    ...lockBadge(corner, radius / LOCK_BADGE_RADIUS / zoom, {
                        disc: faded(rgbaOf(theme.background), 0.9 * alpha),
                        lock: faded(line, alpha),
                    }),
                );
        }
    }
    return {
        fills: [...fills, ...badgeFills],
        strokes: [...strokes, ...markStrokes],
        locks,
        spots,
    };
}

/** The top left corner of the points' box, in field units (y grows down the screen) */
function topLeft(points: readonly Pt[]): Pt {
    let x = Infinity;
    let y = Infinity;
    for (const p of points) {
        x = Math.min(x, p.x);
        y = Math.min(y, p.y);
    }
    return { x, y };
}

/** The narrower side of the points' box, in field units */
function narrowerSide(points: readonly Pt[]): number {
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    return Math.min(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys),
    );
}

/** A circle of `radius` about `center` as a polygon; `closed` repeats the first point at the end */
function circle(center: Pt, radius: number, closed = false): Pt[] {
    const points: Pt[] = [];
    const n = closed ? CIRCLE_POINTS + 1 : CIRCLE_POINTS;
    for (let i = 0; i < n; i++) {
        const a = (i / CIRCLE_POINTS) * Math.PI * 2;
        points.push({
            x: center.x + radius * Math.cos(a),
            y: center.y + radius * Math.sin(a),
        });
    }
    return points;
}

/**
 * A padlock on a disc, centered on `at`, drawn as fills laid out in CSS px of a full-size badge
 * (`px` field units each): the disc, the lock's body, and its shackle as a thick arc with two legs.
 */
function lockBadge(
    at: Pt,
    px: number,
    colors: { disc: Rgba; lock: Rgba },
): FillPlan[] {
    const p = (dx: number, dy: number): Pt => ({
        x: at.x + dx * px,
        y: at.y + dy * px,
    });
    const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
        p(x0, y0),
        p(x1, y0),
        p(x1, y1),
        p(x0, y1),
    ];
    // The shackle: a half ring of outer radius 3.5 and inner 2, over the body's top at y = -0.5
    const outer = 3.5;
    const inner = 2;
    const arc: Pt[] = [];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
        const a = Math.PI + (i / steps) * Math.PI;
        arc.push(p(outer * Math.cos(a), -1.5 + outer * Math.sin(a)));
    }
    for (let i = steps; i >= 0; i--) {
        const a = Math.PI + (i / steps) * Math.PI;
        arc.push(p(inner * Math.cos(a), -1.5 + inner * Math.sin(a)));
    }
    return [
        // A rim in the lock's color, then the disc inside it
        { points: circle(at, LOCK_BADGE_RADIUS * px), color: colors.lock },
        {
            points: circle(at, (LOCK_BADGE_RADIUS - 1) * px),
            color: colors.disc,
        },
        { points: arc, color: colors.lock },
        { points: rect(-outer, -1.5, -inner, 0), color: colors.lock },
        { points: rect(inner, -1.5, outer, 0), color: colors.lock },
        { points: rect(-4.5, -0.5, 4.5, 5), color: colors.lock },
    ];
}
