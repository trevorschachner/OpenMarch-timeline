// cspell:words resizer
/**
 * Import a 3D model for a prop: the main process's side of `prop-model:import`.
 *
 * Main picks the file and runs the import pipeline (D-13: outside the renderer's CSP); the editor
 * stores the result in the show and points the prop at it in one undoable step, since the editor
 * is the show's only writer (D-4). Nothing here touches the show file.
 */
import { dialog, nativeImage, type BrowserWindow } from "electron";
import { t } from "../i18n";
import { importModelFile } from "./pipeline";
import type { ImageResizer, ModelImportReport } from "./types";

export type PropModelImportResponse =
    | { status: "canceled" }
    /** Read but not importable, or the import itself failed: the report says why */
    | { status: "rejected"; filename: string; report: ModelImportReport | null }
    | {
          status: "ready";
          filename: string;
          report: ModelImportReport;
          /** The normalized GLB */
          glb: Uint8Array;
          /** The OpenMarch sidecar as stored: canonical JSON, UTF-8 */
          sidecar: Uint8Array;
      };

/** The open dialog's filters: glTF first, then everything. */
export const modelFileDialogFilters = () => [
    { name: t("fileDialog.filters.model3d"), extensions: ["glb", "gltf"] },
    { name: t("fileDialog.filters.allFiles"), extensions: ["*"] },
];

/**
 * Shrinks a PNG or JPEG with Electron's `nativeImage`, so the import needs no native image
 * library. Other formats (WebP, KTX2) come back null and are kept, with a note.
 */
export const nativeImageResizer: ImageResizer = async (
    image,
    mimeType,
    cap,
) => {
    if (mimeType !== "image/png" && mimeType !== "image/jpeg") return null;
    const source = nativeImage.createFromBuffer(Buffer.from(image));
    if (source.isEmpty()) return null;
    const { width, height } = source.getSize();
    const scale = Math.min(1, cap / Math.max(width, height));
    const resized = source.resize({
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        quality: "best",
    });
    return mimeType === "image/jpeg"
        ? { image: new Uint8Array(resized.toJPEG(90)), mimeType }
        : { image: new Uint8Array(resized.toPNG()), mimeType: "image/png" };
};

/** Asks for a model file and imports it as a Prop. */
export async function importPropModel(
    win: BrowserWindow,
): Promise<PropModelImportResponse> {
    const picked = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: modelFileDialogFilters(),
    });
    const filePath = picked.filePaths[0];
    if (picked.canceled || !filePath) return { status: "canceled" };
    const filename = filePath.split(/[\\/]/).pop() ?? filePath;
    try {
        const result = await importModelFile(filePath, {
            kind: "prop",
            resizeImage: nativeImageResizer,
        });
        if (result.report.status !== "ready" || !result.output)
            return { status: "rejected", filename, report: result.report };
        return {
            status: "ready",
            filename,
            report: result.report,
            glb: result.output.glb,
            sidecar: result.output.sidecarBytes,
        };
    } catch (error) {
        console.error("importPropModel: the import failed", error);
        return { status: "rejected", filename, report: null };
    }
}
