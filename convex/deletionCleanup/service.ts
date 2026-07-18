import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;
const USER_ASSOCIATION_SCAN_LIMIT = 20;

export type DeletionCleanupScope = "shop" | "organization";

export const ACTIVE_DELETION_CLEANUP_STATUSES = ["queued", "processing", "retrying", "actionRequired"] as const;

export function deletionCleanupRequestId(requestId: string) {
  return requestId;
}

export async function ensureDeletionCleanupJob(
  ctx: Pick<MutationCtx, "db">,
  args:
    | {
        scope: "shop";
        shopId: Id<"shops">;
        organizationId?: Id<"organizations">;
        requestId: string;
      }
    | {
        scope: "organization";
        organizationId: Id<"organizations">;
        requestId: string;
      },
) {
  if (args.scope === "shop" && args.organizationId) {
    for (const status of [...ACTIVE_DELETION_CLEANUP_STATUSES, "completed"] as const) {
      const parent = await ctx.db
        .query("deletionCleanupJobs")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", args.organizationId).eq("status", status),
        )
        .filter((q) => q.eq(q.field("scope"), "organization"))
        .first();
      if (parent) return parent;
    }
  }
  if (args.scope === "organization" && (await hasUnfinishedShopCleanupForOrganization(ctx, args.organizationId))) {
    throw new ConvexError("店舗の削除処理が進行中です");
  }

  const jobRequestId = deletionCleanupRequestId(args.requestId);
  const existing = await ctx.db
    .query("deletionCleanupJobs")
    .withIndex("by_requestId", (q) => q.eq("requestId", jobRequestId))
    .take(2);
  if (existing.length > 1) throw new ConvexError("削除処理を一意に確認できません");
  if (existing[0]) {
    if (!matchesTarget(existing[0], args)) throw new ConvexError("以前の削除処理を確認できません");
    return existing[0];
  }

  // 不可逆な対象にはcleanup jobを一件だけ持たせる。旧scheduled functionや
  // backfillが別の安全なrequest keyで到着しても、既存jobを再利用する。
  const targetJobs = new Map<Id<"deletionCleanupJobs">, Doc<"deletionCleanupJobs">>();
  for (const status of [...ACTIVE_DELETION_CLEANUP_STATUSES, "completed"] as const) {
    const candidates =
      args.scope === "shop"
        ? await ctx.db
            .query("deletionCleanupJobs")
            .withIndex("by_shopId_and_status", (q) => q.eq("shopId", args.shopId).eq("status", status))
            .take(2)
        : await ctx.db
            .query("deletionCleanupJobs")
            .withIndex("by_organizationId_and_status", (q) =>
              q.eq("organizationId", args.organizationId).eq("status", status),
            )
            .filter((q) => q.eq(q.field("scope"), "organization"))
            .take(2);
    for (const candidate of candidates) targetJobs.set(candidate._id, candidate);
    if (targetJobs.size > 1) throw new ConvexError("削除処理を一意に確認できません");
  }
  const existingTargetJob = targetJobs.values().next().value;
  if (existingTargetJob) {
    if (!matchesTarget(existingTargetJob, args)) throw new ConvexError("以前の削除処理を確認できません");
    return existingTargetJob;
  }

  const now = Date.now();
  const jobId = await ctx.db.insert("deletionCleanupJobs", {
    scope: args.scope,
    ...(args.scope === "shop"
      ? {
          shopId: args.shopId,
          ...(args.organizationId ? { organizationId: args.organizationId } : {}),
        }
      : { organizationId: args.organizationId }),
    requestId: jobRequestId,
    status: "queued",
    phase: args.scope === "shop" ? "shopCore" : "organizationCore",
    version: 1,
    attemptCount: 0,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const job = await ctx.db.get(jobId);
  if (!job) throw new ConvexError("削除処理を開始できません");
  return job;
}

export async function hasUnfinishedShopCleanupForOrganization(ctx: DbCtx, organizationId: Id<"organizations">) {
  for (const status of ACTIVE_DELETION_CLEANUP_STATUSES) {
    const job = await ctx.db
      .query("deletionCleanupJobs")
      .withIndex("by_organizationId_and_status", (q) => q.eq("organizationId", organizationId).eq("status", status))
      .filter((q) => q.eq(q.field("scope"), "shop"))
      .first();
    if (job) return true;
  }
  return false;
}

export type OtherActiveUserAssociationStatus = "found" | "none" | "unknown";

export class UnknownUserAssociationError extends Error {
  constructor() {
    super("User association scan limit exceeded");
    this.name = "UnknownUserAssociationError";
  }
}

/**
 * 対象外の有効な所属をboundedに確認する。
 * scan上限を超えた状態を「共有あり」と同一視すると匿名化漏れを正常完了にしてしまうため、
 * 呼び出し側が削除拒否または要対応へ寄せられるようunknownを返す。
 */
export async function getOtherActiveUserAssociationStatus(
  ctx: DbCtx,
  userId: Id<"users">,
  excludedOrganizationId: Id<"organizations">,
): Promise<OtherActiveUserAssociationStatus> {
  for (const status of ["active", "readOnly"] as const) {
    const members = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", status))
      .take(USER_ASSOCIATION_SCAN_LIMIT + 1);
    if (members.length > USER_ASSOCIATION_SCAN_LIMIT) return "unknown";
    for (const member of members) {
      if (member.organizationId === excludedOrganizationId) continue;
      const [organization, person] = await Promise.all([
        ctx.db.get(member.organizationId),
        ctx.db.get(member.personId),
      ]);
      if (
        organization &&
        !organization.isDeleted &&
        person?.status === "active" &&
        person.organizationId === organization._id &&
        person.userId === userId
      ) {
        return "found";
      }
    }
  }

  const people = await ctx.db
    .query("organizationPeople")
    .withIndex("by_userId_and_status", (q) => q.eq("userId", userId).eq("status", "active"))
    .take(USER_ASSOCIATION_SCAN_LIMIT + 1);
  if (people.length > USER_ASSOCIATION_SCAN_LIMIT) return "unknown";
  for (const person of people) {
    if (person.organizationId === excludedOrganizationId) continue;
    const organization = await ctx.db.get(person.organizationId);
    if (organization && !organization.isDeleted) return "found";
  }

  const staffs = await ctx.db
    .query("staffs")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", userId).eq("isDeleted", false))
    .take(USER_ASSOCIATION_SCAN_LIMIT + 1);
  if (staffs.length > USER_ASSOCIATION_SCAN_LIMIT) return "unknown";
  for (const staff of staffs) {
    const shop = await ctx.db.get(staff.shopId);
    if (!shop || shop.isDeleted || shop.organizationId === excludedOrganizationId) continue;
    if (!shop.organizationId) return "found";
    const organization = await ctx.db.get(shop.organizationId);
    if (organization && !organization.isDeleted) return "found";
  }

  const shopMembers = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", userId).eq("isDeleted", false))
    .take(USER_ASSOCIATION_SCAN_LIMIT + 1);
  if (shopMembers.length > USER_ASSOCIATION_SCAN_LIMIT) return "unknown";
  for (const membership of shopMembers) {
    const shop = await ctx.db.get(membership.shopId);
    if (!shop || shop.isDeleted || shop.organizationId === excludedOrganizationId) continue;
    if (!shop.organizationId) return "found";
    const organization = await ctx.db.get(shop.organizationId);
    if (organization && !organization.isDeleted) return "found";
  }
  return "none";
}

/** 対象外の有効な所属が一つでもあれば、global userは共有資産として維持する。 */
export async function hasOtherActiveUserAssociation(
  ctx: DbCtx,
  userId: Id<"users">,
  excludedOrganizationId: Id<"organizations">,
) {
  const status = await getOtherActiveUserAssociationStatus(ctx, userId, excludedOrganizationId);
  if (status === "unknown") {
    throw new UnknownUserAssociationError();
  }
  return status === "found";
}

function matchesTarget(
  job: Doc<"deletionCleanupJobs">,
  args:
    | {
        scope: "shop";
        shopId: Id<"shops">;
        organizationId?: Id<"organizations">;
      }
    | { scope: "organization"; organizationId: Id<"organizations"> },
) {
  if (job.scope !== args.scope) return false;
  if (args.scope === "shop") {
    return job.shopId === args.shopId && job.organizationId === args.organizationId;
  }
  return job.organizationId === args.organizationId && job.shopId === undefined;
}
