/**
 * Props drawn as imported 3D models (ADR 0010 D-12 and D-13).
 *
 * A model is embedded in the show as a Library item Version: its two parts, the normalized GLB
 * and the sidecar, in `library_blobs` (deduped by sha256), and one `library_items` row naming
 * them. A prop points at a Version with `items.library_item_id` and `library_version_hash`.
 *
 * Embedding has no history (the Library tables have no triggers), so undoing "set model" puts the
 * prop back and leaves the bytes; they are unused until a later prune. Pointing the prop at the
 * model and sizing its Outline to the model are one undo step.
 */
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import {
    ModelSidecarSchema,
    type ModelSidecar,
} from "@om-electron/main/model-import/types";
import { schema } from "@/global/database/db";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { createItemsInTransaction } from "./items";

/** The part roles of a model Version, as the parked Library named them. */
export const MODEL_PART_GLB = "glb";
export const MODEL_PART_SIDECAR = "sidecar";

const VERSION_HASH_PREFIX = "openmarch-library-version/1\n";

/** sha256 of some bytes, as lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        bytes as Uint8Array<ArrayBuffer>,
    );
    return [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

/**
 * The hash that names a Version: sha256 over a listing of its parts' hashes sorted by role, the
 * way the parked Library computed it, so a show and a future local Library agree on a Version.
 */
export async function versionHashOf(
    partHashes: Readonly<Record<string, string>>,
): Promise<string> {
    const roles = Object.keys(partHashes).sort();
    if (roles.length === 0)
        throw new Error("A Version needs at least one part");
    let listing = VERSION_HASH_PREFIX;
    for (const role of roles) listing += `${role} ${partHashes[role]}\n`;
    return sha256Hex(new TextEncoder().encode(listing));
}

/** A model the import made, ready to embed. */
export interface ImportedModel {
    /** The normalized GLB */
    glb: Uint8Array;
    /** The sidecar as stored: canonical JSON, UTF-8 */
    sidecar: Uint8Array;
    /** The picked file's name, such as `riser.glb` */
    filename: string;
}

/** An embedded model Version, as a prop names it. */
export interface ModelRef {
    itemId: string;
    versionHash: string;
}

const nameFromFilename = (filename: string) =>
    filename.replace(/\.(glb|gltf)$/i, "") || filename;

/**
 * Embeds a model in the show, unless the same Version is there already (re-importing the same
 * file reuses it). A new model gets a new Library item id, or the Starter kit's stamp when the
 * file has one.
 */
export async function embedModelInTransaction({
    tx,
    model,
}: {
    tx: DbTransaction;
    model: ImportedModel;
}): Promise<ModelRef & { sidecar: ModelSidecar }> {
    const sidecarText = new TextDecoder("utf-8", { fatal: true }).decode(
        model.sidecar,
    );
    const sidecar = ModelSidecarSchema.parse(JSON.parse(sidecarText));
    const parts = {
        [MODEL_PART_GLB]: await sha256Hex(model.glb),
        [MODEL_PART_SIDECAR]: await sha256Hex(model.sidecar),
    };
    const versionHash = await versionHashOf(parts);

    const existing = await tx
        .select({ item_id: schema.library_items.item_id })
        .from(schema.library_items)
        .where(
            and(
                eq(schema.library_items.version_hash, versionHash),
                eq(schema.library_items.kind, "model"),
            ),
        )
        .get();
    if (existing) return { itemId: existing.item_id, versionHash, sidecar };

    const itemId = sidecar.stamp.itemId ?? crypto.randomUUID();
    const bytes: Record<string, Uint8Array> = {
        [MODEL_PART_GLB]: model.glb,
        [MODEL_PART_SIDECAR]: model.sidecar,
    };
    for (const [role, hash] of Object.entries(parts))
        await tx
            .insert(schema.library_blobs)
            .values({ hash, data: bytes[role]! })
            .onConflictDoNothing()
            .run();
    const now = new Date().toISOString();
    await tx
        .insert(schema.library_items)
        .values({
            item_id: itemId,
            version_hash: versionHash,
            kind: "model",
            name: nameFromFilename(model.filename),
            parts: JSON.stringify(parts),
            // The parked Library's metadata shape, so the full Library can read it later
            metadata: JSON.stringify({
                tags: [],
                createdAt: now,
                updatedAt: now,
                originalFilename: model.filename,
                derivedFrom: null,
                license: "LicenseRef-Unknown",
                licenseText: null,
                author: null,
                sourceUrl: null,
                attribution: null,
                modified: false,
            }),
            sidecar: sidecarText,
        })
        .run();
    return { itemId, versionHash, sidecar };
}

/**
 * Points a prop at a model (embedding it) and sizes every Outline change of the prop to the
 * model's footprint and height, or with `model` null goes back to the plain block, keeping its
 * Outline.
 */
