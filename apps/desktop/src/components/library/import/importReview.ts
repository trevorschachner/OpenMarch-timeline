/**
 * The import review's state (package C1.10; props-spec.md §2 "The review",
 * ADR 0002 D-13 amended 2026-10-12, Q60–Q64), driving the C1.9 client.
 *
 * One store per review. The import panel and the preview stage both read
 * it, so they can sit in different parts of a layout: today the temporary
 * host, later Visuals mode's Library side panel and stage. The store holds
 * no React and talks to main only through the `ImportReviewClient` it is
 * given, so tests drive it with a stand-in.
 *
 * - Models are re-inspected whenever a choice changes; the client drops
 *   replies older than the latest call (C1.9 §4), and preview bytes are
 *   only kept when no inspect started meanwhile.
 * - Artwork is inspected once for every file of the pick; the size step asks
 *   once per distinct aspect (`aspectGroups`).
 * - IPC errors land in `error` and show inline with Try again or Choose
 *   files again (D-22 amended, Q54); never an `AlertModal`.
 */
import { createStore, type StoreApi } from "zustand/vanilla";
import {
    catalogEntry,
    nativeDpi,
    printReadiness,
    type ArtworkSurface,
    type Dpi,
    type Length,
    type PrintReadiness,
} from "@/view3d/core/sizes";
import {
    bytesToObjectUrl,
    isStale,
    type ImportClient,
} from "@/view3d/library/importClient";
import type {
    ArtworkImportReport,
    ArtworkInspection,
    AspectGroup,
    BytesPayload,
    ImportCommitRequest,
    ImportFileRef,
    ImportInspection,
    ImportProgress,
    ImportSession,
    LibraryIpcErrorCode,
    LibraryMatch,
    ModelImportChoices,
    ModelKind,
    PickContext,
    PickPurpose,
} from "@/view3d/library/protocol";

export type ImportReviewClient = Pick<
    ImportClient,
    | "pick"
    | "inspectModel"
    | "inspectArtwork"
    | "preview"
    | "commit"
    | "cancel"
    | "close"
    | "onProgress"
>;

export type ModelInspection = Extract<ImportInspection, { type: "model" }>;
export type ArtworkInspectionResult = Extract<
    ImportInspection,
    { type: "artwork" }
>;
type OkArtwork = Extract<ArtworkInspection, { ok: true }>;

export type ReviewPhase =
    /** The file dialog is open. */
    | "picking"
    /** Waiting for the first inspection. */
    | "inspecting"
    | "review"
    | "committing"
    | "done"
    | "error"
    | "closed";

export type FailedStep = "pick" | "inspect" | "commit";

export interface ReviewError {
    code: LibraryIpcErrorCode;
    /** What Try again repeats. */
    during: FailedStep;
}

export type Vec3 = [number, number, number];

export interface ModelReview {
    file: ImportFileRef;
    /** The kind the user chose; null keeps the picker's or the stamp's. */
    kind: ModelKind | null;
    /** The user's answers; anything left out takes the pre-selected value. */
    choices: ModelImportChoices;
    inspection: ModelInspection | null;
    /** An inspect is running for the current choices. */
    inspecting: boolean;
    /** The normalized GLB of `inspection`, as an object URL. */
    glbUrl: string | null;
    /** The same choices without simplify, for the before/after preview. */
    beforeUrl: string | null;
    showBefore: boolean;
    loadingBefore: boolean;
    /** Click a point on the model to set the grip. */
    pickingGrip: boolean;
    previewFailed: boolean;
}

/** The size chosen for one aspect group. */
export interface GroupSize {
    width: Length;
    height: Length;
    source: "file" | "template" | "slot" | "user";
    templateId: string | null;
}

export interface ArtworkGroupState {
    size: GroupSize | null;
    surface: ArtworkSurface;
    /** The user picked the surface, so a chip no longer changes it. */
    surfaceChosen: boolean;
}

export interface ArtworkReview {
    inspection: ArtworkInspectionResult;
    /** Selected pages per file id. */
    selected: Record<string, number[]>;
    groups: ArtworkGroupState[];
    /** The page the stage shows. */
    focus: { fileId: string; page: number } | null;
    /** `${fileId}:${page}@${px}` → object URL. */
    previews: Record<string, string>;
    previewFailed: Record<string, true>;
}

