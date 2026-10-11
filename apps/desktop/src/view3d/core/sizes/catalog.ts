/**
 * The size standards catalog (docs/3d/props-spec.md §3 "Catalog", ADR 0002
 * D-16): the default size for every kind, with custom sizes as the escape
 * hatch. Figures come from `research/size-standards.md` (2026-10-11).
 *
 * Every size is stored in its source unit and converted to meters on read, so
 * a 36 × 54 in silk stays exactly 36 × 54 in. Every entry names its sources.
 * Silks are written header (along the pole) × fly.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`, so it must
 * not import React, React Three Fiber, drei, Electron or the database.
 */
// cspell:words sabre sabres ultralite fjminc demoulin bandshoppe drillcomp styleplus wgi
import { lengthOf, type ImperialUnit, type Length } from "./units";

/** A catalog size in the unit its source gives. */
export interface SourcedLength {
    readonly value: number;
    readonly unit: ImperialUnit;
}

/**
 * How firmly a figure is sourced (research/size-standards.md "How to read
 * this"): read on the vendor's or rule-maker's own page, read from a search
 * engine's copy of a page that refused direct fetches, or general practice.
 */
export type SourceConfidence = "verified" | "snippet" | "unverified";

export interface CatalogSource {
    readonly name: string;
    readonly url?: string;
    readonly confidence: SourceConfidence;
}

export type SizeKind =
    | "pole"
    | "swingPole"
    | "tPole"
    | "silk"
    | "rifle"
    | "sabre"
    | "floor"
    | "flatProp";

/** The dimensions each kind has, in some length type. */
export interface DimsByKind<L> {
    pole: { readonly length: L; readonly diameter: L };
    swingPole: { readonly length: L; readonly diameter: L };
    tPole: { readonly upright: L; readonly crossbars: readonly L[] };
    /** `sleeve` only where the source gives a sleeve shorter than the header. */
    silk: { readonly header: L; readonly fly: L; readonly sleeve?: L };
    rifle: { readonly length: L };
    sabre: { readonly length: L };
    /** The source doesn't say which side faces the audience; WGI checks ignore orientation. */
    floor: { readonly width: L; readonly depth: L };
    flatProp: { readonly width: L; readonly height: L };
}

/** Which flags a silk Cut belongs to: a standard flag pole or a swing pole. */
export type SilkUse = "flag" | "swing";

interface EntryBase<K extends SizeKind> {
    readonly id: string;
    readonly kind: K;
    readonly name: string;
    readonly dims: DimsByKind<SourcedLength>[K];
    readonly sources: readonly [CatalogSource, ...CatalogSource[]];
    /** The kind's default size (for silks, per use). */
    readonly isDefault?: true;
    /** Available only by special order. */
    readonly special?: true;
}

export type CatalogEntry = {
    [K in SizeKind]: K extends "silk"
        ? EntryBase<K> & {
              readonly use: SilkUse;
              /** The pole the source pairs this Cut with. */
              readonly pole?: string;
          }
        : EntryBase<K>;
}[SizeKind];

export type CatalogEntryOf<K extends SizeKind> = Extract<
    CatalogEntry,
    { kind: K }
>;

// ---------------------------------------------------------------- sources

