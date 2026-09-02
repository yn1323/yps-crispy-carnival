import { runToCompletion } from "@convex-dev/migrations";
import migrationsComponent from "@convex-dev/migrations/test";
import { defineSchema, type WithoutSystemFields } from "convex/server";
import { convexTest } from "convex-test";
import { components } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { modules, schema } from "./setup.test-helper";

type CurrentStaffInsert = WithoutSystemFields<Doc<"staffs">>;
type NarrowedStaffField = "emailNormalized" | "excludedFromShift" | "organizationId" | "organizationPersonId";
type LegacyStaffDocumentForMigrationHistory = Omit<CurrentStaffInsert, NarrowedStaffField> &
  Partial<Pick<CurrentStaffInsert, NarrowedStaffField>>;

export function createConvexTestWithMigrations() {
  const t = convexTest(schema, modules);
  migrationsComponent.register(t);
  return t;
}

/** Narrow後も旧shapeを投入して履歴migrationだけを検証する。index定義は現行schemaを使う。 */
export function createMigrationHistoryTestWithMigrations() {
  const migrationHistorySchema = defineSchema(schema.tables, { schemaValidation: false });
  const t = convexTest(migrationHistorySchema, modules);
  migrationsComponent.register(t);
  return t;
}

/** schema validation無効のmigration履歴testで、旧staff shapeを投入する時だけ使う。 */
export function legacyStaffDocumentForMigrationHistory(
  document: LegacyStaffDocumentForMigrationHistory,
): CurrentStaffInsert {
  return document as CurrentStaffInsert;
}

export async function runMigrationToCompletion(
  t: ReturnType<typeof createConvexTestWithMigrations>,
  migration: Parameters<typeof runToCompletion>[2],
  options?: Parameters<typeof runToCompletion>[3],
) {
  return await t.run(async (ctx) => await runToCompletion(ctx, components.migrations, migration, options));
}
