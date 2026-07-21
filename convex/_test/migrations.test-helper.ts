import { runToCompletion } from "@convex-dev/migrations";
import migrationsComponent from "@convex-dev/migrations/test";
import { convexTest } from "convex-test";
import { components } from "../_generated/api";
import { modules, schema } from "./setup.test-helper";

export function createConvexTestWithMigrations() {
  const t = convexTest(schema, modules);
  migrationsComponent.register(t);
  return t;
}

export async function runMigrationToCompletion(
  t: ReturnType<typeof createConvexTestWithMigrations>,
  migration: Parameters<typeof runToCompletion>[2],
  options?: Parameters<typeof runToCompletion>[3],
) {
  return await t.run(async (ctx) => await runToCompletion(ctx, components.migrations, migration, options));
}
