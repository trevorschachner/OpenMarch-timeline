/**
 * The model import pipeline (package C1.7). Main process only; no IPC here
 * (the channels are package C1.9) and no UI (the review is C1.10).
 *
 * `importModel` / `importModelFile` run the pipeline and return the import
 * report plus, when ready, the normalized GLB and sidecar.
 */
export { importModel, importModelFile } from "./pipeline";
export { readModelFile, sourceFileOf } from "./container";
export * from "./rules";
export * from "./types";
