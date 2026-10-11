/**
 * The template values the spec doesn't fix yet (docs/3d/props-spec.md §3
 * names them but gives no figures): the safe area, the bleed of surfaces that
 * are neither flags nor sublimation (floors and props), and the outline of
 * the arc, teardrop and swing cuts. The outline is also what 3D clips to, so
 * it must match the silk geometry.
 *
 * Until they are decided there is no built-in policy: callers pass one.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import type { Length } from "../sizes/units";
import { FIXED_BLEED, type TemplateSurface } from "./surfaces";

/** A point in meters, from the trim's top-left corner, y down. */
export type Point = readonly [x: number, y: number];

export interface Insets<L = Length> {
    readonly top: L;
    readonly right: L;
    readonly bottom: L;
    readonly left: L;
}

export interface TemplatePolicy {
    /** The safe area's inset from the trim on each side. */
    safeArea(surface: TemplateSurface): Insets;
    /** Bleed for a surface whose print process has no fixed bleed. */
    bleed(surface: TemplateSurface): Length;
    /**
     * The cut's outline, inside the trim, for any cut other than a
     * rectangle: at least three points, in order, not closed.
     */
    cutOutline(surface: TemplateSurface): readonly Point[];
}

/** A surface with every value resolved to meters. */
export interface ResolvedTemplate {
    readonly surface: TemplateSurface;
    readonly trimM: { readonly width: number; readonly height: number };
    readonly bleedM: number;
    readonly safeM: Insets<number>;
    /** Present for every cut other than a rectangle. */
    readonly outlineM?: readonly Point[];
}

const EPS = 1e-9;

export function resolveTemplate(
    surface: TemplateSurface,
    policy: TemplatePolicy,
): ResolvedTemplate {
    const width = surface.width.m;
    const height = surface.height.m;
    if (!(width > 0 && height > 0))
        throw new Error(`${surface.id}: size must be positive`);

    const bleedM = (FIXED_BLEED[surface.process] ?? policy.bleed(surface)).m;
    if (!(bleedM >= 0)) throw new Error(`${surface.id}: negative bleed`);

    const s = policy.safeArea(surface);
    const safeM = {
        top: s.top.m,
        right: s.right.m,
        bottom: s.bottom.m,
        left: s.left.m,
    };
    if (Object.values(safeM).some((v) => !(v >= 0)))
        throw new Error(`${surface.id}: negative safe-area inset`);
    if (safeM.left + safeM.right >= width || safeM.top + safeM.bottom >= height)
        throw new Error(`${surface.id}: safe area is empty`);

    if (surface.cut === "rectangle")
        return { surface, trimM: { width, height }, bleedM, safeM };

    const outlineM = policy.cutOutline(surface);
    if (outlineM.length < 3)
        throw new Error(`${surface.id}: cut outline needs three points`);
    for (const [x, y] of outlineM)
        if (x < -EPS || y < -EPS || x > width + EPS || y > height + EPS)
            throw new Error(`${surface.id}: cut outline leaves the trim`);
    return { surface, trimM: { width, height }, bleedM, safeM, outlineM };
}