const FJM_POLES: CatalogSource = {
    name: "Fred J. Miller, Flag Poles",
    url: "https://fjminc.com/collections/flag-poles",
    confidence: "verified",
};
const DEMOULIN_POLES: CatalogSource = {
    name: "DeMoulin, Flag Poles",
    url: "https://demoulin.com/collections/flag-poles",
    confidence: "verified",
};
const BAND_SHOPPE_SIZE_CHART: CatalogSource = {
    name: "Band Shoppe, printed-flag size chart",
    url: "https://www.bandshoppe.com/product/print-on-demand-double-sided-battle-letter-flag/",
    confidence: "snippet",
};
const FJM_CUSTOM_FLAGS: CatalogSource = {
    name: "Fred J. Miller, Custom Flag Designs",
    url: "https://fjminc.com/pages/custom-flag-designs",
    confidence: "verified",
};
const DEMOULIN_PERFORMANCE_FLAG: CatalogSource = {
    name: "DeMoulin, In-Stock Performance Flag",
    confidence: "verified",
};
const DEMOULIN_PRINTED_FLAG: CatalogSource = {
    name: "DeMoulin, Design Your Own Digital Print Flag - Standard (36 x 56)",
    confidence: "verified",
};
const BAND_SHOPPE_SWING: CatalogSource = {
    name: "Band Shoppe, Printed Swing Flag",
    url: "https://www.bandshoppe.com/product/printed-color-guard-swing-flag-56317/",
    confidence: "snippet",
};
const DRILLCOMP_SUPER_SWING: CatalogSource = {
    name: "drillcomp, StylePlus Glamour Super Swing",
    url: "https://www.drillcomp.com/product/styleplus-glamour-super-swing-color-guard-flags-6-colors-available/",
    confidence: "verified",
};
const DEMOULIN_SWING_FLAG: CatalogSource = {
    name: "DeMoulin, In-Stock Swing Flag",
    confidence: "verified",
};
const DEMOULIN_GUARD_EQUIPMENT: CatalogSource = {
    name: "DeMoulin, Guard and Dance Equipment",
    url: "https://demoulin.com/collections/guard-dance-equipment",
    confidence: "verified",
};
const BAND_SHOPPE_RIFLES: CatalogSource = {
    name: "Band Shoppe, Rifles",
    url: "https://www.bandshoppe.com/pages/rifles/",
    confidence: "snippet",
};
const BAND_SHOPPE_SAMURAI: CatalogSource = {
    name: "Band Shoppe, DSI Samurai Sabre",
    url: "https://www.bandshoppe.com/product/dsi-samurai-36-color-guard-sabre/",
    confidence: "snippet",
};
/** WGI 2026 Color Guard Contest Rules (§2.1 to §2.6 floors, §4.2 equipment). */
export const WGI_RULES_2026: CatalogSource = {
    name: "WGI Color Guard Contest Rules 2026",
    url: "https://www.wgi.org/wp-content/uploads/2025/09/2026_WGI_ColorGuard_Rules_Sep25.pdf",
    confidence: "verified",
};
const DPG_FLOORS: CatalogSource = {
    name: "DPG, guard floors",
    url: "https://dpgperforms.com/?p=1275",
    confidence: "snippet",
};
const SHEET_GOODS: CatalogSource = {
    name: "General practice: 4 x 8 ft sheet goods",
    confidence: "unverified",
};

// ---------------------------------------------------------------- entries

const inch = (value: number): SourcedLength => ({ value, unit: "in" });
const feet = (value: number): SourcedLength => ({ value, unit: "ft" });

const POLE_SOURCES = [FJM_POLES, DEMOULIN_POLES] as const;

const poles: CatalogEntryOf<"pole">[] = [5, 5.5, 6, 6.5, 7, 8].map(
    (lengthFt) => ({
        id: `pole-${lengthFt}ft`,
        kind: "pole",
        name: `${lengthFt} ft pole`,
        dims: { length: feet(lengthFt), diameter: inch(1) },
        sources: POLE_SOURCES,
        ...(lengthFt === 6 ? { isDefault: true as const } : {}),
        ...(lengthFt === 8 ? { special: true as const } : {}),
    }),
);

const swingPoles: CatalogEntryOf<"swingPole">[] = [24, 30, 36, 42, 48, 52].map(
    (lengthIn) => ({
        id: `swing-pole-${lengthIn}in`,
        kind: "swingPole",
        name: `${lengthIn} in swing pole`,
        dims: { length: inch(lengthIn), diameter: inch(0.5) },
        sources: POLE_SOURCES,
        ...(lengthIn === 36 ? { isDefault: true as const } : {}),
    }),
);

const DEMOULIN_T_POLES: CatalogSource = {
    name: "DeMoulin, Single, Two and Three Tier T-Pole",
    url: "https://demoulin.com/collections/flag-poles",
    confidence: "verified",
};

