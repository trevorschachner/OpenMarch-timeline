/**
 * Artwork template surfaces (docs/3d/props-spec.md §3 "Artwork size and
 * templates", ADR 0002 D-16): what each surface kind expects, so people can
 * author Artwork that fits. Every size comes from the size catalog
 * (`../sizes`) or the median v4u body (`./uniformPanels`); nothing here
 * restates a catalog size.
 *
 * A surface carries only what the spec fixes: its size, minimum and
 * recommended DPI, print process, the bleed the spec gives (⅛ in for flags,
 * ½ in for sublimation), its cut family and its orientation. The safe area,
 * the bleed of floors and props, and the outline of arc, teardrop and swing
 * cuts aren't fixed yet; they come from a `TemplatePolicy` (./policy).
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words teardrop
import {
    catalogDims,
    catalogEntries,
    type CatalogEntryOf,
} from "../sizes/catalog";
import { lengthOf, type Length } from "../sizes/units";
import {
    MEDIAN_V4U_PANELS,
    type UniformArtworkPart,
    type UniformPanel,
    type UniformSide,
} from "./uniformPanels";

export type TemplateSurfaceKind =
    | "silk"
    | "baseFloor"
    | "floorProp"
    | "propTop"
    | "propFront"
    | "propBack"
    | "uniformFront"
    | "uniformBack";

/** How the surface is printed, which sets its bleed. */
export type PrintProcess = "flag" | "sublimation" | "floor" | "prop";

/** The shape of a silk Cut. Only rectangles need no shape mask. */
export type CutFamily = "rectangle" | "arc" | "teardrop" | "swing";

/**
 * Which edge the orientation marker names: the pole (header) side of a silk,
 * the audience side of a floor, the front edge of a prop top, or up on a
 * standing surface.
 */
export type TemplateOrientation =
    | "poleLeft"
    | "audienceBottom"
    | "frontBottom"
    | "upTop";

export interface DpiGuide {
    readonly minimum: number;
    readonly recommended: number;
}

/** Print readiness at 1:1 (props-spec §3 "Fit", D-16). */
export const DPI_GUIDE: Readonly<Record<"standard" | "floor", DpiGuide>> = {
    standard: { minimum: 150, recommended: 300 },
    floor: { minimum: 30, recommended: 60 },
};

/** The bleed the spec fixes: ⅛ in for flags, ½ in for sublimation. */
export const FIXED_BLEED: Readonly<Partial<Record<PrintProcess, Length>>> = {
    flag: lengthOf(0.125, "in"),
    sublimation: lengthOf(0.5, "in"),
};

export interface TemplateSurface {
    /** Also the downloaded file's stem. */
    readonly id: string;
    readonly kind: TemplateSurfaceKind;
    readonly name: string;
    /** Trim width, left to right on the template. */
    readonly width: Length;
    /** Trim height, top to bottom on the template. */
    readonly height: Length;
    /** The unit downloads are drawn in: the size's own unit system. */
    readonly unit: "in" | "mm";
    readonly dpi: DpiGuide;
    readonly process: PrintProcess;
    readonly cut: CutFamily;
    /** A silk sleeve shorter than the header, where the catalog gives one. */
    readonly sleeve?: Length;
    readonly orientation: TemplateOrientation;
    readonly notes: readonly string[];
    /** The size catalog entry the size comes from, if any. */
    readonly catalogId?: string;
}

// ---------------------------------------------------------------- silks

const MIRROR_NOTE =
    "A single-sided print shows the mirror image on the back of the silk.";
const CUT_NOTE =
    "Content outside the cut is clipped in 3D and flagged as outside the cut.";

/** The cut family a catalog Cut belongs to, from its name. */
export function cutFamilyOf(entry: CatalogEntryOf<"silk">): CutFamily {
    const id = entry.id;
    if (id.includes("teardrop")) return "teardrop";
    if (id.includes("swing")) return "swing";
    if (id.includes("arc")) return "arc";
    return "rectangle";
}

/**
 * A silk Cut's template. Silks are written header × fly; the template lies
 * with the header (the pole side) on the left, so it is fly wide and header
 * tall.
 */
export function silkSurface(entry: CatalogEntryOf<"silk">): TemplateSurface {
    const dims = catalogDims(entry);
    const cut = cutFamilyOf(entry);
    return {
        id: entry.id,
        kind: "silk",
        name: `Silk Cut: ${entry.name}`,
        width: dims.fly,
        height: dims.header,
        unit: "in",
        dpi: DPI_GUIDE.standard,
        process: "flag",
        cut,
        ...(dims.sleeve ? { sleeve: dims.sleeve } : {}),
        orientation: "poleLeft",
        notes: cut === "rectangle" ? [MIRROR_NOTE] : [MIRROR_NOTE, CUT_NOTE],
        catalogId: entry.id,
    };
}

// ---------------------------------------------------------------- floors

