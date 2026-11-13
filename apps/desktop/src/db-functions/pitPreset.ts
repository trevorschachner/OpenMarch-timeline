/**
 * Applying a front ensemble preset (instruments.md section 6, "Presets") to the show, in one
 * undo step: its equipment, locked, and the performers who play it.
 *
 * - Re-applying replaces only the items the previous preset created, the ones with
 *   `items.from_preset` set. Renaming or moving one keeps the mark, deleting it drops it, and
 *   undo restores it with the row. Hand-added items and performers are never removed.
 * - Performers are skipped when the show already has them: a section that has N of the preset's
 *   M players gets M - N more, on the spots none of that section stands on. Existing performers
 *   don't move.
 */
import { eq, inArray, sql } from "drizzle-orm";
import type { XY } from "@openmarch/core";
import { schema } from "@/global/database/db";
import { getSectionObjectByName } from "@/global/classes/Sections";
import { newEquipment, nextEquipmentName } from "@/items/newEquipment";
import type { PitVariant } from "@/view3d/core/pit/catalog";
import type { DbConnection, DbTransaction } from "./types";
import { transactionWithHistory } from "./history";
import { createItemsInTransaction, type DatabaseItem } from "./items";
import { createMarchersInTransaction } from "./marcher";
import { updateMarcherHomesInTransaction } from "./marcherHome";
import { removeDeletedMarchersFromTimelinesInTransaction } from "./timelineMarchers";
import { deleteEmptyRecipes, hasShapeRecipes } from "./shapeRecipes";

/** A piece of equipment a preset places, on the canvas */
export interface PitPresetEquipmentArgs {
    variant: PitVariant;
    /** Its family's name; the item is named "<base name> <n>" */
    baseName: string;
    /** Its center, `[x, y]` in canvas coordinates */
    home: XY;
    /** Degrees */
    rotation: number;
}

/** A performer a preset adds, on the canvas */
export interface PitPresetPerformerArgs {
    /** The section's name (`Drum Set`) */
    section: string;
    /** Where they stand, `[x, y]` in canvas coordinates */
    home: XY;
}

type DatabaseMarcher = typeof schema.marchers.$inferSelect;

/**
 * The planned performers the show lacks: per section, as many as the plan has more than the show,
 * on the spots no performer of that section stands within `reach` of first, in plan order.
 */
export function performersToAdd<T extends PitPresetPerformerArgs>(
    planned: readonly T[],
    existing: readonly PitPresetPerformerArgs[],
    reach: number,
): T[] {
    const near = (a: XY, b: XY) =>
        Math.hypot(a[0] - b[0], a[1] - b[1]) <= reach;
    const chosen = new Set<T>();
    for (const section of new Set(planned.map((p) => p.section))) {
        const spots = planned.filter((p) => p.section === section);
        const others = existing.filter((p) => p.section === section);
        const missing = spots.length - others.length;
        if (missing <= 0) continue;
        const taken = (spot: T) =>
            others.some((other) => near(other.home, spot.home));
        const ordered = [
            ...spots.filter((s) => !taken(s)),
            ...spots.filter(taken),
        ];
        for (const spot of ordered.slice(0, missing)) chosen.add(spot);
    }
    return planned.filter((p) => chosen.has(p));
}

/** Removes the items the previous preset created, returning their marchers row ids */
async function removePresetItemsInTransaction(
    tx: DbTransaction,
): Promise<number[]> {
    const ids = (
        await tx
            .select({ id: schema.items.marcher_id })
            .from(schema.items)
            .where(eq(schema.items.from_preset, true))
            .all()
    ).map((row) => row.id);
    if (ids.length === 0) return ids;
    // As `deleteMarchers` does: their moves first, then the rows; items and Outlines cascade
    await removeDeletedMarchersFromTimelinesInTransaction({
        tx,
        marcherIds: ids,
    });
    await tx
        .delete(schema.marchers)
        .where(inArray(schema.marchers.id, ids))
        .run();
    if (await hasShapeRecipes(tx)) await deleteEmptyRecipes(tx);
    return ids;
}