const tPoles: CatalogEntryOf<"tPole">[] = [
    ...[30, 36, 42, 48].map(
        (crossbar): CatalogEntryOf<"tPole"> => ({
            id: `t-pole-1-tier-${crossbar}in`,
            kind: "tPole",
            name: `Single tier T-pole, ${crossbar} in crossbar`,
            dims: { upright: inch(48), crossbars: [inch(crossbar)] },
            sources: [DEMOULIN_T_POLES],
        }),
    ),
    {
        id: "t-pole-2-tier",
        kind: "tPole",
        name: "Two tier T-pole",
        dims: { upright: inch(68), crossbars: [inch(30), inch(36)] },
        sources: [DEMOULIN_T_POLES],
    },
    {
        id: "t-pole-3-tier",
        kind: "tPole",
        name: "Three tier T-pole",
        dims: {
            upright: inch(84),
            crossbars: [inch(30), inch(36), inch(42)],
        },
        sources: [DEMOULIN_T_POLES],
    },
];

function silk(
    id: string,
    name: string,
    header: number,
    fly: number,
    use: SilkUse,
    sources: CatalogEntryOf<"silk">["sources"],
    extra: Partial<Pick<CatalogEntryOf<"silk">, "pole" | "isDefault">> & {
        sleeve?: number;
    } = {},
): CatalogEntryOf<"silk"> {
    const { sleeve, ...rest } = extra;
    return {
        id,
        kind: "silk",
        name,
        use,
        dims: {
            header: inch(header),
            fly: inch(fly),
            ...(sleeve === undefined ? {} : { sleeve: inch(sleeve) }),
        },
        sources,
        ...rest,
    };
}

