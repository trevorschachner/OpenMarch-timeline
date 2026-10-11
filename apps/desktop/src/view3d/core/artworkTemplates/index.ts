/**
 * Artwork template downloads (docs/3d/props-spec.md §3 "Artwork size and
 * templates", ADR 0002 D-16, package C1.12): PNG, SVG and PDF at size for
 * every surface kind. Safe to import from the renderer and from main.
 */
import { layoutTemplate } from "./layout";
import { templatePdf } from "./pdf";
import { resolveTemplate, type TemplatePolicy } from "./policy";
import { templatePng, type PngOptions } from "./png";
import { templateSvg } from "./svg";
import type { TemplateSurface } from "./surfaces";

export * from "./surfaces";
export * from "./uniformPanels";
export * from "./policy";
export * from "./layout";
export * from "./svg";
export * from "./pdf";
export * from "./png";

export interface TemplateFile {
    readonly name: string;
    readonly mimeType: string;
    readonly data: string | Uint8Array;
}

/** A surface's template as SVG, PDF and PNG, named after the surface. */
export function artworkTemplateFiles(
    surface: TemplateSurface,
    policy: TemplatePolicy,
    png: PngOptions,
): TemplateFile[] {
    const drawing = layoutTemplate(resolveTemplate(surface, policy));
    return [
        {
            name: `${surface.id}.svg`,
            mimeType: "image/svg+xml",
            data: templateSvg(drawing),
        },
        {
            name: `${surface.id}.pdf`,
            mimeType: "application/pdf",
            data: templatePdf(drawing),
        },
        {
            name: `${surface.id}.png`,
            mimeType: "image/png",
            data: templatePng(drawing, png),
        },
    ];
}
