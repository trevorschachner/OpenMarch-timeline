/**
 * Artwork sizes and print readiness (docs/3d/props-spec.md §3 "Artwork size
 * and templates" and "Fit", §9 "Display sizes"; ADR 0002 D-16, D-17, D-19).
 *
 * The pure arithmetic both the import pipeline (main) and the import review
 * (renderer) need: display caps per surface kind, native and effective DPI,
 * the fill and fit scales, and the catalog sizes whose aspect matches an
 * image. Pixels never decide a physical size on their own here: every
 * Artwork's width × height comes from a template, trustworthy metadata or the
 * user.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
import { catalogDims, catalogEntries } from "./catalog";
import { METERS_PER_INCH, type Length } from "./units";

/** The surface kinds an Artwork's display texture is sized for. */
export const ARTWORK_SURFACES = [
    "silk",
    "baseFloor",
    "floorProp",
    "propSlot",
    "uniformPart",
] as const;
export type ArtworkSurface = (typeof ARTWORK_SURFACES)[number];

export interface ArtworkSurfaceSpec {
    /**
     * The display texture fits inside `long` × `short` pixels, turned to match
     * the image (props-spec.md §9, ADR 0002 D-17 and D-19). Provisional until
     * the integrated-GPU run.
     */
    readonly displayCap: { readonly long: number; readonly short: number };
    /** Below this effective DPI a slot assignment is "not print-ready". */
    readonly minDpi: number;
    readonly recommendedDpi: number;
}

export const ARTWORK_SURFACE_SPECS: Readonly<
    Record<ArtworkSurface, ArtworkSurfaceSpec>
> = {
    // Silk texture-array layers are 1024 × 1536 at `high`, no 2048 in v1.
    silk: {
        displayCap: { long: 1536, short: 1024 },
        minDpi: 150,
        recommendedDpi: 300,
    },
    // Floors are printed at 1:1, so their DPI floor is 30, recommended 60.
    baseFloor: {
        displayCap: { long: 2048, short: 2048 },
        minDpi: 30,
        recommendedDpi: 60,
    },
    // A Floor prop is a tarp or vinyl laid on the floor: a floor at 1:1.
    floorProp: {
        displayCap: { long: 2048, short: 2048 },
        minDpi: 30,
        recommendedDpi: 60,
    },
    // Prop Artwork slots (top, front, back) and Equipment textures.
    propSlot: {
        displayCap: { long: 1024, short: 1024 },
        minDpi: 150,
        recommendedDpi: 300,
    },
    // Uniform part front/back: 1024 on the long edge like prop slots (owner
    // decision Q34, 2026-10-11); uniforms print at 150 DPI minimum (§3).
    uniformPart: {
        displayCap: { long: 1024, short: 1024 },
        minDpi: 150,
        recommendedDpi: 300,
    },
};

export interface PixelSize {
    readonly width: number;
    readonly height: number;
}

/**
 * The display texture's pixel size for an image of `source` pixels (or, for
 * a vector page, any size with its aspect): as large as fits the surface's
 * cap, turned to match the image. Rasters are never enlarged; vectors are
 * rendered at the cap (`enlarge: true`).
 */
export function displaySize(
    surface: ArtworkSurface,
    source: PixelSize,
    options: { enlarge?: boolean } = {},
): PixelSize {
    const { long, short } = ARTWORK_SURFACE_SPECS[surface].displayCap;
    const landscape = source.width >= source.height;
    const capW = landscape ? long : short;
    const capH = landscape ? short : long;
    let scale = Math.min(capW / source.width, capH / source.height);
    if (!options.enlarge) scale = Math.min(scale, 1);
    return {
        width: Math.min(capW, Math.max(1, Math.round(source.width * scale))),
        height: Math.min(capH, Math.max(1, Math.round(source.height * scale))),
    };
}

/** Pixels per inch of a raster `pixelWidth` wide printed `widthM` wide. */
export function nativeDpi(pixelWidth: number, widthM: number): number {
    return pixelWidth / (widthM / METERS_PER_INCH);
}

/** Vector originals report "vector" instead of a DPI. */
export type Dpi = number | "vector";

export type FitMode = "fill" | "fit";

export interface PhysicalSize {
    readonly widthM: number;
    readonly heightM: number;
}

