import { describe, expect, it, vi } from "vitest";
import {
    addBlocker,
    artworkCommitFiles,
    choicesKey,
    createImportReview,
    displayName,
    groupReadiness,
    surfaceForTemplate,
} from "../importReview";
import {
    ART_FILE_A,
    ART_FILE_B,
    choicesReport,
    createFakeLibrary,
    deferred,
    fileRef,
    ITEM_ID,
    KIT_MATCH,
    MODEL_FILE,
    modelInspection,
    modelReport,
    ok,
    pdfInspection,
    pngInspection,
    session,
    SESSION,
} from "./fakeLibrary";

let urlCount = 0;
const urls = {
    toUrl: () => `blob:test/${++urlCount}`,
    revokeUrl: vi.fn(),
};

const tick = () => new Promise((r) => setTimeout(r, 0));

function modelFake(first = choicesReport(), matches = [KIT_MATCH]) {
    const lib = createFakeLibrary();
    lib.on("importPick", () =>
        ok(session([fileRef(MODEL_FILE, "drum_major_mace.glb", "model")])),
    );
    let seq = 0;
    lib.on("importInspect", () =>
        ok(modelInspection(first, { requestSeq: ++seq, matches })),
    );
    lib.on("importPreview", () =>
        ok({ mimeType: "model/gltf-binary", bytes: new Uint8Array([1]) }),
    );
    return lib;
}

describe("helpers", () => {
    it("names a file without its extension", () => {
        expect(displayName("drum_major_mace.glb")).toBe("drum major mace");
        expect(displayName("Winter guard.PDF")).toBe("Winter guard");
    });

    it("keys choices independent of key order", () => {
        expect(choicesKey({ simplify: true, rotateToYUp: false })).toBe(
            choicesKey({ rotateToYUp: false, simplify: true }),
        );
    });

    it("maps catalog chips to surfaces", () => {
        expect(surfaceForTemplate("silk-6ft-36x54")).toBe("silk");
        expect(surfaceForTemplate("floor-wgi-minimum-60x90ft")).toBe(
            "baseFloor",
        );
        expect(surfaceForTemplate("flat-prop-4x8ft")).toBe("propSlot");
        expect(surfaceForTemplate(null)).toBeNull();
    });
});

describe("createImportReview: picking", () => {
    it("closes when the dialog is cancelled", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () => ok(null));
        const onClose = vi.fn();
        const store = createImportReview(lib.client, { ...urls, onClose });
        await store.getState().pick("any");
        expect(store.getState().phase).toBe("closed");
        expect(onClose).toHaveBeenCalledOnce();
    });

    it("shows mixed-selection inline and picks again on retry", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () => ({
            ok: false,
            error: { code: "mixed-selection", message: "x" },
        }));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        expect(store.getState().phase).toBe("error");
        expect(store.getState().error).toEqual({
            code: "mixed-selection",
            during: "pick",
        });
        lib.on("importPick", () => ok(null));
        await store.getState().retry();
        expect(lib.calls.importPick).toHaveLength(2);
    });

    it("lists unsupported and over-limit files under Can't import", async () => {
        const lib = createFakeLibrary();
        lib.on("importPick", () =>
            ok(
                session([
                    fileRef(ART_FILE_A, "notes.txt", "unsupported"),
                    {
                        ...fileRef(ART_FILE_B, "huge.png", "artwork"),
                        tooLarge: true,
                    },
                ]),
            ),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        expect(store.getState().phase).toBe("review");
        expect(lib.calls.importInspect).toBeUndefined();
        expect(addBlocker(store.getState())).toBe("nothing");
    });
});

