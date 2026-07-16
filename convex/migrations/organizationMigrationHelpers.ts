import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeEmail } from "../staff/service";

type MigrationCtx = Pick<MutationCtx, "db">;

export function normalizeMigrationEmail(email: string) {
  return normalizeEmail(email).normalize("NFKC");
}

export function normalizeMigrationName(name: string) {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ja-JP");
}

export async function recordOrganizationMigrationConflict(
  ctx: MigrationCtx,
  args: {
    organizationId?: Id<"organizations">;
    sourceType: "shop" | "shopMember" | "staff";
    sourceId: string;
    code: string;
  },
) {
  const existing = await ctx.db
    .query("organizationMigrationConflicts")
    .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
      q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId).eq("code", args.code),
    )
    .first();
  if (existing) {
    if (existing.organizationId !== args.organizationId || existing.resolvedAt !== undefined) {
      await ctx.db.patch(existing._id, {
        organizationId: args.organizationId,
        resolvedAt: undefined,
      });
    }
    return existing._id;
  }

  return await ctx.db.insert("organizationMigrationConflicts", {
    organizationId: args.organizationId,
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    code: args.code,
    createdAt: Date.now(),
  });
}

/** canonical linkまで修復できたsourceについて、未解消のmigration conflictだけを完了扱いにする。 */
export async function resolveOrganizationMigrationConflicts(
  ctx: MigrationCtx,
  args: {
    sourceType: "shop" | "shopMember" | "staff";
    sourceId: string;
    codes?: readonly string[];
    resolvedAt?: number;
  },
) {
  const conflicts = await ctx.db
    .query("organizationMigrationConflicts")
    .withIndex("by_sourceType_and_sourceId_and_code", (q) =>
      q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId),
    )
    .collect();
  const resolvedAt = args.resolvedAt ?? Date.now();
  for (const conflict of conflicts) {
    if (args.codes && !args.codes.includes(conflict.code)) continue;
    if (conflict.resolvedAt === undefined) await ctx.db.patch(conflict._id, { resolvedAt });
  }
}