const silks: CatalogEntryOf<"silk">[] = [
    silk(
        "silk-5ft-30x46",
        "5 ft pole silk",
        30,
        46,
        "flag",
        [BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-5ft" },
    ),
    silk(
        "silk-5.5ft-33x50",
        "5.5 ft pole silk",
        33,
        50,
        "flag",
        [BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-5.5ft" },
    ),
    silk(
        "silk-6ft-36x54",
        "6 ft pole silk",
        36,
        54,
        "flag",
        [DEMOULIN_PERFORMANCE_FLAG, BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-6ft", isDefault: true },
    ),
    silk(
        "silk-7ft-42x60",
        "7 ft pole silk",
        42,
        60,
        "flag",
        [BAND_SHOPPE_SIZE_CHART],
        { pole: "pole-7ft" },
    ),
    silk("silk-standard-36x56", "Standard", 36, 56, "flag", [
        FJM_CUSTOM_FLAGS,
        DEMOULIN_PRINTED_FLAG,
    ]),
    silk("silk-oversized-42x67", "Oversized", 42, 67, "flag", [
        FJM_CUSTOM_FLAGS,
    ]),
    silk("silk-teardrop-44x74", "Teardrop", 44, 74, "flag", [FJM_CUSTOM_FLAGS]),
    silk("silk-swing-44x66", "Swing", 44, 66, "swing", [BAND_SHOPPE_SWING], {
        isDefault: true,
    }),
    silk("silk-super-swing-44x84", "Curved or super swing", 44, 84, "swing", [
        FJM_CUSTOM_FLAGS,
        DRILLCOMP_SUPER_SWING,
    ]),
    silk(
        "silk-oversized-swing-56x84",
        "Oversized swing",
        56,
        84,
        "swing",
        [DEMOULIN_SWING_FLAG],
        { sleeve: 42 },
    ),
    silk("silk-arc-45x96", "Regular arc", 45, 96, "flag", [FJM_CUSTOM_FLAGS]),
    silk("silk-narrow-arc-44x94", "Narrow arc", 44, 94, "flag", [
        FJM_CUSTOM_FLAGS,
    ]),
    silk("silk-super-arc-54x100", "Super arc", 54, 100, "flag", [
        FJM_CUSTOM_FLAGS,
    ]),
];

const rifles: CatalogEntryOf<"rifle">[] = [36, 37.5, 39].map((lengthIn) => ({
    id: `rifle-${lengthIn}in`,
    kind: "rifle",
    name: `${lengthIn} in rifle`,
    dims: { length: inch(lengthIn) },
    sources:
        lengthIn === 37.5
            ? [BAND_SHOPPE_RIFLES]
            : [DEMOULIN_GUARD_EQUIPMENT, BAND_SHOPPE_RIFLES],
    ...(lengthIn === 36 ? { isDefault: true as const } : {}),
}));

const sabres: CatalogEntryOf<"sabre">[] = [32, 36, 39].map((lengthIn) => ({
    id: `sabre-${lengthIn}in`,
    kind: "sabre",
    name: `${lengthIn} in sabre`,
    dims: { length: inch(lengthIn) },
    sources:
        lengthIn === 32
            ? [BAND_SHOPPE_SAMURAI]
            : [DEMOULIN_GUARD_EQUIPMENT, BAND_SHOPPE_SAMURAI],
    ...(lengthIn === 36 ? { isDefault: true as const } : {}),
}));

const floors: CatalogEntryOf<"floor">[] = [
    {
        id: "floor-wgi-minimum-60x90ft",
        kind: "floor",
        name: "WGI competition area, minimum",
        dims: { width: feet(90), depth: feet(60) },
        sources: [WGI_RULES_2026, DPG_FLOORS],
        isDefault: true,
    },
    {
        id: "floor-wgi-maximum-78x106ft",
        kind: "floor",
        name: "WGI competition area, maximum",
        dims: { width: feet(106), depth: feet(78) },
        sources: [WGI_RULES_2026],
    },
];

const flatProps: CatalogEntryOf<"flatProp">[] = [
    {
        id: "flat-prop-4x8ft",
        kind: "flatProp",
        name: "4 x 8 ft sheet",
        dims: { width: feet(4), height: feet(8) },
        sources: [SHEET_GOODS],
        isDefault: true,
    },
];

export const SIZE_CATALOG: readonly CatalogEntry[] = [
    ...poles,
    ...swingPoles,
    ...tPoles,
    ...silks,
    ...rifles,
    ...sabres,
    ...floors,
    ...flatProps,
];

// ---------------------------------------------------------------- lookups

export function catalogEntries<K extends SizeKind>(
    kind: K,
): CatalogEntryOf<K>[] {
    return SIZE_CATALOG.filter(
        (entry): entry is CatalogEntryOf<K> => entry.kind === kind,
    );
}

export function catalogEntry(id: string): CatalogEntry | undefined {
    return SIZE_CATALOG.find((entry) => entry.id === id);
}

/**
 * The kind's default size: a 6 ft pole, 36 in swing pole, 36 × 54 in silk
 * (44 × 66 in for `use: "swing"`), 36 in rifle and sabre, 60 × 90 ft floor,
 * 4 × 8 ft flat prop. T-poles have none.
 */
export function defaultCatalogEntry<K extends SizeKind>(
    kind: K,
    use: SilkUse = "flag",
): CatalogEntryOf<K> | undefined {
    return catalogEntries(kind).find((entry) => {
        const e: CatalogEntry = entry;
        return e.isDefault === true && (e.kind !== "silk" || e.use === use);
    });
}

/** A catalog size as a stored length: exact meters, re-displaying as its source text. */
export function lengthFromSource(source: SourcedLength): Length {
    return lengthOf(source.value, source.unit);
}

/** An entry's dimensions as stored lengths. */
export function catalogDims<K extends SizeKind>(
    entry: CatalogEntryOf<K>,
): DimsByKind<Length>[K] {
    const out: Record<string, Length | readonly Length[]> = {};
    for (const [key, value] of Object.entries(entry.dims) as [
        string,
        SourcedLength | readonly SourcedLength[],
    ][]) {
        out[key] = Array.isArray(value)
            ? value.map(lengthFromSource)
            : lengthFromSource(value as SourcedLength);
    }
    return out as unknown as DimsByKind<Length>[K];
}
