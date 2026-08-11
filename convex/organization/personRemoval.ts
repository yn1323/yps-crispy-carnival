import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT } from "../constants";

export const personRemovalPreviewValidator = v.union(
  v.object({
    kind: v.literal("ready"),
    asOfDate: v.string(),
    assignmentCount: v.number(),
    fingerprint: v.string(),
  }),
  v.object({
    kind: v.literal("tooMany"),
    asOfDate: v.string(),
    assignmentCountAtLeast: v.number(),
    limit: v.number(),
  }),
);

export const expectedPersonRemovalPreviewValidator = v.object({
  assignmentCount: v.number(),
  fingerprint: v.string(),
});

export const STALE_PERSON_REMOVAL_PREVIEW_ERROR =
  "今日以降のシフトの割り当てが変更されました。\n内容を確認してから、もう一度削除してください。";

// 店舗軸の一括変更では、通知・割当・統計更新と同じtransactionへ収まる範囲に抑える。
export const BULK_STAFF_ACCESS_REVOCATION_RECORD_LIMIT = 200;

export type PersonRemovalPreview =
  | {
      kind: "ready";
      asOfDate: string;
      assignmentCount: number;
      fingerprint: string;
      assignmentIds: Id<"shiftAssignments">[];
    }
  | {
      kind: "tooMany";
      asOfDate: string;
      assignmentCountAtLeast: number;
      limit: number;
    };

type PersonRemovalDbCtx = Pick<QueryCtx | MutationCtx, "db">;

export type PersonRemovalScope =
  | { kind: "organization"; organizationId: Id<"organizations">; personId: Id<"organizationPeople"> }
  | {
      kind: "shop";
      organizationId: Id<"organizations">;
      shopId: Id<"shops">;
      staffId: Id<"staffs">;
    };

/**
 * 今日以降の削除対象だけを収集する。assignment IDはpreviewへ露出せず、確認fingerprintへだけ含める。
 */
export async function collectPersonRemovalPreview(
  ctx: PersonRemovalDbCtx,
  args: {
    scope: PersonRemovalScope;
    staffs: readonly Doc<"staffs">[];
    asOfDate: string;
  },
): Promise<PersonRemovalPreview> {
  const assignmentIds: Id<"shiftAssignments">[] = [];
  const seenAssignmentIds = new Set<Id<"shiftAssignments">>();

  for (const staff of args.staffs) {
    if (!isStaffInScope(staff, args.scope)) continue;
    const assignments = ctx.db
      .query("shiftAssignments")
      .withIndex("by_staffId_and_date", (q) => q.eq("staffId", staff._id).gte("date", args.asOfDate));
    for await (const assignment of assignments) {
      if (seenAssignmentIds.has(assignment._id)) continue;
      const recruitment = await ctx.db.get(assignment.recruitmentId);
      // 壊れた越境参照を人物削除の対象へ巻き込まない。
      if (!recruitment || recruitment.shopId !== staff.shopId) continue;
      seenAssignmentIds.add(assignment._id);
      assignmentIds.push(assignment._id);
      if (assignmentIds.length > ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT) {
        return {
          kind: "tooMany",
          asOfDate: args.asOfDate,
          assignmentCountAtLeast: assignmentIds.length,
          limit: ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT,
        };
      }
    }
  }

  assignmentIds.sort((a, b) => a.localeCompare(b));
  return {
    kind: "ready",
    asOfDate: args.asOfDate,
    assignmentCount: assignmentIds.length,
    fingerprint: await createRemovalFingerprint(args.scope, args.asOfDate, assignmentIds),
    assignmentIds,
  };
}

export function toPublicPersonRemovalPreview(preview: PersonRemovalPreview) {
  if (preview.kind === "tooMany") return preview;
  const { assignmentIds: _assignmentIds, ...publicPreview } = preview;
  return publicPreview;
}

export async function deletePersonRemovalAssignments(
  ctx: Pick<MutationCtx, "db">,
  assignmentIds: readonly Id<"shiftAssignments">[],
) {
  for (const assignmentId of assignmentIds) await ctx.db.delete(assignmentId);
}

export async function revokeStaffAccessForRemoval(
  ctx: Pick<MutationCtx, "db">,
  staffIds: readonly Id<"staffs">[],
  now: number,
  options?: { recordLimit?: number },
) {
  const recordLimit = options?.recordLimit;
  if (recordLimit !== undefined && (!Number.isSafeInteger(recordLimit) || recordLimit < 1)) {
    throw new Error("Staff access revocation record limit must be a positive integer");
  }

  let recordCount = 0;

  const collectWithLimit = async <T>(read: { collect: () => Promise<T[]>; take: (count: number) => Promise<T[]> }) => {
    if (recordLimit === undefined) return await read.collect();
    const remaining = recordLimit - recordCount;
    if (remaining < 0) {
      throw new ConvexError(
        "スタッフのアクセス情報が多いため、一括で所属を変更できません。\n対象を分けて、もう一度お試しください。",
      );
    }
    const rows = await read.take(remaining + 1);
    recordCount += rows.length;
    if (recordCount > recordLimit) {
      throw new ConvexError(
        "スタッフのアクセス情報が多いため、一括で所属を変更できません。\n対象を分けて、もう一度お試しください。",
      );
    }
    return rows;
  };

  for (const staffId of staffIds) {
    const reads = {
      sessions: ctx.db.query("sessions").withIndex("by_staffId", (q) => q.eq("staffId", staffId)),
      magicLinks: ctx.db.query("magicLinks").withIndex("by_staffId", (q) => q.eq("staffId", staffId)),
      lineLinkTokens: ctx.db.query("lineLinkTokens").withIndex("by_staffId", (q) => q.eq("staffId", staffId)),
      lineAccounts: ctx.db.query("staffLineAccounts").withIndex("by_staffId", (q) => q.eq("staffId", staffId)),
    };
    const [sessions, magicLinks, lineLinkTokens, lineAccounts] =
      recordLimit === undefined
        ? await Promise.all([
            reads.sessions.collect(),
            reads.magicLinks.collect(),
            reads.lineLinkTokens.collect(),
            reads.lineAccounts.collect(),
          ])
        : [
            await collectWithLimit(reads.sessions),
            await collectWithLimit(reads.magicLinks),
            await collectWithLimit(reads.lineLinkTokens),
            await collectWithLimit(reads.lineAccounts),
          ];

    await Promise.all([
      ...sessions
        .filter((session) => !session.revokedAt)
        .map((session) => ctx.db.patch(session._id, { revokedAt: now })),
      ...magicLinks.filter((link) => !link.revokedAt).map((link) => ctx.db.patch(link._id, { revokedAt: now })),
      ...lineLinkTokens.filter((token) => !token.revokedAt).map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineAccounts
        .filter((account) => !account.isDeleted || account.following)
        .map((account) => ctx.db.patch(account._id, { isDeleted: true, following: false })),
    ]);
  }
}

function isStaffInScope(staff: Doc<"staffs">, scope: PersonRemovalScope) {
  if (staff.organizationId !== scope.organizationId) return false;
  if (scope.kind === "organization") return staff.organizationPersonId === scope.personId;
  return staff._id === scope.staffId && staff.shopId === scope.shopId;
}

async function createRemovalFingerprint(
  scope: PersonRemovalScope,
  asOfDate: string,
  assignmentIds: readonly Id<"shiftAssignments">[],
) {
  const canonical = JSON.stringify({ version: 1, scope, asOfDate, assignmentIds });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