export interface ReviewMeta {
    name: string;
    tags: string;
    author: string;
    license: string;
    sourceUrl: string;
}

export interface DoneSummary {
    /** Library items added or updated. */
    names: string[];
    /** Pages the pipeline didn't import, with its English notes (Q58). */
    notImported: { filename: string; page: number | null; message: string }[];
    newVersion: boolean;
}

export interface ImportReviewState {
    phase: ReviewPhase;
    purpose: PickPurpose;
    context: PickContext | null;
    session: ImportSession | null;
    error: ReviewError | null;
    /** Files the pipeline can't take at all: unsupported or too large. */
    progress: ImportProgress | null;
    model: ModelReview | null;
    artwork: ArtworkReview | null;
    /** "New version of …" / Update, or Add as new. */
    matchMode: "update" | "new";
    meta: ReviewMeta;
    /** A cancelled commit returns to the review with this note. */
    cancelledCommit: boolean;
    done: DoneSummary | null;
}

export interface ImportReviewActions {
    /** Opens the file dialog; a cancelled dialog closes the review. */
    pick(purpose?: PickPurpose, context?: PickContext): Promise<void>;
    /** Repeats the failed step; `mixed-selection` and expired sessions pick again. */
    retry(): Promise<void>;
    setKind(kind: ModelKind): void;
    setChoices(patch: ModelImportChoices): void;
    startGripPick(): void;
    cancelGripPick(): void;
    /** A point on the model, in the normalized GLB's meters. */
    setGrip(point: Vec3): void;
    setShowBefore(before: boolean): void;
    retryPreview(): void;
    togglePage(fileId: string, page: number): void;
    focusPage(fileId: string, page: number): void;
    /** Loads a page preview (256 for the size step, 1024 for the stage). */
    loadArtworkPreview(fileId: string, page: number, px: 256 | 1024): void;
    setGroupSize(group: number, size: GroupSize): void;
    setGroupSurface(group: number, surface: ArtworkSurface): void;
    setMatchMode(mode: "update" | "new"): void;
    setMeta(patch: Partial<ReviewMeta>): void;
    /** Registered by the stage: a 256 px PNG of the model for Q50. */
    setThumbnailCapture(
        capture: (() => Promise<Uint8Array<ArrayBuffer> | null>) | null,
    ): void;
    commit(): Promise<void>;
    /** Cancels the running inspect or commit (progress Cancel). */
    cancelRunning(): Promise<void>;
    /** Ends the session and frees its preview URLs. */
    close(): void;
}

export type ImportReviewStore = StoreApi<
    ImportReviewState & ImportReviewActions
>;

export interface ImportReviewOptions {
    /** Turns preview bytes into a URL; tests pass a stand-in. */
    toUrl?: (payload: BytesPayload) => string;
    revokeUrl?: (url: string) => void;
    /** Called once when the review closes. */
    onClose?: () => void;
}

// ------------------------------------------------------------------ helpers

/** The filename without its extension, underscores as spaces. */
export function displayName(filename: string): string {
    const base = filename.replace(/\.[A-Za-z0-9]+$/, "");
    return (base || filename).replace(/_/g, " ").trim() || filename;
}

/** A stable key for a set of choices. */
export function choicesKey(choices: ModelImportChoices): string {
    return JSON.stringify(
        Object.keys(choices)
            .sort()
            .map((k) => [k, choices[k as keyof ModelImportChoices]]),
    );
}

const SURFACE_FOR_CHIP_KIND: Record<string, ArtworkSurface> = {
    silk: "silk",
    floor: "baseFloor",
    flatProp: "propSlot",
};

/** The surface a catalog chip implies: silk Cut, floor or flat prop. */
export function surfaceForTemplate(
    templateId: string | null,
): ArtworkSurface | null {
    if (!templateId) return null;
    const entry = catalogEntry(templateId);
    return entry ? (SURFACE_FOR_CHIP_KIND[entry.kind] ?? null) : null;
}

function plainLength(length: Length): Length {
    return length.typed !== undefined
        ? { m: length.m, typed: length.typed }
        : { m: length.m };
}

