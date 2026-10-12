/**
 * The template values docs/3d/props-spec.md §3 names but gives no figures
 * for: the safe area, the bleed of surfaces that are neither flags nor
 * sublimation (floors and props), and the outline of the arc, teardrop and
 * swing cuts. The outline is also what 3D clips to, so it must match the silk
 * geometry.
 *
 * `DEFAULT_TEMPLATE_POLICY` holds the owner's figures (2026-10-11, Q29 and
 * Q30). The cut outlines (Q28) are still being researched, so the default
 * policy gives none: those templates show the full rectangle and say the
 * outline is pending, rather than an invented shape.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import { lengthOf, type Length } from "../sizes/units";
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
     * rectangle: at least three points, in order, not closed. `undefined`
     * when the outline isn't known yet: the template is then drawn as the
     * full rectangle and marked as pending.
     */
    cutOutline(surface: TemplateSurface): readonly Point[] | undefined;
}

/** Safe area (Q29): 6 in on floors and Floor props, 1 in on everything else. */
export const SAFE_AREA: Readonly<Record<"floor" | "standard", Length>> = {
    floor: lengthOf(6, "in"),
    standard: lengthOf(1, "in"),
};

/**
 * Bleed for the processes the spec leaves open (Q30): 2 in on floors and
 * Floor props, ½ in on prop panels. Flags (⅛ in) and sublimation (½ in) keep
 * the spec's fixed bleed (`FIXED_BLEED`).
 */
export const POLICY_BLEED: Readonly<Record<"floor" | "prop", Length>> = {
    floor: lengthOf(2, "in"),
    prop: lengthOf(0.5, "in"),
};

/** Shown on a masked cut's template while its outline is pending (Q28). */
export const CUT_PENDING_NOTE =
    "Cut outline pending: the full rectangle is shown until the shape is confirmed.";

/** The owner's template values (2026-10-11). */
export const DEFAULT_TEMPLATE_POLICY: TemplatePolicy = {
    safeArea: (surface) => {
        const inset =
            surface.process === "floor" ? SAFE_AREA.floor : SAFE_AREA.standard;
        return { top: inset, right: inset, bottom: inset, left: inset };
    },
    bleed: (surface) =>
        surface.process === "floor" ? POLICY_BLEED.floor : POLICY_BLEED.prop,
    cutOutline: () => undefined,
};

/** A surface with every value resolved to meters. */
export interface ResolvedTemplate {
    readonly surface: TemplateSurface;
    readonly trimM: { readonly width: number; readonly height: number };
    readonly bleedM: number;
    readonly safeM: Insets<number>;
    /** Present for every cut other than a rectangle whose outline is known. */
    readonly outlineM?: readonly Point[];
    /** Set for a cut other than a rectangle whose outline is still pending. */
    readonly cutPending?: true;
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
    if (!outlineM)
        return {
            surface,
            trimM: { width, height },
            bleedM,
            safeM,
            cutPending: true,
        };
    if (outlineM.length < 3)
        throw new Error(`${surface.id}: cut outline needs three points`);
    for (const [x, y] of outlineM)
        if (x < -EPS || y < -EPS || x > width + EPS || y > height + EPS)
            throw new Error(`${surface.id}: cut outline leaves the trim`);
    return { surface, trimM: { width, height }, bleedM, safeM, outlineM };
}
