import {
    act,
    cleanup,
    fireEvent,
    screen,
    waitFor,
    within,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, vi } from "vitest";
import { useEffect } from "react";
import { describeDbTests, schema, type DbConnection } from "@/test/base";
import { harnessQueryClient, setUpFeature } from "@/test/featureHarness";
import tolgee from "@/global/singletons/Tolgee";
import { stopTimelineResolver } from "@/timeline/timelineStore";
import { createItems, getItemGeometry, getItems } from "@/db-functions/items";
import { performUndo } from "@/db-functions/history";
import { useItemDrawingStore } from "@/stores/ItemDrawingStore";
import { usePropDrawn } from "@/field/fieldPropTool";
import { pitVariant } from "@/view3d/core/pit/catalog";
import type { DrawnOutline } from "@/items/itemOutlines";
import { PropEditContents, PropListContents } from "../PropsModal";

/**
 * The Props panel's Front ensemble (instruments.md §6): equipment is picked as a family, then a
 * variant, placed with a click as a locked item with its model's footprint, and edited as props
 * are, with its variant and lock.
 */

const app = vi.hoisted(() => ({ client: (): unknown => null }));
vi.mock("@/App", () => ({
    get queryClient() {
        return app.client();
    },
}));
app.client = harnessQueryClient;

beforeAll(async () => {
    await tolgee.run();
    // jsdom has no layout: Radix Select scrolls its chosen option into view
    Element.prototype.scrollIntoView ??= () => {};
});

afterEach(() => {
    cleanup();
    stopTimelineResolver();
    useItemDrawingStore.getState().resetDrawingState();
    vi.restoreAllMocks();
});

const PAGE = 1;

/** The field's `propDrawn` port, as `ThreeField` gets it */
const port: { drawn: ((outline: DrawnOutline) => void) | null } = {
    drawn: null,
};
function FieldPort() {
    const drawn = usePropDrawn();
    useEffect(() => {
        port.drawn = drawn;
    }, [drawn]);
    return null;
}

const marimba = (beatId: number) => ({
    kind: "equipment" as const,
    name: "Marimba 1",
    model: "pit/marimba-5.0",
    home: [40, 40] as [number, number],
    beatId,
    geometry: {
        outlineType: "rectangle" as const,
        ...pitVariant("pit/marimba-5.0")!.footprint,
    },
});

/** The first beat: on field from the start */
const firstBeatId = async (db: DbConnection) =>
    (await db
        .select({ id: schema.beats.id })
        .from(schema.beats)
        .orderBy(schema.beats.position)
        .get())!.id;