function initialGroup(
    group: AspectGroup,
    context: PickContext | null,
): ArtworkGroupState {
    let size: GroupSize | null = null;
    if (group.fileSize) {
        size = {
            width: plainLength(group.fileSize.width),
            height: plainLength(group.fileSize.height),
            source: "file",
            templateId: null,
        };
    } else if (
        context?.size &&
        Math.abs(context.size.width.m / context.size.height.m - group.aspect) <=
            0.005 * group.aspect
    ) {
        size = {
            width: plainLength(context.size.width),
            height: plainLength(context.size.height),
            source: "slot",
            templateId: context.size.templateId ?? null,
        };
    } else if (group.chips[0]) {
        const chip = group.chips[0];
        size = {
            width: plainLength(chip.width),
            height: plainLength(chip.height),
            source: "template",
            templateId: chip.catalogId,
        };
    }
    return {
        size,
        surface:
            context?.surface ??
            surfaceForTemplate(size?.templateId ?? null) ??
            "propSlot",
        surfaceChosen: context?.surface !== undefined,
    };
}

/** Selected pages of `group`, as `{ fileId, page }`. */
export function selectedMembers(
    artwork: ArtworkReview,
    group: number,
): { fileId: string; page: number }[] {
    const g = artwork.inspection.aspectGroups[group];
    if (!g) return [];
    return g.members.flatMap((m) => {
        const fileId = artwork.inspection.files[m.file]?.fileId;
        return fileId && artwork.selected[fileId]?.includes(m.page)
            ? [{ fileId, page: m.page }]
            : [];
    });
}

export function selectedPageCount(artwork: ArtworkReview): number {
    return Object.values(artwork.selected).reduce((n, p) => n + p.length, 0);
}

/**
 * The lowest native DPI among a group's pages at `size`, or "vector" when
 * every page is vector. Vector pages print sharp at any size.
 */
export function groupDpi(
    artwork: ArtworkReview,
    group: number,
    size: GroupSize,
): Dpi | null {
    const g = artwork.inspection.aspectGroups[group];
    if (!g) return null;
    let lowest: number | null = null;
    for (const m of g.members) {
        const inspection = artwork.inspection.files[m.file]?.inspection;
        if (!inspection?.ok) continue;
        const page = inspection.pages[m.page];
        if (!page?.pixels) continue;
        const dpi = nativeDpi(page.pixels.width, size.width.m);
        lowest = lowest === null ? dpi : Math.min(lowest, dpi);
    }
    return lowest ?? "vector";
}

export function groupReadiness(
    artwork: ArtworkReview,
    group: number,
): { dpi: Dpi; readiness: PrintReadiness } | null {
    const state = artwork.groups[group];
    if (!state?.size) return null;
    const dpi = groupDpi(artwork, group, state.size);
    if (dpi === null) return null;
    return { dpi, readiness: printReadiness(state.surface, dpi) };
}

/** The match "New version of …" or "Update" would add to. */
export function primaryMatch(
    state: Pick<ImportReviewState, "model" | "artwork">,
): LibraryMatch | null {
    if (state.model) return state.model.inspection?.matches[0] ?? null;
    if (state.artwork) {
        const files = state.artwork.inspection.files.filter(
            (f) => (state.artwork!.selected[f.fileId]?.length ?? 0) > 0,
        );
        if (files.length !== 1) return null;
        if (state.artwork.selected[files[0].fileId].length !== 1) return null;
        return files[0].matches[0] ?? null;
    }
    return null;
}

/** Whether Add stores a new Version of an existing item. */
export function addsNewVersion(state: ImportReviewState): boolean {
    return state.matchMode === "update" && primaryMatch(state) !== null;
}

/** Files Can't import lists before any inspection: unsupported or over the limit. */
export function refusedFiles(state: ImportReviewState): ImportFileRef[] {
    return (state.session?.files ?? []).filter(
        (f) => f.type === "unsupported" || f.tooLarge,
    );
}

export type AddBlocker =
    | "busy"
    | "rejected"
    | "needsKind"
    | "noPages"
    | "needsSize"
    | "needsName"
    | "nothing";