describe("createImportReview: a model", () => {
    it("inspects with the picker's kind and the pre-selected choices", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model", { kind: "equipment" });
        expect(lib.calls.importInspect[0]).toEqual({
            sessionId: SESSION,
            fileId: MODEL_FILE,
            kind: "equipment",
            choices: {},
            type: "model",
        });
        const state = store.getState();
        expect(state.phase).toBe("review");
        expect(state.model?.glbUrl).toMatch(/^blob:test\//);
        // A kit itemId pre-selects "New version of …" and its name.
        expect(state.matchMode).toBe("update");
        expect(state.meta.name).toBe("Riser 8 × 4");
        expect(addBlocker(state)).toBeNull();
    });

    it("asks for the kind, then re-inspects with it", async () => {
        const needsKind = modelReport({
            status: "needs-kind",
            kind: null,
            kindSource: null,
            output: null,
            needsChoice: [
                {
                    code: "kind",
                    options: ["prop", "equipment"],
                    preselected: null,
                },
            ],
        });
        const lib = modelFake(needsKind, []);
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        expect(addBlocker(store.getState())).toBe("needsKind");
        expect(store.getState().model?.glbUrl).toBeNull();
        expect(lib.calls.importPreview).toBeUndefined();

        lib.on("importInspect", () => ok(modelInspection(modelReport())));
        store.getState().setKind("prop");
        await tick();
        expect(lib.calls.importInspect[1]).toMatchObject({
            kind: "prop",
            choices: {},
        });
        expect(addBlocker(store.getState())).toBeNull();
        expect(store.getState().meta.name).toBe("drum major mace");
    });

    it("keeps only the newest inspect when choices change quickly", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");

        const slow = deferred<unknown>();
        const fast = deferred<unknown>();
        const answers = [slow.promise, fast.promise];
        lib.on("importInspect", () => answers.shift());
        store.getState().setChoices({ rotateToYUp: false });
        store.getState().setChoices({ simplify: false });
        const newest = modelInspection(modelReport({ badges: ["scaled"] }), {
            requestSeq: 3,
        });
        fast.resolve(ok(newest));
        await tick();
        slow.resolve(ok(modelInspection(modelReport(), { requestSeq: 2 })));
        await tick();
        expect(store.getState().model?.inspection?.requestSeq).toBe(3);
        expect(store.getState().model?.choices).toEqual({
            rotateToYUp: false,
            simplify: false,
        });
        expect(store.getState().model?.inspecting).toBe(false);
    });

    it("loads the before model without simplify for before/after", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        const afterUrl = store.getState().model?.glbUrl;
        store.getState().setShowBefore(true);
        await tick();
        expect(lib.calls.importInspect.at(-1)).toMatchObject({
            choices: { simplify: false },
        });
        const model = store.getState().model!;
        expect(model.showBefore).toBe(true);
        expect(model.beforeUrl).toMatch(/^blob:test\//);
        expect(model.glbUrl).toBe(afterUrl);
    });

    it("sets the grip from a clicked point", async () => {
        const lib = modelFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        store.getState().startGripPick();
        expect(store.getState().model?.pickingGrip).toBe(true);
        store.getState().setGrip([0, 1.2, 0.01]);
        await tick();
        expect(lib.calls.importInspect.at(-1)).toMatchObject({
            choices: { grip: { right: [0, 1.2, 0.01] } },
        });
        expect(store.getState().model?.pickingGrip).toBe(false);
    });

    it("commits the reviewed choices with the kit's item id and a thumbnail", async () => {
        const lib = modelFake();
        lib.on("importCommit", () =>
            ok({
                type: "model",
                report: choicesReport(),
                saved: {
                    outcome: "added-version",
                    item: { id: ITEM_ID, name: "Riser 8 × 4" },
                    versionHash: "a".repeat(64),
                },
            }),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        store
            .getState()
            .setThumbnailCapture(async () => new Uint8Array([137, 80]));
        store.getState().setMeta({ tags: "mace, guard, mace" });
        await store.getState().commit();
        expect(lib.calls.importCommit[0]).toEqual({
            sessionId: SESSION,
            fileId: MODEL_FILE,
            type: "model",
            kind: "equipment",
            choices: {},
            meta: {
                name: "Riser 8 × 4",
                tags: ["mace", "guard"],
                itemId: ITEM_ID,
            },
            thumbnail: new Uint8Array([137, 80]),
        });
        expect(store.getState().phase).toBe("done");
        expect(store.getState().done).toMatchObject({
            names: ["Riser 8 × 4"],
            newVersion: true,
        });
    });

    it("adds as new without the item id when asked", async () => {
        const lib = modelFake();
        lib.on("importCommit", () =>
            ok({ type: "model", report: choicesReport(), saved: null }),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        store.getState().setMatchMode("new");
        await store.getState().commit();
        expect(
            (lib.calls.importCommit[0] as { meta: object }).meta,
        ).not.toHaveProperty("itemId");
        // Not ready after all: back to the review.
        expect(store.getState().phase).toBe("review");
    });

    it("returns to the review when a commit is cancelled", async () => {
        const lib = modelFake();
        lib.on("importCommit", () => ({
            ok: false,
            error: { code: "cancelled", message: "x" },
        }));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        await store.getState().commit();
        expect(store.getState().phase).toBe("review");
        expect(store.getState().cancelledCommit).toBe(true);
    });

    it("shows a crashed worker inline and retries the inspect", async () => {
        const lib = modelFake();
        lib.on("importInspect", () => ({
            ok: false,
            error: { code: "worker-crashed", message: "x" },
        }));
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("model");
        expect(store.getState().error).toEqual({
            code: "worker-crashed",
            during: "inspect",
        });
        lib.on("importInspect", () => ok(modelInspection(choicesReport())));
        await store.getState().retry();
        expect(store.getState().phase).toBe("review");
    });

    it("forwards progress and cancels the running step", async () => {
        const lib = modelFake();
        const pending = deferred<unknown>();
        lib.on("importInspect", () => pending.promise);
        lib.on("importCancel", () => ok(undefined));
        const store = createImportReview(lib.client, urls);
        void store.getState().pick("model");
        await tick();
        lib.emitProgress({
            sessionId: SESSION,
            fileId: MODEL_FILE,
            stage: "validating",
            fraction: null,
        });
        expect(store.getState().progress?.stage).toBe("validating");
        await store.getState().cancelRunning();
        expect(lib.calls.importCancel).toEqual([{ sessionId: SESSION }]);
        pending.resolve({
            ok: false,
            error: { code: "cancelled", message: "x" },
        });
        await tick();
        expect(store.getState().error?.code).toBe("cancelled");
    });

    it("frees the session and its URLs on close", async () => {
        const lib = modelFake();
        const revokeUrl = vi.fn();
        const store = createImportReview(lib.client, { ...urls, revokeUrl });
        await store.getState().pick("model");
        const url = store.getState().model?.glbUrl;
        store.getState().close();
        expect(lib.closed).toEqual([SESSION]);
        expect(revokeUrl).toHaveBeenCalledWith(url);
    });
});

describe("createImportReview: artwork", () => {
    function artworkFake(inspection = pdfInspection()) {
        const lib = createFakeLibrary();
        lib.on("importPick", () =>
            ok(session([fileRef(ART_FILE_A, "silks.pdf", "artwork")])),
        );
        lib.on("importInspect", () => ok(inspection));
        lib.on("importPreview", () =>
            ok({ mimeType: "image/png", bytes: new Uint8Array([1]) }),
        );
        return lib;
    }

    it("asks once per aspect, pre-selecting the size from the file", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        const artwork = store.getState().artwork!;
        expect(artwork.groups).toHaveLength(2);
        expect(artwork.groups.map((g) => g.size?.source)).toEqual([
            "file",
            "file",
        ]);
        expect(artwork.selected[ART_FILE_A]).toEqual([0, 1]);
        expect(artwork.focus).toEqual({ fileId: ART_FILE_A, page: 0 });
        expect(groupReadiness(artwork, 0)?.dpi).toBe("vector");
        expect(addBlocker(store.getState())).toBeNull();
    });

    it("commits one entry per surface, each page with its size", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        store.getState().setGroupSurface(1, "floorProp");
        const files = artworkCommitFiles(store.getState());
        expect(files).toEqual([
            {
                fileId: ART_FILE_A,
                surface: "propSlot",
                pages: [0],
                pageSizes: { "0": "file" },
                meta: { name: "silks" },
            },
            {
                fileId: ART_FILE_A,
                surface: "floorProp",
                pages: [1],
                pageSizes: { "1": "file" },
                meta: { name: "silks" },
            },
        ]);
    });

    it("takes a template chip's size and surface, and drops deselected pages", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        const chip =
            store.getState().artwork!.inspection.aspectGroups[0].chips[0];
        store.getState().setGroupSize(0, {
            width: chip.width,
            height: chip.height,
            source: "template",
            templateId: chip.catalogId,
        });
        store.getState().togglePage(ART_FILE_A, 1);
        const files = artworkCommitFiles(store.getState());
        expect(files).toHaveLength(1);
        expect(files[0]).toMatchObject({
            surface: "silk",
            pages: [0],
            pageSizes: {
                "0": {
                    source: "template",
                    templateId: "silk-6ft-36x54",
                    width: { m: 0.9144, typed: "36 in" },
                },
            },
        });
    });

    it("warns live when a raster isn't print-ready at its size", async () => {
        const lib = artworkFake(pngInspection());
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        // Pre-selected from the first matching chip: 36 × 54 in silk.
        let artwork = store.getState().artwork!;
        expect(artwork.groups[0]).toMatchObject({
            surface: "silk",
            size: { source: "template" },
        });
        // 600 px over 36 in is about 16 DPI: not print-ready for a silk.
        expect(groupReadiness(artwork, 0)?.readiness).toBe("not-print-ready");
        store.getState().setGroupSize(0, {
            width: { m: 0.1016 },
            height: { m: 0.1524 },
            source: "user",
            templateId: null,
        });
        artwork = store.getState().artwork!;
        // 600 px over 4 in is 150 DPI: the silk minimum.
        expect(groupReadiness(artwork, 0)).toEqual({
            dpi: 150,
            readiness: "minimum",
        });
        // The refused file isn't selectable.
        expect(artwork.selected[ART_FILE_B]).toEqual([]);
    });

    it("loads each page preview once", async () => {
        const lib = artworkFake();
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        store.getState().loadArtworkPreview(ART_FILE_A, 1, 256);
        store.getState().loadArtworkPreview(ART_FILE_A, 1, 256);
        await tick();
        store.getState().loadArtworkPreview(ART_FILE_A, 1, 256);
        expect(lib.calls.importPreview).toEqual([
            {
                sessionId: SESSION,
                fileId: ART_FILE_A,
                type: "artwork",
                page: 1,
                maxPx: 256,
            },
        ]);
        expect(
            store.getState().artwork!.previews[`${ART_FILE_A}:1@256`],
        ).toMatch(/^blob:/);
    });

    it("reports added and skipped pages when done", async () => {
        const lib = artworkFake();
        lib.on("importCommit", () =>
            ok({
                type: "artwork",
                reports: [
                    {
                        filename: "silks.pdf",
                        format: "pdf",
                        imported: [
                            { page: 0, item: { name: "silks (page 1)" } },
                        ],
                        notImported: [
                            {
                                page: 1,
                                notes: [
                                    {
                                        group: "needs-choice",
                                        code: "size",
                                        message: "Choose its size.",
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
        );
        const store = createImportReview(lib.client, urls);
        await store.getState().pick("any");
        await store.getState().commit();
        expect(store.getState().done).toEqual({
            names: ["silks (page 1)"],
            notImported: [
                { filename: "silks.pdf", page: 1, message: "Choose its size." },
            ],
            newVersion: false,
        });
    });
});
