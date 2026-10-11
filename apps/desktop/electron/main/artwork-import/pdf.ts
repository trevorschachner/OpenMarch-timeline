/**
 * The PDF seam. The `sharp` build the app ships (libvips with librsvg, no
 * PDFium or poppler) reads SVG but not PDF, so PDF pages need a renderer
 * that isn't in the app yet. Choosing one is a new dependency, which the
 * spec doesn't name; until it is chosen, PDF imports are refused with
 * `pdf-unavailable` and the rest of the PDF path (page picker, one Artwork
 * per page, page size as the physical size, "vector" DPI) runs against
 * whatever implements this interface.
 */
// cspell:words librsvg PDFium poppler

export interface PdfPageInfo {
    /** The page's displayed size in PDF points (1/72 in), after /Rotate. */
    readonly widthPt: number;
    readonly heightPt: number;
}

export interface PdfDocument {
    readonly pages: readonly PdfPageInfo[];
    /**
     * Renders one page (0-based) at exactly `width` × `height` pixels, as any
     * image `sharp` reads (PNG is simplest), transparent where the page is.
     */
    renderPage(
        index: number,
        size: { width: number; height: number },
    ): Promise<Uint8Array>;
    close?(): Promise<void> | void;
}

export interface PdfRenderer {
    /** Throws for a PDF it can't open (corrupt, encrypted). */
    open(bytes: Uint8Array): Promise<PdfDocument>;
}