describeDbTests("Props panel front ensemble", (it) => {
    it("picks a family, then a variant, and places it as a locked, numbered item with the model's footprint", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        await setUpFeature(
            <>
                <PropListContents />
                <FieldPort />
            </>,
            PAGE,
            [],
        );
        const ensemble = screen.getByRole("region", {
            name: "Front ensemble",
        });
        fireEvent.click(
            within(ensemble).getByRole("button", { name: /Marimba/ }),
        );
        // The default is marked; the variants show their footprints
        const rosewood5 = within(ensemble).getByRole("button", {
            name: /5\.0 octaves · Rosewood.*Default/,
        });
        expect(rosewood5).toHaveTextContent("2.54 × 1.21 m");
        fireEvent.click(
            within(ensemble).getByRole("button", {
                name: /4\.3 octaves · Black synthetic/,
            }),
        );
        const { placing, drawingMode } = useItemDrawingStore.getState();
        expect(drawingMode).toBe("rectangle");
        expect(placing).toMatchObject({
            baseName: "Marimba",
            variant: { modelId: "pit/marimba-4.3-synthetic-black" },
        });

        // A click on the field
        act(() =>
            port.drawn!({
                outlineType: "rectangle",
                centerX: 300,
                centerY: 200,
                widthPixels: 1,
                depthPixels: 1,
            }),
        );
        expect(useItemDrawingStore.getState().placing).toBeNull();
        await waitFor(async () =>
            expect(await getItems({ db })).toHaveLength(1),
        );
        const [item] = await getItems({ db });
        expect(item).toMatchObject({
            kind: "equipment",
            model: "pit/marimba-4.3-synthetic-black",
            locked: true,
            marcher: { name: "Marimba 1" },
        });
        const [geometry] = await getItemGeometry({ db });
        expect(geometry).toMatchObject({
            outline_type: "rectangle",
            ...pitVariant("pit/marimba-4.3-synthetic-black")!.footprint,
        });
        // The list shows it, locked
        expect(
            await screen.findByRole("img", { name: "Locked" }),
        ).toBeInTheDocument();
        expect(screen.getByText("Marimba 1")).toBeInTheDocument();
    });

    it("places a family with one model straight from the list, numbered after the others", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        await createItems({
            db,
            newItems: [
                {
                    ...marimba(await firstBeatId(db)),
                    name: "Chimes 4",
                    model: "pit/chimes",
                },
            ],
        });
        await setUpFeature(
            <>
                <PropListContents />
                <FieldPort />
            </>,
            PAGE,
            [],
        );
        await screen.findByText("Chimes 4");
        const ensemble = screen.getByRole("region", {
            name: "Front ensemble",
        });
        // Folded once the show has equipment, so the list stays in view
        expect(
            within(ensemble).queryByRole("button", { name: "Chimes" }),
        ).toBeNull();
        fireEvent.click(
            within(ensemble).getByRole("button", { name: /Front ensemble/ }),
        );
        fireEvent.click(
            within(ensemble).getByRole("button", { name: "Chimes" }),
        );
        expect(useItemDrawingStore.getState().placing?.variant.modelId).toBe(
            "pit/chimes",
        );
        act(() =>
            port.drawn!({
                outlineType: "rectangle",
                centerX: 0,
                centerY: 0,
                widthPixels: 1,
                depthPixels: 1,
            }),
        );
        await waitFor(async () =>
            expect((await getItems({ db })).map((i) => i.marcher.name)).toEqual(
                ["Chimes 4", "Chimes 5"],
            ),
        );
    });

    it("changes the variant within the family, resizing it, in one undo step", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        const [item] = await createItems({
            db,
            newItems: [marimba(await firstBeatId(db))],
        });
        await setUpFeature(<PropEditContents itemId={item.id} />, PAGE, []);
        // The compact select is named by its value
        expect(await screen.findByText("Marimba model")).toBeInTheDocument();
        const trigger = screen.getByRole("combobox", {
            name: "5.0 octaves · Rosewood",
        });
        fireEvent.click(trigger);
        const options = await screen.findAllByRole("option");
        // Only marimbas
        expect(options).toHaveLength(6);
        expect(options.map((o) => o.textContent)).toContain(
            "4.6 octaves · Rosewood",
        );
        fireEvent.click(
            options.find((o) => o.textContent === "4.6 octaves · Rosewood")!,
        );

        const smaller = pitVariant("pit/marimba-4.6")!.footprint;
        await waitFor(async () =>
            expect((await getItems({ db }))[0].model).toBe("pit/marimba-4.6"),
        );
        expect((await getItemGeometry({ db }))[0]).toMatchObject(smaller);

        await performUndo(db);
        expect((await getItems({ db }))[0].model).toBe("pit/marimba-5.0");
        expect((await getItemGeometry({ db }))[0]).toMatchObject(
            pitVariant("pit/marimba-5.0")!.footprint,
        );
    });

    it("locks and unlocks any item, each in one undo step", async ({
        db,
        marchersAndPages,
    }) => {
        expect(marchersAndPages).toBeDefined();
        const beatId = await firstBeatId(db);
        const [prop] = await createItems({
            db,
            newItems: [
                {
                    kind: "prop",
                    name: "Riser",
                    surfaceType: "platform",
                    home: [40, 40],
                    beatId,
                    geometry: {
                        outlineType: "rectangle",
                        width: 2,
                        depth: 1,
                        height: 0.4,
                    },
                },
            ],
        });
        await setUpFeature(<PropEditContents itemId={prop.id} />, PAGE, []);
        const lock = await screen.findByRole("switch", { name: "Locked" });
        expect(lock).not.toBeChecked();
        // A prop has no model to pick
        expect(screen.queryByText(/model/)).toBeNull();

        fireEvent.click(lock);
        await waitFor(async () =>
            expect((await getItems({ db }))[0].locked).toBe(true),
        );
        await waitFor(() =>
            expect(
                screen.getByRole("switch", { name: "Locked" }),
            ).toBeChecked(),
        );
        fireEvent.click(screen.getByRole("switch", { name: "Locked" }));
        await waitFor(async () =>
            expect((await getItems({ db }))[0].locked).toBe(false),
        );
        await performUndo(db);
        expect((await getItems({ db }))[0].locked).toBe(true);
    });
});