/**
 * The uniform scale that places an Artwork on a slot (props-spec.md §3
 * "Fit"): `fill` covers the slot and crops, `fit` stays inside and pads.
 * Never non-uniform. Equal aspects give the same scale either way, the
 * "scaled N%" case.
 */
export function fitScale(
    artwork: PhysicalSize,
    slot: PhysicalSize,
    mode: FitMode,
): number {
    const sx = slot.widthM / artwork.widthM;
    const sy = slot.heightM / artwork.heightM;
    return mode === "fill" ? Math.max(sx, sy) : Math.min(sx, sy);
}

/** Effective DPI on a slot: native ÷ scale (after crop). Vectors stay vector. */
export function effectiveDpi(native: Dpi, scale: number): Dpi {
    return native === "vector" ? "vector" : native / scale;
}

export type PrintReadiness =
    /** A vector original prints sharp at any size. */
    | "vector"
    | "recommended"
    /** At or above the minimum, below the recommended DPI. */
    | "minimum"
    /** A warning only, never a block. */
    | "not-print-ready";

export function printReadiness(
    surface: ArtworkSurface,
    dpi: Dpi,
): PrintReadiness {
    if (dpi === "vector") return "vector";
    const spec = ARTWORK_SURFACE_SPECS[surface];
    if (dpi >= spec.recommendedDpi) return "recommended";
    if (dpi >= spec.minDpi) return "minimum";
    return "not-print-ready";
}

/** Default relative tolerance for "same aspect". */
export const ASPECT_TOLERANCE = 0.005;

/** Whether two width ÷ height ratios match within a relative tolerance. */
export function sameAspect(
    a: number,
    b: number,
    tolerance = ASPECT_TOLERANCE,
): boolean {
    return Math.abs(a - b) <= tolerance * Math.max(a, b);
}

/**
 * The tolerance for comparing a raster's pixel aspect with a physical size:
 * rounding to whole pixels can move the aspect by up to a pixel on the short
 * side.
 */
export function pixelAspectTolerance(pixels: PixelSize): number {
    return Math.max(
        ASPECT_TOLERANCE,
        1 / Math.min(pixels.width, pixels.height),
    );
}

export interface AspectSizeChip {
    /** The catalog entry the size comes from. */
    readonly catalogId: string;
    /** Such as "Silk 36 × 54 in" or "Flat prop 4 × 8 ft", in the image's orientation. */
    readonly label: string;
    /** Turned so that width ÷ height matches the image. */
    readonly width: Length;
    readonly height: Length;
}

const CHIP_KINDS = [
    { kind: "silk", label: "Silk", dims: ["header", "fly"] },
    { kind: "floor", label: "Floor", dims: ["width", "depth"] },
    { kind: "flatProp", label: "Flat prop", dims: ["width", "height"] },
] as const;

/** `36 × 54 in` when both sides share a unit, else `4 ft × 30 in`. */
function chipDims(width: Length, height: Length): string {
    const [wv, wu] = (width.typed ?? `${width.m} m`).split(" ");
    const [hv, hu] = (height.typed ?? `${height.m} m`).split(" ");
    return wu === hu ? `${wv} × ${hv} ${hu}` : `${wv} ${wu} × ${hv} ${hu}`;
}

/**
 * Catalog sizes an image of this aspect fits without crop, in either
 * orientation: silk Cuts, floors and flat props. These are the size step's
 * chips ("Silk 36 × 54 in").
 */
export function catalogSizesForAspect(
    aspect: number,
    tolerance = ASPECT_TOLERANCE,
): AspectSizeChip[] {
    const chips: AspectSizeChip[] = [];
    for (const { kind, label, dims } of CHIP_KINDS) {
        for (const entry of catalogEntries(kind)) {
            const d = catalogDims(entry) as unknown as Record<string, Length>;
            const a = d[dims[0]];
            const b = d[dims[1]];
            let size: [Length, Length] | null = null;
            if (sameAspect(a.m / b.m, aspect, tolerance)) size = [a, b];
            else if (sameAspect(b.m / a.m, aspect, tolerance)) size = [b, a];
            if (!size) continue;
            chips.push({
                catalogId: entry.id,
                label: `${label} ${chipDims(size[0], size[1])}`,
                width: size[0],
                height: size[1],
            });
        }
    }
    return chips;
}
