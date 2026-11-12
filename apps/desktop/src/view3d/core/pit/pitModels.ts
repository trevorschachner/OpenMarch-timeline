/**
 * The front ensemble's built-in models in the 3D View (docs/3d/instruments.md §6): which asset
 * an item's `items.model` names, which models are podiums and how high a drum major stands on
 * one, and where a model instance goes.
 *
 * - A model id is `pit/<name>`, `<name>` a key of `assets/pit/manifest.json`; the detailed file
 *   is `<name>.glb` and the distant one `<name>-low.glb`. Anything else draws as a block.
 * - Models are in meters, +Y up, origin on the ground at the middle of the footprint, +Z toward
 *   the audience and +X the player's left. They draw at real size: the item's Outline gives the
 *   position and the turn, not the size.
 * - A podium (an id naming a podium, tower, scaffold or stepladder) is stood on: its standing
 *   height is the manifest's `standTopM`, else the detailed model's height, and whoever stands
 *   on it faces the band across the field.
 *
 * Plain TypeScript only: this module lives under `view3d/core/`.
 */
import type { Detail } from "@/view3d/core/instruments/model";
import manifestJson from "@/view3d/assets/pit/manifest.json";

/** One model's size in meters. */
interface PitSize {
    width: number;
    depth: number;
    height: number;
}

/** What the 3D View reads of a model's manifest entry. */
export interface PitManifestEntry {
    high: { sizeM: PitSize };
    low: { sizeM: PitSize };
    /** A podium's standing height (m), where the drum major's feet go */
    standTopM?: number;
}

export type PitManifest = Readonly<Record<string, PitManifestEntry>>;

/** The shipped manifest, keyed by model name. */
export const PIT_MANIFEST: PitManifest = manifestJson as PitManifest;

/** Built-in pit model ids start with this. */
export const PIT_MODEL_PREFIX = "pit/";

/**
 * The asset name an item's model id names, such as `marimba-5.0` for `pit/marimba-5.0`, or null
 * when it names no model the manifest lists (none, another library, or one this app doesn't
 * ship): such an item draws as a block.
 */
export function pitModelName(
    modelId: string | null | undefined,
    manifest: PitManifest = PIT_MANIFEST,
): string | null {
    if (!modelId?.startsWith(PIT_MODEL_PREFIX)) return null;
    const name = modelId.slice(PIT_MODEL_PREFIX.length);
    return Object.hasOwn(manifest, name) ? name : null;
}

/** The file of a model's detailed or distant version. */
export const pitAssetFile = (name: string, detail: Detail): string =>
    detail === "high" ? `${name}.glb` : `${name}-low.glb`;

const PODIUM_WORDS = /podium|tower|scaffold|stepladder/;

/** Whether a model id is a podium: one a performer stands on. */
export const isPodiumModel = (modelId: string | null | undefined): boolean =>
    !!modelId?.startsWith(PIT_MODEL_PREFIX) &&
    PODIUM_WORDS.test(modelId.slice(PIT_MODEL_PREFIX.length));

/**
 * How high a performer stands on a podium model (m): its `standTopM`, else the detailed
 * model's height. Null for a model that isn't a podium or isn't listed.
 */
export function podiumStandTop(
    modelId: string | null | undefined,
    manifest: PitManifest = PIT_MANIFEST,
): number | null {
    if (!isPodiumModel(modelId)) return null;
    const name = pitModelName(modelId, manifest);
    if (name === null) return null;
    const entry = manifest[name];
    return entry.standTopM ?? entry.high.sizeM.height;
}

/**
 * The items drawn as models, by marchers row, with their model's name: those whose model id
 * names a listed model that hasn't failed to load (`failed`, by name). Every other item draws as
 * a block.
 */
export function modelsByMarcher(
    items: readonly { marcher_id: number; model: string | null }[],
    failed: ReadonlySet<string>,
    manifest: PitManifest = PIT_MANIFEST,
): Map<number, string> {
    const out = new Map<number, string>();
    for (const item of items) {
        const name = pitModelName(item.model, manifest);
        if (name !== null && !failed.has(name)) out.set(item.marcher_id, name);
    }
    return out;
}

/** Whether a podium centered at `z` stands in front of the field: on the audience side of its center line. */
export const isFrontPodium = (z: number, fieldCenterZ: number): boolean =>
    z > fieldCenterZ;

/**
 * The heading (radians about +Y, 0 facing +Z) of a performer standing on a podium centered at
 * `z`: across the field toward the band (docs/3d/instruments.md §6), straight, whatever the
 * drill's facing. A podium in front of the field faces the back sideline (-Z); one behind it
 * faces the audience.
 */
export const podiumHeading = (z: number, fieldCenterZ: number): number =>
    isFrontPodium(z, fieldCenterZ) ? Math.PI : 0;

/** What {@link hidesVenuePodium} reads of an item. */
interface ItemModel {
    id: number;
    model: string | null;
}

/**
 * Whether the venue's own podium (`hs`, `bighs`) hides: the show has a podium item the 3D View
 * draws, one not hidden on the field (`hidden`, by item id).
 */
export function hidesVenuePodium(
    items: readonly ItemModel[],
    hidden: ReadonlySet<number>,
    manifest: PitManifest = PIT_MANIFEST,
): boolean {
    return items.some(
        (item) =>
            !hidden.has(item.id) &&
            podiumStandTop(item.model, manifest) !== null,
    );
}

/** Closer than this (m) a model switches to its detailed version... */
export const PIT_NEAR_M = 30;
/** ...and farther than this it switches back to its distant one. */
export const PIT_FAR_M = 38;

/**
 * Whether a model at (`x`, `z`) draws in detail, from its distance to the camera at about
 * keyboard height and whether it did last frame (`was`): the gap between {@link PIT_NEAR_M} and
 * {@link PIT_FAR_M} keeps one at the edge from flickering, as instruments do (`hornSet.ts`).
 */
export function isNearPitItem(
    x: number,
    z: number,
    camera: readonly [number, number, number],
    was: boolean | undefined,
): boolean {
    const d = Math.hypot(x - camera[0], camera[1] - 1, z - camera[2]);
    if (was === undefined) return d < (PIT_NEAR_M + PIT_FAR_M) / 2;
    return was ? d < PIT_FAR_M : d < PIT_NEAR_M;
}

/**
 * Writes a model instance's matrix (column-major, as three stores it): real size, turned by the
 * item's 2D turn (degrees, clockwise on screen, so +X turns toward +Z) and standing at `center`
 * on `baseY`.
 */
export function writePitModelMatrix(
    out: Float32Array,
    index: number,
    rotationDeg: number,
    center: { x: number; z: number },
    baseY: number,
): void {
    const radians = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const o = index * 16;
    out[o] = cos;
    out[o + 1] = 0;
    out[o + 2] = sin;
    out[o + 3] = 0;
    out[o + 4] = 0;
    out[o + 5] = 1;
    out[o + 6] = 0;
    out[o + 7] = 0;
    out[o + 8] = -sin;
    out[o + 9] = 0;
    out[o + 10] = cos;
    out[o + 11] = 0;
    out[o + 12] = center.x;
    out[o + 13] = baseY;
    out[o + 14] = center.z;
    out[o + 15] = 1;
}
