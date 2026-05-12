import type { TestConvexForDataModelAndIdentity } from "convex-test";
import type { DataModel, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const SCENARIO_NOW = new Date("2026-05-10T00:00:00+09:00").getTime();
export const MANAGER_SUBJECT = "scenario_manager";

export type ScenarioTest = TestConvexForDataModelAndIdentity<DataModel>;

export function scenarioDate(daysFromNow: number): string {
  const d = new Date(SCENARIO_NOW + 9 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().split("T")[0];
}

export function firstPage(numItems = 20) {
  return { paginationOpts: { numItems, cursor: null } };
}

export async function seedStaff(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; name: string; email?: string; userId?: Id<"users">; isDeleted?: boolean },
) {
  return await ctx.db.insert("staffs", {
    shopId: args.shopId,
    name: args.name,
    email: args.email ?? "",
    emailNormalized: args.email?.trim().toLowerCase() ?? "",
    userId: args.userId,
    isDeleted: args.isDeleted ?? false,
  });
}

export async function seedSession(
  ctx: MutationCtx,
  args: {
    sessionToken: string;
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    recruitmentId: Id<"recruitments">;
    accessKind?: "submit" | "view";
  },
) {
  await ctx.db.insert("sessions", {
    sessionToken: args.sessionToken,
    staffId: args.staffId,
    shopId: args.shopId,
    recruitmentId: args.recruitmentId,
    accessKind: args.accessKind ?? "submit",
    expiresAt: Date.now() + 14 * 24 * 60 * 60 * 1000,
  });
}

export async function readScheduledFunctions(t: ScenarioTest) {
  return await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
}

export function hasScheduledJob(
  jobs: Awaited<ReturnType<typeof readScheduledFunctions>>,
  name: string,
  argsMatch: Record<string, unknown> = {},
) {
  return countScheduledJobs(jobs, name, argsMatch) > 0;
}

export function countScheduledJobs(
  jobs: Awaited<ReturnType<typeof readScheduledFunctions>>,
  name: string,
  argsMatch: Record<string, unknown> = {},
) {
  return jobs.filter((job) => {
    if (job.name !== name) return false;
    const expectedArgs = Object.entries(argsMatch);
    if (expectedArgs.length === 0) return true;
    const firstArg = job.args[0];
    if (!firstArg || typeof firstArg !== "object") return false;
    return expectedArgs.every(([key, value]) => firstArg[key] === value);
  }).length;
}