/** A Base floor template, audience side at the bottom. */
export function baseFloorSurface(
    entry: CatalogEntryOf<"floor">,
): TemplateSurface {
    const dims = catalogDims(entry);
    return {
        id: `base-${entry.id}`,
        kind: "baseFloor",
        name: `Base floor, ${entry.name}`,
        width: dims.width,
        height: dims.depth,
        unit: "in",
        dpi: DPI_GUIDE.floor,
        process: "floor",
        cut: "rectangle",
        orientation: "audienceBottom",
        notes: [],
        catalogId: entry.id,
    };
}

/**
 * A Floor prop template for any size (Floor props have no catalog size).
 * Its DPI guide is the floors' (printed and seen like a floor).
 */
export function floorPropSurface(
    width: Length,
    depth: Length,
    id = "floor-prop",
): TemplateSurface {
    return {
        id,
        kind: "floorProp",
        name: "Floor prop",
        width,
        height: depth,
        unit: unitOf(width, depth),
        dpi: DPI_GUIDE.floor,
        process: "floor",
        cut: "rectangle",
        orientation: "audienceBottom",
        notes: [],
    };
}

// ---------------------------------------------------------------- props

export type PropFace = "top" | "front" | "back";

const PROP_KIND: Readonly<Record<PropFace, TemplateSurfaceKind>> = {
    top: "propTop",
    front: "propFront",
    back: "propBack",
};

/**
 * A prop face for any size. `top` is width × depth with the front edge at the
 * bottom; `front` and `back` are width × height, up at the top.
 */
export function propSurface(
    face: PropFace,
    width: Length,
    heightOrDepth: Length,
    id = `prop-${face}`,
): TemplateSurface {
    return {
        id,
        kind: PROP_KIND[face],
        name: `Prop ${face}`,
        width,
        height: heightOrDepth,
        unit: unitOf(width, heightOrDepth),
        dpi: DPI_GUIDE.standard,
        process: "prop",
        cut: "rectangle",
        orientation: face === "top" ? "frontBottom" : "upTop",
        notes: [],
    };
}

/** Front and back templates for a catalog flat prop (a sheet has no top). */
export function flatPropSurfaces(
    entry: CatalogEntryOf<"flatProp">,
): TemplateSurface[] {
    const dims = catalogDims(entry);
    return (["front", "back"] as const).map((face) => ({
        ...propSurface(face, dims.width, dims.height, `${entry.id}-${face}`),
        name: `${entry.name}, ${face}`,
        catalogId: entry.id,
    }));
}

// ---------------------------------------------------------------- uniforms

const PART_NAME: Readonly<Record<UniformArtworkPart, string>> = {
    top: "Top",
    bottoms: "Bottoms",
    overlay: "Overlay (cape)",
};

export const UNIFORM_WRAP_NOTE =
    "Art wraps poorly onto the sides and sleeves; keep it on the front or back panel.";
const UNIFORM_SIZE_NOTE =
    "Sized as worn by the median body; other body types are graded proportionally.";

export function uniformSurface(panel: UniformPanel): TemplateSurface {
    return {
        id: `uniform-${panel.part}-${panel.side}`,
        kind: panel.side === "front" ? "uniformFront" : "uniformBack",
        name: `${PART_NAME[panel.part]}, ${panel.side}`,
        width: panel.width,
        height: panel.height,
        unit: "mm",
        dpi: DPI_GUIDE.standard,
        process: "sublimation",
        cut: "rectangle",
        orientation: "upTop",
        notes: [UNIFORM_SIZE_NOTE, UNIFORM_WRAP_NOTE],
    };
}

export function uniformPanelSurface(
    part: UniformArtworkPart,
    side: UniformSide,
): TemplateSurface | undefined {
    const panel = MEDIAN_V4U_PANELS.find(
        (p) => p.part === part && p.side === side,
    );
    return panel ? uniformSurface(panel) : undefined;
}

// ---------------------------------------------------------------- all

/**
 * Every template with a fixed size: each silk Cut, each catalog floor as a
 * Base floor, each catalog flat prop's front and back, and each uniform
 * part's panels. Floor props and other props have no catalog size: make
 * those with `floorPropSurface` and `propSurface`.
 */
export const TEMPLATE_SURFACES: readonly TemplateSurface[] = [
    ...catalogEntries("silk").map(silkSurface),
    ...catalogEntries("floor").map(baseFloorSurface),
    ...catalogEntries("flatProp").flatMap(flatPropSurfaces),
    ...MEDIAN_V4U_PANELS.map(uniformSurface),
];

export function templateSurface(id: string): TemplateSurface | undefined {
    return TEMPLATE_SURFACES.find((s) => s.id === id);
}

/** Inches when both sizes were typed in feet or inches, else millimeters. */
function unitOf(a: Length, b: Length): "in" | "mm" {
    return a.typed !== undefined && b.typed !== undefined ? "in" : "mm";
}
