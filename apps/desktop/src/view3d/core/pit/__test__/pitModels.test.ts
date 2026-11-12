import { describe, expect, it } from "vitest";
import {
    PIT_MANIFEST,
    PIT_NEAR_M,
    PIT_FAR_M,
    hidesVenuePodium,
    isNearPitItem,
    isPodiumModel,
    pitAssetFile,
    pitModelName,
    podiumStandTop,
    writePitModelMatrix,
    type PitManifest,
} from "../pitModels";

const entry = (height: number, more: object = {}) => ({
    high: { sizeM: { width: 1, depth: 1, height } },
    low: { sizeM: { width: 1, depth: 1, height } },
    ...more,
});

const MANIFEST: PitManifest = {
    "marimba-5.0": entry(0.9),
    "conductor-podium": entry(1.386),
    "conductor-tower": entry(3, { standTopM: 2.4 }),
};

describe("pitModelName", () => {
    it("is the asset name of a built-in pit model id", () => {
        expect(pitModelName("pit/marimba-5.0", MANIFEST)).toBe("marimba-5.0");
    });

    it("is null for no model, another library, or a model the manifest doesn't list", () => {
        expect(pitModelName(null, MANIFEST)).toBeNull();
        expect(pitModelName(undefined, MANIFEST)).toBeNull();
        expect(pitModelName("", MANIFEST)).toBeNull();
        expect(pitModelName("marimba-5.0", MANIFEST)).toBeNull();
        expect(pitModelName("lib/marimba-5.0", MANIFEST)).toBeNull();
        expect(pitModelName("pit/marimba-9.9", MANIFEST)).toBeNull();
        expect(pitModelName("pit/../marimba-5.0", MANIFEST)).toBeNull();
    });

    it("knows every model the shipped manifest lists", () => {
        expect(Object.keys(PIT_MANIFEST).length).toBeGreaterThanOrEqual(44);
        expect(pitModelName("pit/marimba-5.0")).toBe("marimba-5.0");
        expect(pitModelName("pit/conductor-podium")).toBe("conductor-podium");
    });
});

describe("pitAssetFile", () => {
    it("is the model's file, with -low for the distant version", () => {
        expect(pitAssetFile("marimba-5.0", "high")).toBe("marimba-5.0.glb");
        expect(pitAssetFile("marimba-5.0", "low")).toBe("marimba-5.0-low.glb");
    });
});

describe("isPodiumModel", () => {
    it("is a model whose id names a podium, tower, scaffold or stepladder", () => {
        expect(isPodiumModel("pit/conductor-podium")).toBe(true);
        expect(isPodiumModel("pit/conductor-podium-tall")).toBe(true);
        expect(isPodiumModel("pit/director-tower")).toBe(true);
        expect(isPodiumModel("pit/scaffold-6ft")).toBe(true);
        expect(isPodiumModel("pit/stepladder")).toBe(true);
        expect(isPodiumModel("pit/marimba-5.0")).toBe(false);
        expect(isPodiumModel("pit/speaker-tall")).toBe(false);
        expect(isPodiumModel(null)).toBe(false);
    });
});

describe("podiumStandTop", () => {
    it("reads standTopM when the manifest gives one", () => {
        expect(podiumStandTop("pit/conductor-tower", MANIFEST)).toBe(2.4);
    });

    it("falls back to the detailed model's height", () => {
        expect(podiumStandTop("pit/conductor-podium", MANIFEST)).toBe(1.386);
    });

    it("is null for a model that isn't a podium or isn't listed", () => {
        expect(podiumStandTop("pit/marimba-5.0", MANIFEST)).toBeNull();
        expect(podiumStandTop("pit/missing-podium", MANIFEST)).toBeNull();
        expect(podiumStandTop(null, MANIFEST)).toBeNull();
    });

    it("works for the shipped podiums", () => {
        expect(podiumStandTop("pit/conductor-podium")).toBeGreaterThan(0.5);
        expect(podiumStandTop("pit/conductor-podium-tall")).toBeGreaterThan(
            podiumStandTop("pit/conductor-podium")!,
        );
    });
});

describe("hidesVenuePodium", () => {
    const item = (id: number, model: string | null, kind = "equipment") => ({
        id,
        kind,
        model,
    });

    it("is true when the show has a podium item", () => {
        expect(
            hidesVenuePodium(
                [item(1, "pit/marimba-5.0"), item(2, "pit/conductor-podium")],
                new Set(),
                MANIFEST,
            ),
        ).toBe(true);
    });

    it("is false with no podium, or only one hidden on the field", () => {
        expect(hidesVenuePodium([], new Set(), MANIFEST)).toBe(false);
        expect(
            hidesVenuePodium(
                [item(1, "pit/marimba-5.0"), item(2, null)],
                new Set(),
                MANIFEST,
            ),
        ).toBe(false);
        expect(
            hidesVenuePodium(
                [item(2, "pit/conductor-podium")],
                new Set([2]),
                MANIFEST,
            ),
        ).toBe(false);
    });

    it("ignores a podium model id the manifest doesn't know: it draws as a block", () => {
        expect(
            hidesVenuePodium(
                [item(2, "pit/missing-podium")],
                new Set(),
                MANIFEST,
            ),
        ).toBe(false);
    });
});

describe("isNearPitItem", () => {
    const camera: [number, number, number] = [0, 1, 0];

    it("is near inside the near distance and far beyond the far one", () => {
        expect(isNearPitItem(PIT_NEAR_M - 1, 0, camera, undefined)).toBe(true);
        expect(isNearPitItem(PIT_FAR_M + 1, 0, camera, undefined)).toBe(false);
    });

    it("keeps its last detail between the two distances", () => {
        const between = (PIT_NEAR_M + PIT_FAR_M) / 2;
        expect(isNearPitItem(between, 0, camera, true)).toBe(true);
        expect(isNearPitItem(between, 0, camera, false)).toBe(false);
    });
});

describe("writePitModelMatrix", () => {
    it("stands the model at real size at the center, turned as the 2D field turns it", () => {
        const out = new Float32Array(32);
        writePitModelMatrix(out, 1, 90, { x: 3, z: -2 }, 0.5);
        const m = Array.from(out.subarray(16, 32)).map((v) =>
            Math.abs(v) < 1e-9 ? 0 : v,
        );
        // Model +X (the player's left) turns toward +Z, as the 2D turn does
        expect(m.slice(0, 3)).toEqual([0, 0, 1]);
        expect(m.slice(4, 7)).toEqual([0, 1, 0]);
        expect(m.slice(8, 11)).toEqual([-1, 0, 0]);
        expect(m.slice(12, 16)).toEqual([3, 0.5, -2, 1]);
    });

    it("leaves an unturned model as authored, +Z toward the audience", () => {
        const out = new Float32Array(16);
        writePitModelMatrix(out, 0, 0, { x: 0, z: 0 }, 0);
        expect(Array.from(out, (v) => v + 0)).toEqual([
            1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
        ]);
    });
});
