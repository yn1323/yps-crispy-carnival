import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getShopActivationReminderAt } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { normalizeSubmissionPattern } from "../_lib/submissionPattern";
import { normalizeEmail } from "../_lib/validation";
import { analyticsPlanForBillingState } from "../analytics/sourceEvents";
import { ORGANIZATION_NAME_SUFFIX, ORGANIZATION_SELF_CREATED_LIMIT } from "../constants";
import { recordStaffLegalConsent } from "../legal/service";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { scheduleOrganizationBillingStateDeadline } from "../organizationBilling/deadline";
import { calculateTrialEndsAt } from "../organizationBilling/policy";
import { ensureDefaultPosition } from "../position/service";
import type { RegularClosedDay } from "../shop/schemas";
import { sendReminderRef } from "../shopActivationReminder/refs";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export const ORGANIZATION_CREATE_LIMIT_REACHED_MESSAGE = `作成できる組織は${ORGANIZATION_SELF_CREATED_LIMIT}つまでです`;
export const ORGANIZATION_CREATE_UNAVAILABLE_MESSAGE = "無効になったアカウントでは、組織を作成できません。";

export type OrganizationCreationAvailability = { canCreate: true } | { canCreate: false; reason: string };

/**
 * 自分で作成して保持している組織数を数える。
 *
 * 招待で所属している組織は契約主体が別人のため数えない。
 */
async function countSelfCreatedOrganizations(ctx: DbCtx, userId: Id<"users">): Promise<number> {
  const selfCreated = await ctx.db
    .query("organizations")
    .withIndex("by_createdByUserId_and_isDeleted", (q) => q.eq("createdByUserId", userId).eq("isDeleted", false))
    .take(ORGANIZATION_SELF_CREATED_LIMIT + 1);
  return selfCreated.length;
}

/**
 * 新しい組織を作れるかを、選択中組織の課金状態や所属状態と切り離して判定する。
 *
 * 組織は独立した契約単位であり、別組織の契約状態には左右されない。
 */
export async function getOrganizationCreationAvailability(
  ctx: DbCtx,
  user: Doc<"users"> | null,
): Promise<OrganizationCreationAvailability> {
  if (!user || user.isDeleted || user.accountDeletionRequestedAt !== undefined) {
    return { canCreate: false, reason: ORGANIZATION_CREATE_UNAVAILABLE_MESSAGE };
  }
  const selfCreatedCount = await countSelfCreatedOrganizations(ctx, user._id);
  if (selfCreatedCount >= ORGANIZATION_SELF_CREATED_LIMIT) {
    return { canCreate: false, reason: ORGANIZATION_CREATE_LIMIT_REACHED_MESSAGE };
  }
  return { canCreate: true };
}

export type CreateOrganizationWithFirstShopArgs = {
  userId: Id<"users">;
  managerName: string;
  managerEmail: string;
  managerProfileSource?: "canonicalPerson";
  shopName: string;
  regularClosedDays: RegularClosedDay[];
  submissionPattern: ShiftSubmissionPattern;
  correlationId?: string;
  billingMode: "free" | "trial" | "complimentaryPro";
  now: number;
};

export type CreateOrganizationWithFirstShopResult = {
  organizationId: Id<"organizations">;
  personId: Id<"organizationPeople">;
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
};

/**
 * 組織、最初の管理者、最初の店舗、課金状態を一つのtransactionで作る。
 *
 * 初回セットアップと既存管理者による組織追加の共通処理であり、
 * users行の作成・更新と利用規約同意の記録は呼出し側が持つ。
 */
export async function createOrganizationWithFirstShop(
  ctx: MutationCtx,
  args: CreateOrganizationWithFirstShopArgs,
): Promise<CreateOrganizationWithFirstShopResult> {
  const { userId, now } = args;
  const managerEmailNormalized = normalizeEmail(args.managerEmail);
  const billingState =
    args.billingMode === "free"
      ? ({ kind: "active", plan: "free" } as const)
      : args.billingMode === "complimentaryPro"
        ? ({ kind: "complimentary", plan: "pro" } as const)
        : ({ kind: "trial", trialEndsAt: calculateTrialEndsAt(now) } as const);

  const organizationId = await ctx.db.insert("organizations", {
    createdByUserId: userId,
    name: `${args.shopName}${ORGANIZATION_NAME_SUFFIX}`,
    billingEmail: args.managerEmail,
    billingEmailNormalized: managerEmailNormalized,
    isDeleted: false,
    createdAt: now,
    updatedAt: now,
  });
  const personId = await ctx.db.insert("organizationPeople", {
    organizationId,
    userId,
    name: args.managerName,
    email: args.managerEmail,
    emailNormalized: managerEmailNormalized,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("organizationMembers", {
    organizationId,
    personId,
    userId,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const shopId = await ctx.db.insert("shops", {
    organizationId,
    name: args.shopName,
    regularClosedDays: args.regularClosedDays,
    submissionPattern: normalizeSubmissionPattern(args.submissionPattern),
    isDeleted: false,
  });
  await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: billingState,
    ...(billingState.kind === "active" && billingState.plan === "free"
      ? { freeManagerPersonId: personId, freeShopId: shopId }
      : {}),
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  if (billingState.kind === "trial") {
    await scheduleOrganizationBillingStateDeadline(ctx, {
      organizationId,
      state: billingState,
      version: 1,
    });
  }

  await ensureDefaultPosition(ctx, shopId);

  // manager もスタッフ一覧に含める。自分のシフトやLINE通知を同じ画面で扱うため、
  // users と staffs は userId で紐付け、後続の編集時に表示名を同期する。
  const staffId = await ctx.db.insert("staffs", {
    shopId,
    organizationId,
    organizationPersonId: personId,
    name: args.managerName,
    email: args.managerEmail,
    emailNormalized: managerEmailNormalized,
    userId,
    excludedFromShift: false,
    isDeleted: false,
  });

  // 同意済みの manager は、同時に作られる staff としても提出時の同意確認を不要にする。
  await recordStaffLegalConsent(ctx, {
    staffId,
    shopId,
    method: "manager_setup",
  });

  await recordOrganizationAuditEvent(ctx, {
    organizationId,
    actorUserId: userId,
    actorPersonId: personId,
    action: "organization.created",
    targetKind: "organization",
    targetId: organizationId,
    ...(args.managerProfileSource ? { fromState: `managerProfile.${args.managerProfileSource}` } : {}),
    toState:
      billingState.kind === "active"
        ? `active.${billingState.plan}`
        : billingState.kind === "complimentary"
          ? "complimentary.pro"
          : "trial",
    correlationId: args.correlationId,
    occurredAt: now,
    analyticsEvent: {
      eventType: "organization.changed",
      shopId,
      subjectId: personId,
      payload: {
        kind: "organization",
        change: "created",
        displayName: `${args.shopName}${ORGANIZATION_NAME_SUFFIX}`,
        registeredAt: now,
        currentPlan: analyticsPlanForBillingState(billingState),
        initialShop: { shopId, displayName: args.shopName, registeredAt: now },
        initialPersonId: personId,
        initialStaff: {
          staffId,
          organizationPersonId: personId,
          shopId,
          validFrom: now,
          isShiftTarget: true,
        },
      },
    },
  });

  await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
    staffId,
    organizationPersonId: personId,
    lineLinkGenerationAtSchedule: 0,
    organizationBillingVersionAtOrigin: 1,
  });
  await ctx.scheduler.runAt(getShopActivationReminderAt(now), sendReminderRef, {
    shopId,
    organizationBillingVersionAtOrigin: 1,
  });

  return { organizationId, personId, shopId, staffId };
}