/** Why Add is disabled, or null when it can run. */
export function addBlocker(state: ImportReviewState): AddBlocker | null {
    if (state.phase !== "review") return "busy";
    if (state.model) {
        const { inspection, inspecting } = state.model;
        if (!inspection || inspecting) return "busy";
        if (inspection.report.status === "rejected") return "rejected";
        if (inspection.report.status === "needs-kind") return "needsKind";
        if (!state.meta.name.trim()) return "needsName";
        return null;
    }
    if (state.artwork) {
        if (selectedPageCount(state.artwork) === 0) return "noPages";
        const groups = state.artwork.inspection.aspectGroups;
        for (let i = 0; i < groups.length; i++) {
            if (
                selectedMembers(state.artwork, i).length > 0 &&
                !state.artwork.groups[i]?.size
            ) {
                return "needsSize";
            }
        }
        if (
            state.artwork.inspection.files.length === 1 &&
            !state.meta.name.trim()
        ) {
            return "needsName";
        }
        return null;
    }
    return "nothing";
}

function tagsOf(text: string): string[] {
    return [
        ...new Set(
            text
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
        ),
    ].slice(0, 32);
}

function licenseOf(meta: ReviewMeta) {
    const author = meta.author.trim();
    const license = meta.license.trim();
    const sourceUrl = meta.sourceUrl.trim();
    if (!author && !license && !sourceUrl) return undefined;
    return {
        ...(author ? { author } : {}),
        // Free text goes in `licenseText`; an SPDX-like id also in `license`.
        ...(license
            ? /^[A-Za-z0-9.+-]+$/.test(license)
                ? { license }
                : { licenseText: license }
            : {}),
        ...(sourceUrl ? { sourceUrl } : {}),
    };
}

/** The artwork commit: one entry per file and surface, with per-page sizes. */
export function artworkCommitFiles(
    state: ImportReviewState,
): Extract<ImportCommitRequest, { type: "artwork" }>["files"] {
    const artwork = state.artwork;
    if (!artwork) return [];
    const single = artwork.inspection.files.length === 1;
    const match = state.matchMode === "update" ? primaryMatch(state) : null;
    const tags = tagsOf(state.meta.tags);
    const license = licenseOf(state.meta);
    const entries = new Map<
        string,
        {
            fileId: string;
            surface: ArtworkSurface;
            pages: number[];
            pageSizes: Record<string, GroupSize | "file">;
        }
    >();
    artwork.inspection.aspectGroups.forEach((_, i) => {
        const group = artwork.groups[i];
        if (!group?.size) return;
        for (const { fileId, page } of selectedMembers(artwork, i)) {
            const key = `${fileId}/${group.surface}`;
            const entry = entries.get(key) ?? {
                fileId,
                surface: group.surface,
                pages: [],
                pageSizes: {},
            };
            entry.pages.push(page);
            entry.pageSizes[String(page)] =
                group.size.source === "file" ? "file" : group.size;
            entries.set(key, entry);
        }
    });
    return [...entries.values()].map((entry) => {
        const file = artwork.inspection.files.find(
            (f) => f.fileId === entry.fileId,
        )!;
        const name = single
            ? state.meta.name.trim()
            : displayName(file.inspection.filename);
        return {
            fileId: entry.fileId,
            surface: entry.surface,
            pages: [...entry.pages].sort((a, b) => a - b),
            pageSizes: Object.fromEntries(
                Object.entries(entry.pageSizes).map(([page, size]) => [
                    page,
                    size === "file"
                        ? ("file" as const)
                        : {
                              width: plainLength(size.width),
                              height: plainLength(size.height),
                              source:
                                  size.source === "file"
                                      ? ("user" as const)
                                      : size.source,
                              templateId: size.templateId,
                          },
                ]),
            ),
            meta: {
                name: name || displayName(file.inspection.filename),
                ...(tags.length ? { tags } : {}),
                ...(license ? { license } : {}),
                ...(match ? { itemId: match.itemId } : {}),
            },
        };
    });
}

const EMPTY_META: ReviewMeta = {
    name: "",
    tags: "",
    author: "",
    license: "",
    sourceUrl: "",
};

function initialState(): ImportReviewState {
    return {
        phase: "picking",
        purpose: "any",
        context: null,
        session: null,
        error: null,
        progress: null,
        model: null,
        artwork: null,
        matchMode: "update",
        meta: { ...EMPTY_META },
        cancelledCommit: false,
        done: null,
    };
}