/** Each section's next drill order: one past its prefix's highest */
async function drillOrdersInTransaction(
    tx: DbTransaction,
    sections: readonly string[],
): Promise<{ section: string; drill_prefix: string; drill_order: number }[]> {
    const next = new Map<string, number>();
    const result = [];
    for (const section of sections) {
        const prefix = getSectionObjectByName(section).prefix;
        if (!next.has(prefix)) {
            const row = await tx
                .select({
                    max: sql<number>`coalesce(max(${schema.marchers.drill_order}), 0)`,
                })
                .from(schema.marchers)
                .where(eq(schema.marchers.drill_prefix, prefix))
                .get();
            next.set(prefix, (row?.max ?? 0) + 1);
        }
        const order = next.get(prefix)!;
        next.set(prefix, order + 1);
        result.push({ section, drill_prefix: prefix, drill_order: order });
    }
    return result;
}

export interface ApplyPitPresetArgs {
    /** The beat its equipment is on field from: the show's first, so it is there all show */
    beatId: number;
    equipment: readonly PitPresetEquipmentArgs[];
    /** The performers to add if missing; none to add no performers */
    performers: readonly PitPresetPerformerArgs[];
    /** How near, in canvas units, a performer must stand to a spot to be on it */
    performerReach: number;
}

export interface AppliedPitPreset {
    items: DatabaseItem[];
    performers: DatabaseMarcher[];
    /** The marchers rows of the previous preset's items it replaced */
    removedMarcherIds: number[];
}

/** Applies a preset: removes the previous preset's items, adds this one's and its performers */
export async function applyPitPresetInTransaction({
    tx,
    beatId,
    equipment,
    performers,
    performerReach,
}: ApplyPitPresetArgs & { tx: DbTransaction }): Promise<AppliedPitPreset> {
    const removedMarcherIds = await removePresetItemsInTransaction(tx);

    const names: (string | null)[] = (
        await tx
            .select({ name: schema.marchers.name })
            .from(schema.marchers)
            .where(eq(schema.marchers.type, "item"))
            .all()
    ).map((row) => row.name);
    const newItems = equipment.map(({ variant, baseName, home, rotation }) => {
        const name = nextEquipmentName(baseName, names);
        names.push(name);
        return {
            ...newEquipment({ variant, name, home, beatId, rotation }),
            fromPreset: true,
        };
    });
    const items = await createItemsInTransaction({ tx, newItems });

    const existing = (
        await tx
            .select()
            .from(schema.marchers)
            .where(eq(schema.marchers.type, "marcher"))
            .all()
    ).map((m) => ({
        section: m.section,
        home: [m.home_x, m.home_y] as XY,
    }));
    const adding = performersToAdd(performers, existing, performerReach);
    const created = await createMarchersInTransaction({
        tx,
        newMarchers: await drillOrdersInTransaction(
            tx,
            adding.map((p) => p.section),
        ),
    });
    if (created.length > 0)
        await updateMarcherHomesInTransaction({
            tx,
            modifiedHomes: created.map((m, i) => ({
                marcherId: m.id,
                home: adding[i].home,
            })),
        });
    const createdPerformers =
        created.length === 0
            ? []
            : await tx
                  .select()
                  .from(schema.marchers)
                  .where(
                      inArray(
                          schema.marchers.id,
                          created.map((m) => m.id),
                      ),
                  )
                  .all();

    return { items, performers: createdPerformers, removedMarcherIds };
}

/** {@link applyPitPresetInTransaction} as one undo step */
export async function applyPitPreset({
    db,
    ...args
}: ApplyPitPresetArgs & { db: DbConnection }): Promise<AppliedPitPreset> {
    return transactionWithHistory(db, "applyPitPreset", (tx) =>
        applyPitPresetInTransaction({ tx, ...args }),
    );
}
