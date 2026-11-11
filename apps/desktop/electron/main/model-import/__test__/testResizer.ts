// cspell:words resizer ihdr idat iend
/**
 * An `ImageResizer` for tests: it doesn't read the image, it answers with a
 * gradient PNG of the size a real resizer would make. The app's resizer is
 * Electron's `nativeImage`, which Vitest can't load; this checks the
 * pipeline's side of the contract (sizes, MIME type, the report).
 */
import { deflateSync } from "node:zlib";
import type { ImageResizer } from "../types";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
}

/**
 * An RGB PNG of `width` × `height` with a horizontal gradient. Not one flat
 * color: `prune` drops solid textures, which would hide the resized one.
 */
export function gradientPng(width: number, height: number): Uint8Array {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // RGB
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // no filter
    for (let x = 0; x < width; x++) {
        row.fill(
            Math.round((x / Math.max(1, width - 1)) * 255),
            1 + x * 3,
            4 + x * 3,
        );
    }
    const raw = Buffer.concat(Array.from({ length: height }, () => row));
    return new Uint8Array(
        Buffer.concat([
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            chunk("IHDR", ihdr),
            chunk("IDAT", deflateSync(raw)),
            chunk("IEND", new Uint8Array()),
        ]),
    );
}

/** Reads a PNG's width and height from its IHDR. */
function pngSize(bytes: Uint8Array): [number, number] | null {
    if (bytes.length < 24) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return [view.getUint32(16), view.getUint32(20)];
}

/** Scales the longer side to `cap`, as `nativeImage.resize` is asked to. */
export const testResizer: ImageResizer = async (image, mimeType, cap) => {
    const size = mimeType === "image/png" ? pngSize(image) : null;
    if (!size) return null;
    const scale = Math.min(1, cap / Math.max(...size));
    return {
        image: gradientPng(
            Math.max(1, Math.round(size[0] * scale)),
            Math.max(1, Math.round(size[1] * scale)),
        ),
        mimeType: "image/png",
    };
};
