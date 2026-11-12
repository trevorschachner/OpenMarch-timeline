// @vitest-environment node
import { describe, expect, it } from "vitest";
import { pitVariant } from "@/view3d/core/pit/catalog";
import { newEquipment, nextEquipmentName } from "../newEquipment";

describe("nextEquipmentName", () => {
    it("numbers the first of a kind 1", () => {
        expect(nextEquipmentName("Marimba", [])).toBe("Marimba 1");
        expect(nextEquipmentName("Marimba", [null, "Riser"])).toBe("Marimba 1");
    });

    it("numbers past the highest of that kind, not the count", () => {
        expect(
            nextEquipmentName("Marimba", [
                "Marimba 1",
                "Marimba 3",
                "Vibraphone 7",
            ]),
        ).toBe("Marimba 4");
    });

    it("ignores names that only start the same", () => {
        expect(
            nextEquipmentName("Gong", ["Gong stand 9", "Gong 2b", "gong 5"]),
        ).toBe("Gong 1");
    });

    it("reads a name with pattern characters literally", () => {
        expect(
            nextEquipmentName("Drum set (cage)", ["Drum set (cage) 2"]),
        ).toBe("Drum set (cage) 3");
    });
});

describe("newEquipment", () => {
    it("makes a locked equipment item with the model's footprint, centered where it was placed", () => {
        const marimba = pitVariant("pit/marimba-5.0")!;
        expect(
            newEquipment({
                variant: marimba,
                name: "Marimba 2",
                home: [100, 60],
                beatId: 12,
            }),
        ).toEqual({
            kind: "equipment",
            name: "Marimba 2",
            model: "pit/marimba-5.0",
            locked: true,
            home: [100, 60],
            beatId: 12,
            geometry: {
                outlineType: "rectangle",
                width: marimba.footprint.width,
                depth: marimba.footprint.depth,
                height: marimba.footprint.height,
            },
        });
    });
});
