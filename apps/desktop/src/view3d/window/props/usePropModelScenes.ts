/**
 * The imported models the show's props point at, loaded for the 3D View: each GLB read from the
 * show by its content hash and parsed once with bare `GLTFLoader` (no decoders: the import
 * already decoded Draco and meshopt, ADR 0010 D-13). A model that hasn't loaded, or can't, is
 * left out, so its prop keeps drawing as a block.
 */
import { useMemo } from "react";
import {
    useQueries,
    useQuery,
    type UseQueryResult,
} from "@tanstack/react-query";
import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { db } from "@/global/database/db";
import { getLibraryBlob, type PropModel } from "@/db-functions";
import { propModelsQueryOptions } from "@/hooks/queries/useItems";

/** A model ready to place: its scene (shared, clone it per prop) and its bounds. */
export interface LoadedPropModel {
    model: PropModel;
    scene: Group;
}

const NO_MODELS: PropModel[] = [];

/**
 * Parsed scenes by GLB hash. Content-addressed, so a refetch (the editor can invalidate every
 * query at once) hands back the same scene instead of parsing it again.
 */
const scenes = new Map<string, Promise<Group>>();

function loadScene(glbHash: string): Promise<Group> {
    let scene = scenes.get(glbHash);
    if (!scene) {
        scene = parseScene(glbHash);
        scenes.set(glbHash, scene);
        // A failed read can be tried again later
        scene.catch(() => scenes.delete(glbHash));
    }
    return scene;
}

async function parseScene(glbHash: string): Promise<Group> {
    const bytes = await getLibraryBlob({ db, hash: glbHash });
    if (!bytes) throw new Error(`The show has no model ${glbHash}`);
    const buffer = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    return gltf.scene;
}

/** Loaded models by Version hash, from the models and their scene queries in the same order. */
export function _combinePropModelScenes(
    models: readonly PropModel[],
    results: readonly UseQueryResult<Group>[],
): Map<string, LoadedPropModel> {
    const loaded = new Map<string, LoadedPropModel>();
    models.forEach((model, i) => {
        const scene = results[i]?.data;
        if (scene) loaded.set(model.versionHash, { model, scene });
    });
    return loaded;
}

export function usePropModelScenes(): Map<string, LoadedPropModel> {
    const { data: models = NO_MODELS } = useQuery(propModelsQueryOptions());
    const results = useQueries({
        queries: models.map((model) => ({
            // Content-addressed: the same hash is always the same model
            queryKey: ["library_blobs", "scene", model.glbHash] as const,
            queryFn: () => loadScene(model.glbHash),
            staleTime: Infinity,
            retry: false,
        })),
    });
    // A new map only when a model or a loaded scene changes
    const loadedKey = results.map((r) => r.dataUpdatedAt).join(",");
    return useMemo(
        () => _combinePropModelScenes(models, results),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [models, loadedKey],
    );
}
