import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getShopActivationReminderAt } from "../_lib/dateFormat";
import type { ShiftSubmissionPattern } from "../_lib/submissionPattern";
import { normalizeSubmissionPattern } from "../_lib/submissionPattern";
import { normalizeEmail } from "../_lib/validation";
import {
  ORGANIZATION_LEGACY_SHOP_SCAN_LIMIT,
  ORGANIZATION_NAME_SUFFIX,
  ORGANIZATION_SELF_CREATED_LIMIT,
} from "../constants";
import { recordStaffLegalConsent } from "../legal/service";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { ensureDefaultPosition } from "../position/service";
import type { RegularClosedDay } from "../shop/schemas";
import { sendReminderRef } from "../shopActivationReminder/refs";

type DbCtx = Pick<QueryCtx | MutationCtx, "db">;

export const ORGANIZATION_CREATE_LIMIT_REACHED_MESSAGE = `作成できるグループは${ORGANIZATION_SELF_CREATED_LIMIT}つまでです。\n使っていないグループを削除すると、また作成できます。`;
const ORGANIZATION_CREATE_UNAVAILABLE_MESSAGE = "無効になったアカウントでは、グループを作成できません。";

export type OrganizationCreationAvailability = { canCreate: true } | { canCreate: false; reason: string };

/**
 * 自分で作成して保持しているグループ数を数える。
 *
 * 招待で所属しているグループは契約主体が別人のため数えない。
 * 移行前のグループ未所属店舗は、1店舗を1グループとして同じ上限へ含める。
 */
async function countSelfCreatedOrganizations(ctx: DbCtx, userId: Id<"users">): Promise<number> {
  const selfCreated = await ctx.db
    .query("organizations")
    .withIndex("by_createdByUserId_and_isDeleted", (q) => q.eq("createdByUserId", userId).eq("isDeleted", false))
    .take(ORGANIZATION_SELF_CREATED_LIMIT + 1);
  if (selfCreated.length > ORGANIZATION_SELF_CREATED_LIMIT) return selfCreated.length;

  // TODO[narrow]: 全deploymentでm025/m029が完走し、verifyShops/verifyLegacyShopMembersの
  //   全pageが0件になった後、このlegacy shopMembers走査を削除する。
  const legacyMemberships = await ctx.db
    .query("shopMembers")
    .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", userId).eq("isDeleted", false))
    .take(ORGANIZATION_LEGACY_SHOP_SCAN_LIMIT);
  const legacyShopIds = new Set<Id<"shops">>();
  for (const membership of legacyMemberships) {
    const legacyShop = await ctx.db.get(membership.shopId);
    if (legacyShop && !legacyShop.isDeleted && !legacyShop.organizationId) legacyShopIds.add(legacyShop._id);
  }

  return selfCreated.length + legacyShopIds.size;
}

/**
 * 新しいグループを作れるかを、選択中グループの課金状態や所属状態と切り離して判定する。
 *
 * グループは独立した契約単位であり、あるグループが契約制限中でも別グループの契約主体にはなれる。
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

/**
 * 新しいグループの初期課金状態。
 *
 * 初回セットアップは支払い不要Business、既存管理者による追加作成はFreeで始める。
 * どちらで始めるかは呼出し側の判断であり、この関数は渡された状態をそのまま保存する。
 */
export type InitialOrganizationBillingState =
  | { kind: "complimentary"; plan: "business" }
  | { kind: "active"; plan: "free" };

export type CreateOrganizationWithFirstShopArgs = {
  userId: Id<"users">;
  managerName: string;
  managerEmail: string;
  shopName: string;
  regularClosedDays: RegularClosedDay[];
  submissionPattern: ShiftSubmissionPattern;
  billingState: InitialOrganizationBillingState;
  correlationId?: string;
  now: number;
};

export type CreateOrganizationWithFirstShopResult = {
  organizationId: Id<"organizations">;
  personId: Id<"organizationPeople">;
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
};

/**
 * グループ、最初の管理者、最初の店舗、課金状態を一つのtransactionで作る。
 *
 * 初回セットアップと既存管理者によるグループ追加の共通処理であり、
 * users行の作成・更新と利用規約同意の記録は呼出し側が持つ。
 */
export async function createOrganizationWithFirstShop(
  ctx: MutationCtx,
  args: CreateOrganizationWithFirstShopArgs,
): Promise<CreateOrganizationWithFirstShopResult> {
  const { userId, now } = args;
  const managerEmailNormalized = normalizeEmail(args.managerEmail);

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
    operatingStatus: "active",
    name: args.shopName,
    regularClosedDays: args.regularClosedDays,
    submissionPattern: normalizeSubmissionPattern(args.submissionPattern),
    isDeleted: false,
  });
  await ctx.db.insert("organizationBillingStates", {
    organizationId,
    state: args.billingState,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });

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
    toState: `${args.billingState.kind}.${args.billingState.plan}`,
    correlationId: args.correlationId,
    occurredAt: now,
  });

  await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
    staffId,
    organizationBillingVersionAtOrigin: 1,
  });
  await ctx.scheduler.runAt(getShopActivationReminderAt(now), sendReminderRef, {
    shopId,
    organizationBillingVersionAtOrigin: 1,
  });

  return { organizationId, personId, shopId, staffId };
}