export async function setPropModelInTransaction({
    tx,
    itemId,
    model,
}: {
    tx: DbTransaction;
    itemId: number;
    model: ImportedModel | null;
}): Promise<ModelRef | null> {
    const item = await tx
        .select({ kind: schema.items.kind })
        .from(schema.items)
        .where(eq(schema.items.id, itemId))
        .get();
    if (!item) throw new Error(`No item with id ${itemId}`);
    if (item.kind !== "prop") throw new Error("Only props have a model");

    if (!model) {
        await tx
            .update(schema.items)
            .set({ library_item_id: null, library_version_hash: null })
            .where(eq(schema.items.id, itemId))
            .run();
        return null;
    }

    const ref = await embedModelInTransaction({ tx, model });
    await tx
        .update(schema.items)
        .set({
            library_item_id: ref.itemId,
            library_version_hash: ref.versionHash,
        })
        .where(eq(schema.items.id, itemId))
        .run();
    const [width, height, depth] = ref.sidecar.bounds.size;
    await tx
        .update(schema.item_geometry)
        .set({
            outline_type: "rectangle",
            custom_outline: null,
            // An Outline can't be 0 across; a flat model still has a footprint
            width: Math.max(width, 0.01),
            depth: Math.max(depth, 0.01),
            height: Math.max(height, 0),
        })
        .where(eq(schema.item_geometry.item_id, itemId))
        .run();
    return { itemId: ref.itemId, versionHash: ref.versionHash };
}

/** `setPropModelInTransaction` as one undo step. */
export async function setPropModel({
    db,
    itemId,
    model,
}: {
    db: DbConnection;
    itemId: number;
    model: ImportedModel | null;
}): Promise<ModelRef | null> {
    return transactionWithHistory(db, "setPropModel", (tx) =>
        setPropModelInTransaction({ tx, itemId, model }),
    );
}

/**
 * A new prop drawn as `model`, as one undo step: named after the model, home at `home`, on field
 * from `beatId`, its Outline the model's size. Returns the new prop's item id.
 */
export async function createPropWithModel({
    db,
    home,
    beatId,
    model,
}: {
    db: DbConnection;
    home: [number, number];
    beatId: number;
    model: ImportedModel;
}): Promise<number> {
    return transactionWithHistory(db, "createPropWithModel", async (tx) => {
        const [item] = await createItemsInTransaction({
            tx,
            newItems: [
                {
                    kind: "prop",
                    name: nameFromFilename(model.filename),
                    home,
                    beatId,
                    // Sized to the model next
                    geometry: { outlineType: "rectangle", width: 1, depth: 1 },
                },
            ],
        });
        await setPropModelInTransaction({ tx, itemId: item.id, model });
        return item.id;
    });
}

/** A model a prop uses, with what the 3D View needs to load and fit it. */
export interface PropModel extends ModelRef {
    name: string;
    /** The model's bounds in its own meters, from its sidecar */
    bounds: ModelSidecar["bounds"];
    /** The `library_blobs` hash of its GLB */
    glbHash: string;
}

/** Every model Version a prop in the show points at. */
export async function getPropModels({
    db,
}: {
    db: DbConnection | DbTransaction;
}): Promise<PropModel[]> {
    const refs = await db
        .selectDistinct({
            itemId: schema.items.library_item_id,
            versionHash: schema.items.library_version_hash,
        })
        .from(schema.items)
        .where(isNotNull(schema.items.library_version_hash))
        .all();
    if (refs.length === 0) return [];
    const rows = await db
        .select()
        .from(schema.library_items)
        .where(
            inArray(
                schema.library_items.version_hash,
                refs.map((r) => r.versionHash!),
            ),
        )
        .all();
    const models: PropModel[] = [];
    for (const row of rows) {
        if (!refs.some((r) => r.itemId === row.item_id)) continue;
        const parts = JSON.parse(row.parts) as Record<string, string>;
        const sidecar = ModelSidecarSchema.safeParse(
            JSON.parse(row.sidecar ?? "null"),
        );
        const glbHash = parts[MODEL_PART_GLB];
        if (!sidecar.success || !glbHash) continue;
        models.push({
            itemId: row.item_id,
            versionHash: row.version_hash,
            name: row.name,
            bounds: sidecar.data.bounds,
            glbHash,
        });
    }
    return models;
}

/** The bytes of one `library_blobs` row, or null when the show doesn't have it. */
export async function getLibraryBlob({
    db,
    hash,
}: {
    db: DbConnection | DbTransaction;
    hash: string;
}): Promise<Uint8Array | null> {
    const row = await db
        .select({ data: schema.library_blobs.data })
        .from(schema.library_blobs)
        .where(eq(schema.library_blobs.hash, hash))
        .get();
    return row ? new Uint8Array(row.data) : null;
}