// ------------------------------------------------------------------ store

// The store's actions share its closure (URLs, generation, capture).
// eslint-disable-next-line max-lines-per-function
export function createImportReview(
    client: ImportReviewClient,
    options: ImportReviewOptions = {},
): ImportReviewStore {
    const toUrl = options.toUrl ?? bytesToObjectUrl;
    const revokeUrl = options.revokeUrl ?? ((url) => URL.revokeObjectURL(url));
    /** Every URL this review made, revoked on close. */
    const urls = new Set<string>();
    let unsubscribeProgress: (() => void) | null = null;
    let capture: (() => Promise<Uint8Array<ArrayBuffer> | null>) | null = null;
    /** Bumped by every model inspect; previews from an older one are dropped. */
    let inspectGen = 0;
    /** Artwork preview loads in flight, by key. */
    const loadingPreviews = new Set<string>();
    let closed = false;

    const makeUrl = (payload: BytesPayload) => {
        const url = toUrl(payload);
        urls.add(url);
        return url;
    };
    const dropUrl = (url: string | null | undefined) => {
        if (!url || !urls.has(url)) return;
        urls.delete(url);
        revokeUrl(url);
    };

    return createStore<ImportReviewState & ImportReviewActions>()(
        // eslint-disable-next-line max-lines-per-function
        (set, get) => {
            const fail = (code: LibraryIpcErrorCode, during: FailedStep) =>
                set({
                    phase: "error",
                    error: { code, during },
                    progress: null,
                });

            const patchModel = (patch: Partial<ModelReview>) => {
                const model = get().model;
                if (model) set({ model: { ...model, ...patch } });
            };

            const freeSession = () => {
                const { session, model, artwork } = get();
                unsubscribeProgress?.();
                unsubscribeProgress = null;
                if (session) client.close(session.sessionId);
                dropUrl(model?.glbUrl);
                dropUrl(model?.beforeUrl);
                for (const url of Object.values(artwork?.previews ?? {})) {
                    dropUrl(url);
                }
                loadingPreviews.clear();
            };

            async function loadModelPreview(gen: number) {
                const { session, model } = get();
                if (!session || !model) return;
                const result = await client.preview({
                    sessionId: session.sessionId,
                    fileId: model.file.fileId,
                    type: "model",
                });
                if (closed || gen !== inspectGen) return;
                if (!result.ok) {
                    patchModel({ previewFailed: true });
                    return;
                }
                const current = get().model;
                dropUrl(current?.glbUrl);
                patchModel({
                    glbUrl: makeUrl(result.value),
                    previewFailed: false,
                });
            }

            async function inspectModel() {
                const { session, model } = get();
                if (!session || !model) return;
                const gen = ++inspectGen;
                const kind =
                    model.kind ?? session.context?.kind ?? get().context?.kind;
                patchModel({ inspecting: true, pickingGrip: false });
                const result = await client.inspectModel({
                    sessionId: session.sessionId,
                    fileId: model.file.fileId,
                    ...(kind ? { kind } : {}),
                    choices: model.choices,
                });
                if (closed || isStale(result)) return;
                if (!result.ok) {
                    patchModel({ inspecting: false });
                    fail(result.error.code, "inspect");
                    return;
                }
                const inspection = result.value;
                const first = !get().model?.inspection;
                patchModel({ inspection, inspecting: false });
                const patch: Partial<ImportReviewState> = {
                    phase: "review",
                    error: null,
                    progress: null,
                };
                if (first) {
                    const match = inspection.matches[0];
                    const copyright = inspection.report.metadata.copyright;
                    patch.meta = {
                        ...get().meta,
                        ...(match?.reason === "kit-item-id" && !match.builtIn
                            ? { name: match.name }
                            : {}),
                        ...(copyright ? { author: copyright } : {}),
                    };
                }
                set(patch);
                if (inspection.previewReady) await loadModelPreview(gen);
                else {
                    dropUrl(get().model?.glbUrl);
                    patchModel({ glbUrl: null });
                }
            }

            async function inspectArtwork() {
                const { session } = get();
                if (!session) return;
                const result = await client.inspectArtwork(session.sessionId);
                if (closed) return;
                if (!result.ok) {
                    fail(result.error.code, "inspect");
                    return;
                }
                const inspection = result.value;
                const selected: Record<string, number[]> = {};
                for (const f of inspection.files) {
                    selected[f.fileId] = f.inspection.ok
                        ? f.inspection.pages.map((p) => p.index)
                        : [];
                }
                const firstOk = inspection.files.find((f) => f.inspection.ok);
                const firstPage = (firstOk?.inspection as OkArtwork | undefined)
                    ?.pages[0];
                set({
                    phase: "review",
                    error: null,
                    progress: null,
                    artwork: {
                        inspection,
                        selected,
                        groups: inspection.aspectGroups.map((g) =>
                            initialGroup(g, session.context),
                        ),
                        focus:
                            firstOk && firstPage
                                ? {
                                      fileId: firstOk.fileId,
                                      page: firstPage.index,
                                  }
                                : null,
                        previews: {},
                        previewFailed: {},
                    },
                });
            }

            async function begin(session: ImportSession) {
                set({
                    session,
                    phase: "inspecting",
                    error: null,
                    model: null,
                    artwork: null,
                    done: null,
                    cancelledCommit: false,
                    matchMode: "update",
                });
                unsubscribeProgress?.();
                unsubscribeProgress = client.onProgress(
                    session.sessionId,
                    (progress) => {
                        const phase = get().phase;
                        if (
                            phase === "inspecting" ||
                            phase === "committing" ||
                            get().model?.inspecting
                        ) {
                            set({ progress });
                        }
                    },
                );
                const usable = session.files.filter(
                    (f) => f.type !== "unsupported" && !f.tooLarge,
                );
                const model = usable.find((f) => f.type === "model");
                const single = session.files.length === 1;
                set({
                    meta: {
                        ...EMPTY_META,
                        name: single
                            ? displayName(session.files[0].filename)
                            : "",
                    },
                });
                if (model) {
                    set({
                        model: {
                            file: model,
                            kind: null,
                            choices: {},
                            inspection: null,
                            inspecting: false,
                            glbUrl: null,
                            beforeUrl: null,
                            showBefore: false,
                            loadingBefore: false,
                            pickingGrip: false,
                            previewFailed: false,
                        },
                    });
                    await inspectModel();
                } else if (usable.some((f) => f.type === "artwork")) {
                    await inspectArtwork();
                } else {
                    // Only refused files: Can't import lists them.
                    set({ phase: "review" });
                }
            }

            async function pick(
                purpose: PickPurpose = get().purpose,
                context: PickContext | undefined = get().context ?? undefined,
            ) {
                if (get().session) {
                    freeSession();
                    set({ session: null, model: null, artwork: null });
                }
                set({
                    phase: "picking",
                    purpose,
                    context: context ?? null,
                    error: null,
                });
                const result = await client.pick({
                    purpose,
                    ...(context ? { context } : {}),
                });
                if (closed) return;
                if (!result.ok) {
                    fail(result.error.code, "pick");
                    return;
                }
                if (!result.value) {
                    get().close();
                    return;
                }
                await begin(result.value);
            }

            async function loadBefore() {
                const { session, model } = get();
                if (!session || !model || model.inspecting) return;
                const gen = inspectGen;
                patchModel({ loadingBefore: true });
                const kind =
                    model.kind ?? session.context?.kind ?? get().context?.kind;
                const result = await client.inspectModel({
                    sessionId: session.sessionId,
                    fileId: model.file.fileId,
                    ...(kind ? { kind } : {}),
                    choices: { ...model.choices, simplify: false },
                });
                if (closed || isStale(result) || gen !== inspectGen) {
                    patchModel({ loadingBefore: false });
                    return;
                }
                if (!result.ok || !result.value.previewReady) {
                    patchModel({ loadingBefore: false, showBefore: false });
                    return;
                }
                const preview = await client.preview({
                    sessionId: session.sessionId,
                    fileId: model.file.fileId,
                    type: "model",
                });
                if (closed || gen !== inspectGen) {
                    patchModel({ loadingBefore: false });
                    return;
                }
                if (!preview.ok) {
                    patchModel({ loadingBefore: false, showBefore: false });
                    return;
                }
                patchModel({
                    beforeUrl: makeUrl(preview.value),
                    loadingBefore: false,
                });
            }

            async function commitModel() {
                const { session, model, meta } = get();
                const inspection = model?.inspection;
                if (!session || !model || !inspection?.report.kind) return;
                const match =
                    get().matchMode === "update" ? inspection.matches[0] : null;
                set({ phase: "committing", cancelledCommit: false });
                let thumbnail: Uint8Array<ArrayBuffer> | null = null;
                try {
                    thumbnail = (await capture?.()) ?? null;
                } catch {
                    thumbnail = null; // the kind icon stands in (Q50)
                }
                const tags = tagsOf(meta.tags);
                const license = licenseOf(meta);
                const result = await client.commit({
                    sessionId: session.sessionId,
                    fileId: model.file.fileId,
                    type: "model",
                    kind: inspection.report.kind,
                    choices: model.choices,
                    meta: {
                        name: meta.name.trim(),
                        ...(tags.length ? { tags } : {}),
                        ...(license ? { license } : {}),
                        ...(match ? { itemId: match.itemId } : {}),
                    },
                    ...(thumbnail ? { thumbnail } : {}),
                });
                if (closed) return;
                if (!result.ok) {
                    if (result.error.code === "cancelled") {
                        set({
                            phase: "review",
                            progress: null,
                            cancelledCommit: true,
                        });
                    } else fail(result.error.code, "commit");
                    return;
                }
                const value = result.value;
                if (value.type !== "model") return;
                if (!value.saved) {
                    // Not ready after all: show the report it came back with.
                    patchModel({
                        inspection: { ...inspection, report: value.report },
                    });
                    set({ phase: "review", progress: null });
                    return;
                }
                set({
                    phase: "done",
                    progress: null,
                    done: {
                        names: [value.saved.item.name],
                        notImported: [],
                        newVersion: match !== null && match !== undefined,
                    },
                });
            }

            async function commitArtwork() {
                const { session } = get();
                if (!session) return;
                const files = artworkCommitFiles(get());
                if (files.length === 0) return;
                const newVersion =
                    files.length === 1 && files[0].meta.itemId !== undefined;
                set({ phase: "committing", cancelledCommit: false });
                const result = await client.commit({
                    sessionId: session.sessionId,
                    type: "artwork",
                    files,
                });
                if (closed) return;
                if (!result.ok) {
                    if (result.error.code === "cancelled") {
                        set({
                            phase: "review",
                            progress: null,
                            cancelledCommit: true,
                        });
                    } else fail(result.error.code, "commit");
                    return;
                }
                if (result.value.type !== "artwork") return;
                const reports: ArtworkImportReport[] = result.value.reports;
                set({
                    phase: "done",
                    progress: null,
                    done: {
                        names: reports.flatMap((r) =>
                            r.imported.map((p) => p.item.name),
                        ),
                        notImported: reports.flatMap((r) =>
                            r.notImported.flatMap((n) =>
                                n.notes.map((note) => ({
                                    filename: r.filename,
                                    page: n.page,
                                    message: note.message,
                                })),
                            ),
                        ),
                        newVersion,
                    },
                });
            }

            return {
                ...initialState(),

                pick,

                async retry() {
                    const error = get().error;
                    if (!error) return;
                    if (
                        error.during === "pick" ||
                        error.code === "mixed-selection" ||
                        error.code === "session-expired" ||
                        error.code === "unknown-file"
                    ) {
                        await pick();
                        return;
                    }
                    set({
                        error: null,
                        phase:
                            error.during === "commit" ? "review" : "inspecting",
                    });
                    if (error.during === "commit") {
                        await get().commit();
                    } else if (get().model) {
                        await inspectModel();
                    } else {
                        await inspectArtwork();
                    }
                },

                setKind(kind) {
                    const model = get().model;
                    if (!model) return;
                    dropUrl(model.beforeUrl);
                    patchModel({
                        kind,
                        // The pipeline pre-selects per kind: start over.
                        choices: {},
                        beforeUrl: null,
                        showBefore: false,
                    });
                    void inspectModel();
                },

                setChoices(patch) {
                    const model = get().model;
                    if (!model) return;
                    const choices = { ...model.choices, ...patch };
                    const onlySimplify = Object.keys(patch).every(
                        (k) => k === "simplify",
                    );
                    if (!onlySimplify) dropUrl(model.beforeUrl);
                    patchModel({
                        choices,
                        ...(onlySimplify ? {} : { beforeUrl: null }),
                        showBefore: false,
                    });
                    void inspectModel();
                },

                startGripPick() {
                    patchModel({ pickingGrip: true, showBefore: false });
                },
                cancelGripPick() {
                    patchModel({ pickingGrip: false });
                },
                setGrip(point) {
                    const model = get().model;
                    if (!model) return;
                    patchModel({
                        choices: { ...model.choices, grip: { right: point } },
                        pickingGrip: false,
                    });
                    void inspectModel();
                },

                setShowBefore(before) {
                    const model = get().model;
                    if (!model) return;
                    patchModel({ showBefore: before });
                    if (before && !model.beforeUrl) void loadBefore();
                },

                retryPreview() {
                    patchModel({ previewFailed: false });
                    void loadModelPreview(inspectGen);
                },

                togglePage(fileId, page) {
                    const artwork = get().artwork;
                    if (!artwork) return;
                    const pages = artwork.selected[fileId] ?? [];
                    set({
                        artwork: {
                            ...artwork,
                            selected: {
                                ...artwork.selected,
                                [fileId]: pages.includes(page)
                                    ? pages.filter((p) => p !== page)
                                    : [...pages, page].sort((a, b) => a - b),
                            },
                        },
                    });
                },

                focusPage(fileId, page) {
                    const artwork = get().artwork;
                    if (artwork)
                        set({
                            artwork: { ...artwork, focus: { fileId, page } },
                        });
                },

                loadArtworkPreview(fileId, page, px) {
                    const { session, artwork } = get();
                    if (!session || !artwork) return;
                    const key = `${fileId}:${page}@${px}`;
                    if (
                        artwork.previews[key] ||
                        artwork.previewFailed[key] ||
                        loadingPreviews.has(key)
                    ) {
                        return;
                    }
                    loadingPreviews.add(key);
                    void client
                        .preview({
                            sessionId: session.sessionId,
                            fileId,
                            type: "artwork",
                            page,
                            maxPx: px,
                        })
                        .then((result) => {
                            loadingPreviews.delete(key);
                            const current = get().artwork;
                            if (closed || !current || get().session !== session)
                                return;
                            if (!result.ok) {
                                set({
                                    artwork: {
                                        ...current,
                                        previewFailed: {
                                            ...current.previewFailed,
                                            [key]: true,
                                        },
                                    },
                                });
                                return;
                            }
                            set({
                                artwork: {
                                    ...current,
                                    previews: {
                                        ...current.previews,
                                        [key]: makeUrl(result.value),
                                    },
                                },
                            });
                        });
                },

                setGroupSize(group, size) {
                    const artwork = get().artwork;
                    if (!artwork?.groups[group]) return;
                    const groups = [...artwork.groups];
                    const current = groups[group];
                    groups[group] = {
                        ...current,
                        size,
                        surface: current.surfaceChosen
                            ? current.surface
                            : (surfaceForTemplate(size.templateId) ??
                              current.surface),
                    };
                    set({ artwork: { ...artwork, groups } });
                },

                setGroupSurface(group, surface) {
                    const artwork = get().artwork;
                    if (!artwork?.groups[group]) return;
                    const groups = [...artwork.groups];
                    groups[group] = {
                        ...groups[group],
                        surface,
                        surfaceChosen: true,
                    };
                    set({ artwork: { ...artwork, groups } });
                },

                setMatchMode(mode) {
                    set({ matchMode: mode });
                },

                setMeta(patch) {
                    set({ meta: { ...get().meta, ...patch } });
                },

                setThumbnailCapture(fn) {
                    capture = fn;
                },

                async commit() {
                    if (addBlocker(get()) !== null) return;
                    if (get().model) await commitModel();
                    else await commitArtwork();
                },

                async cancelRunning() {
                    const session = get().session;
                    if (!session) return;
                    await client.cancel({ sessionId: session.sessionId });
                },

                close() {
                    if (closed) return;
                    freeSession();
                    closed = true;
                    set({ phase: "closed", progress: null });
                    options.onClose?.();
                },
            };
        },
    );
}
