/**
 * Reading a picked `.glb` or `.gltf` into its raw JSON and resources, before
 * anything interprets it. Names and `extras` are read from this raw JSON, not
 * from three's sanitized `Object3D.name` (props-spec.md section 2).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ModelFileInput } from "./types";

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"

/** A glTF JSON document, loosely typed: it hasn't been validated yet. */
export type RawGltf = Record<string, unknown> & {
    asset?: { generator?: unknown; copyright?: unknown; version?: unknown };
    extensionsUsed?: unknown;
    extensionsRequired?: unknown;
    scene?: unknown;
    scenes?: unknown;
    nodes?: unknown;
    meshes?: unknown;
    materials?: unknown;
    buffers?: unknown;
    images?: unknown;
};

export interface ParsedContainer {
    format: "glb" | "gltf";
    json: RawGltf;
}

export class ContainerError extends Error {
    constructor(
        readonly code: "unreadable" | "missingResource" | "externalUri",
        message: string,
        readonly uri?: string,
    ) {
        super(message);
        this.name = "ContainerError";
    }
}

export function isGlb(bytes: Uint8Array): boolean {
    if (bytes.byteLength < 12) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(0, true) === GLB_MAGIC;
}

/** Reads the JSON of a GLB or a `.gltf`, throwing `ContainerError` if neither. */
export function parseContainer(bytes: Uint8Array): ParsedContainer {
    if (isGlb(bytes)) {
        const view = new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength,
        );
        if (bytes.byteLength < 20) {
            throw new ContainerError("unreadable", "GLB too short");
        }
        const length = view.getUint32(12, true);
        const type = view.getUint32(16, true);
        if (type !== CHUNK_JSON || 20 + length > bytes.byteLength) {
            throw new ContainerError("unreadable", "GLB has no JSON chunk");
        }
        return {
            format: "glb",
            json: parseJson(bytes.subarray(20, 20 + length)),
        };
    }
    return { format: "gltf", json: parseJson(bytes) };
}

function parseJson(bytes: Uint8Array): RawGltf {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new ContainerError("unreadable", "not a GLB or glTF JSON file");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContainerError("unreadable", "glTF JSON is not an object");
    }
    return value as RawGltf;
}

/** The URIs of buffers and images that aren't `data:` URIs. */
export function externalUris(json: RawGltf): string[] {
    const uris = new Set<string>();
    for (const list of [json.buffers, json.images]) {
        if (!Array.isArray(list)) continue;
        for (const entry of list) {
            const uri = (entry as { uri?: unknown } | null)?.uri;
            if (typeof uri === "string" && !uri.startsWith("data:")) {
                uris.add(uri);
            }
        }
    }
    return [...uris];
}

/**
 * Only relative file URIs are followed. Anything with a scheme (http, file,
 * …) or an absolute path is refused: the import makes no network requests
 * and reads only beside the picked file.
 */
export function isRelativeFileUri(uri: string): boolean {
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(uri)) return false;
    if (uri.startsWith("/") || uri.startsWith("\\")) return false;
    return true;
}

/** Throws when a `.gltf` names a resource that wasn't supplied. */
export function checkResources(
    json: RawGltf,
    resources: Readonly<Record<string, Uint8Array>>,
): void {
    for (const uri of externalUris(json)) {
        if (!isRelativeFileUri(uri)) {
            throw new ContainerError(
                "externalUri",
                `refusing non-relative URI ${uri}`,
                uri,
            );
        }
        if (!(uri in resources)) {
            throw new ContainerError(
                "missingResource",
                `missing resource ${uri}`,
                uri,
            );
        }
    }
}

/**
 * Reads a picked file from disk, with a `.gltf`'s relative resources from
 * beside it. Resources that can't be read are left out, so the pipeline
 * reports them as missing.
 */
export async function readModelFile(filePath: string): Promise<ModelFileInput> {
    const bytes = new Uint8Array(await readFile(filePath));
    const input: ModelFileInput = {
        filename: path.basename(filePath),
        bytes,
    };
    if (isGlb(bytes)) return input;
    let json: RawGltf;
    try {
        json = parseContainer(bytes).json;
    } catch {
        return input;
    }
    const dir = path.dirname(filePath);
    const resources: Record<string, Uint8Array> = {};
    for (const uri of externalUris(json)) {
        if (!isRelativeFileUri(uri)) continue;
        try {
            resources[uri] = new Uint8Array(
                await readFile(path.join(dir, decodeURIComponent(uri))),
            );
        } catch {
            // Reported as missingResource by the pipeline.
        }
    }
    return { ...input, resources };
}

/**
 * The original as one file, for the local Library's `source` (kept outside
 * the Version hash). A GLB is kept as is; a `.gltf` gets its resources
 * inlined as `data:` URIs so nothing is lost.
 */
export function sourceFileOf(input: ModelFileInput): {
    filename: string;
    bytes: Uint8Array;
} {
    if (isGlb(input.bytes) || !input.resources) {
        return { filename: input.filename, bytes: input.bytes };
    }
    const json = structuredClone(parseContainer(input.bytes).json);
    for (const list of [json.buffers, json.images]) {
        if (!Array.isArray(list)) continue;
        for (const entry of list as { uri?: unknown; mimeType?: unknown }[]) {
            const uri = entry?.uri;
            if (typeof uri !== "string" || uri.startsWith("data:")) continue;
            const data = input.resources[uri];
            if (!data) continue;
            const mime =
                typeof entry.mimeType === "string"
                    ? entry.mimeType
                    : mimeFromUri(uri);
            entry.uri = `data:${mime};base64,${Buffer.from(data).toString("base64")}`;
        }
    }
    return {
        filename: input.filename,
        bytes: new TextEncoder().encode(JSON.stringify(json)),
    };
}

function mimeFromUri(uri: string): string {
    const ext = uri.split(/[?#]/)[0].split(".").pop()?.toLowerCase();
    switch (ext) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        case "webp":
            return "image/webp";
        default:
            return "application/octet-stream";
    }
}
