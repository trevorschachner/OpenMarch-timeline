// cspell:words nglb
import { describe, expect } from "vitest";
import { count, eq } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import { MODEL_SIDECAR_FORMAT } from "@om-electron/main/model-import/types";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { getTestWithHistory } from "@/test/history";
import { performUndo } from "../history";
import { createItems, getItemGeometry, getItems } from "../items";
import {
    getLibraryBlob,
    getPropModels,
    setPropModel,
    versionHashOf,
    type ImportedModel,
} from "../propModels";

const firstBeatId = async (db: DbConnection) =>
    (await db
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(schema.beats.position)
        .get())!.id;

const makeRiser = async (db: DbConnection) => {
    const [item] = await createItems({
        db,
        newItems: [
            {
                kind: "prop",
                name: "Riser",
                surfaceType: "platform",
                home: [120, 80],
                beatId: await firstBeatId(db),
                geometry: {
                    outlineType: "circle",
                    width: 1,
                    depth: 1,
                    height: 0.2,
                },
            },
        ],
    });
    return item;
};

/** A model as the import makes it: GLB bytes (any, here) and a valid sidecar. */
const model = (
    size: [number, number, number],
    glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2]),
): ImportedModel => {
    const [x, y, z] = size;
    const sidecar = {
        format: MODEL_SIDECAR_FORMAT,
        pipelineVersion: 1,
        kind: "prop",
        bounds: { min: [-x / 2, 0, -z / 2], max: [x / 2, y, z / 2], size },
        triangles: 12,
        drawCalls: 1,
        grips: { right: null, left: null },
        attachPoints: {},
        artworkSlots: [],
        stretch: null,
        stamp: { itemId: null, kind: "prop", kitVersion: null },
        garment: null,
        metadata: { generator: null, copyright: null },
        importNotes: {
            needsChoice: [],
            fixedForYou: [],
            notes: [],
            badges: [],
        },
    };
    return {
        glb,
        sidecar: new TextEncoder().encode(JSON.stringify(sidecar)),
        filename: "riser.glb",
    };
};

const rows = async (db: DbConnection, table: SQLiteTable) =>
    (await db.select({ c: count() }).from(table).get())?.c;

describeDbTests("propModels", (it) => {
    const testWithHistory = getTestWithHistory(it, [
        schema.items,
        schema.item_geometry,
    ]);

    describe("setPropModel", () => {
        testWithHistory(
            "points the prop at the model and sizes its Outline to it, as one undo step",
            async ({ db }) => {
                const item = await makeRiser(db);
                const ref = await setPropModel({
                    db,
                    itemId: item.id,
                    model: model([2.44, 0.41, 1.22]),
                });

                const [after] = await getItems({ db });
                expect(after).toMatchObject({
                    library_item_id: ref!.itemId,
                    library_version_hash: ref!.versionHash,
                });
                expect(await getItemGeometry({ db })).toMatchObject([
                    {
                        outline_type: "rectangle",
                        custom_outline: null,
                        width: 2.44,
                        depth: 1.22,
                        height: 0.41,
                    },
                ]);
                const [stored] = await getPropModels({ db });
                expect(stored).toMatchObject({
                    itemId: ref!.itemId,
                    name: "riser",
                    bounds: { size: [2.44, 0.41, 1.22] },
                });
                expect(
                    await getLibraryBlob({ db, hash: stored.glbHash }),
                ).toEqual(model([2.44, 0.41, 1.22]).glb);

                await performUndo(db);
                const [undone] = await getItems({ db });
                expect(undone.library_item_id).toBeNull();
                expect(await getItemGeometry({ db })).toMatchObject([
                    { outline_type: "circle", width: 1, depth: 1, height: 0.2 },
                ]);
                // The bytes stay: embedding is not an edit
                expect(await rows(db, schema.library_blobs)).toBe(2);
            },
        );

        testWithHistory(
            "embeds the same model once, for any number of props",
            async ({ db }) => {
                const a = await makeRiser(db);
                const b = await makeRiser(db);
                const first = await setPropModel({
                    db,
                    itemId: a.id,
                    model: model([1, 1, 1]),
                });
                const second = await setPropModel({
                    db,
                    itemId: b.id,
                    model: model([1, 1, 1]),
                });
                expect(second).toEqual(first);
                expect(await rows(db, schema.library_blobs)).toBe(2);
                expect(await rows(db, schema.library_items)).toBe(1);
                expect(await getPropModels({ db })).toHaveLength(1);
            },
        );

        testWithHistory(
            "shows the plain block again with no model",
            async ({ db }) => {
                const item = await makeRiser(db);
                await setPropModel({
                    db,
                    itemId: item.id,
                    model: model([2, 1, 1]),
                });
                await setPropModel({ db, itemId: item.id, model: null });
                const [after] = await getItems({ db });
                expect(after.library_item_id).toBeNull();
                expect(after.library_version_hash).toBeNull();
                expect(await getPropModels({ db })).toEqual([]);
            },
        );

        it("refuses a sidecar that isn't one", async ({ db }) => {
            const item = await makeRiser(db);
            await expect(
                setPropModel({
                    db,
                    itemId: item.id,
                    model: {
                        ...model([1, 1, 1]),
                        sidecar: new TextEncoder().encode("{}"),
                    },
                }),
            ).rejects.toThrow();
            const [after] = await getItems({ db });
            expect(after.library_item_id).toBeNull();
        });
    });

    describe("versionHashOf", () => {
        it("doesn't depend on the order of the parts", async () => {
            expect(await versionHashOf({ glb: "a", sidecar: "b" })).toBe(
                await versionHashOf({ sidecar: "b", glb: "a" }),
            );
        });
        it("matches the parked Library's listing", async () => {
            // sha256("openmarch-library-version/1\nglb a\n")
            const listing = "openmarch-library-version/1\nglb a\n";
            const digest = await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(listing),
            );
            const hex = [...new Uint8Array(digest)]
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
            expect(await versionHashOf({ glb: "a" })).toBe(hex);
            expect(hex).toHaveLength(64);
        });
    });

    it("leaves other items alone", async ({ db }) => {
        const a = await makeRiser(db);
        const b = await makeRiser(db);
        await setPropModel({ db, itemId: a.id, model: model([3, 1, 2]) });
        const other = await db
            .select()
            .from(schema.items)
            .where(eq(schema.items.id, b.id))
            .get();
        expect(other!.library_item_id).toBeNull();
    });
});
