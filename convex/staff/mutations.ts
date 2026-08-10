import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";
import { isShopParentActive } from "../_lib/activeShop";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { todayJST } from "../_lib/dateFormat";
import { managerMutation } from "../_lib/functions";
import { checkRateLimit, rateLimit } from "../_lib/rateLimits";
import { normalizeEmail } from "../_lib/validation";
import { recordAnalyticsSourceEvent } from "../analytics/sourceEvents";
import {
  CURRENT_SHIFT_NOTIFICATION_LIMIT,
  ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT,
  ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT,
  ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT,
} from "../constants";
import { getStaffLineAccount } from "../line/service";
import { ensureNotificationFanoutOperation } from "../notification/fanout";
import { cancelOrganizationRecipientBusinessNotifications } from "../notificationOutbox/mutations";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { updateOrganizationPersonProfile } from "../organization/personProfile";
import {
  collectPersonRemovalPreview,
  deletePersonRemovalAssignments,
  expectedPersonRemovalPreviewValidator,
  revokeStaffAccessForRemoval,
  STALE_PERSON_REMOVAL_PREVIEW_ERROR,
} from "../organization/personRemoval";
import {
  createOrganizationPersonShopMembershipFingerprint,
  INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON,
  organizationShopOperatingStatus,
  STALE_SHOP_MEMBERSHIP_CHANGE_ERROR,
  sha256Hex,
  sortShopIds,
} from "../organization/shopMembershipChange";
import { requireOrganizationCapacity } from "../organizationBilling/service";
import { recalculateOpenRecruitmentStatsForShops } from "../recruitment/stats";
import { addStaffsSchema, editStaffSchema } from "./schemas";
import {
  findActiveStaffByEmail,
  getActiveStaffInShop,
  isShiftTargetStaff,
  materializeOrganizationPeopleForStaffAddition,
  prepareOrganizationPeopleForStaffAddition,
  releasePendingInvitationReservationsForStaffAddition,
} from "./service";

type StaffNotificationKind = "openRecruitments" | "currentShift";
type ManagerStaffMutationCtx = MutationCtx & {
  user: Doc<"users">;
  shop: Doc<"shops">;
  organization: Doc<"organizations"> | null;
  organizationMember: Doc<"organizationMembers"> | null;
};

const staffAddResultValidator = v.union(
  v.object({ status: v.literal("added"), staffIds: v.array(v.id("staffs")) }),
  v.object({
    status: v.literal("requiresConfirmation"),
    candidates: v.array(v.object({ personId: v.id("organizationPeople"), name: v.string(), email: v.string() })),
  }),
);

function sameIds(left: readonly Id<"organizationPeople">[], right: readonly Id<"organizationPeople">[]) {
  if (left.length !== right.length) return false;
  const leftSet = new Set(left);
  return leftSet.size === left.length && right.every((id) => leftSet.has(id));
}

async function recoverCompletedStaffAddition(
  ctx: ManagerStaffMutationCtx,
  args: {
    organizationId: Id<"organizations">;
    entries: ReadonlyArray<{ name: string; email: string }>;
    confirmedPersonIds: readonly Id<"organizationPeople">[];
    requestId: string;
  },
) {
  const correlationBase = `${args.organizationId}:staff-add:${args.requestId}`;
  const firstAudit = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", `${correlationBase}:staff:0`))
    .first();
  if (!firstAudit) return null;
  if (
    firstAudit.action !== "organization.staff_added" ||
    firstAudit.actorUserId !== ctx.user._id ||
    firstAudit.toState !== `active:${ctx.shop._id}:batch:${args.entries.length}`
  ) {
    throw new ConvexError("以前の追加操作と内容が一致しません。\n画面を更新して、もう一度お試しください。");
  }

  const staffIds: Id<"staffs">[] = [];
  const reactivatedPersonIds: Id<"organizationPeople">[] = [];
  for (const [index, entry] of args.entries.entries()) {
    const audit =
      index === 0
        ? firstAudit
        : await ctx.db
            .query("organizationAuditEvents")
            .withIndex("by_correlationId", (q) => q.eq("correlationId", `${correlationBase}:staff:${index}`))
            .first();
    const staffId = audit?.targetId ? ctx.db.normalizeId("staffs", audit.targetId) : null;
    const staff = staffId ? await ctx.db.get(staffId) : null;
    if (
      audit?.action !== "organization.staff_added" ||
      audit.organizationId !== args.organizationId ||
      audit.actorUserId !== ctx.user._id ||
      audit.targetKind !== "staff" ||
      audit.correlationId !== `${correlationBase}:staff:${index}` ||
      audit.toState !== `active:${ctx.shop._id}:batch:${args.entries.length}` ||
      !["new", "activePerson", "removedPerson"].includes(audit.fromState ?? "") ||
      !staff ||
      staff.shopId !== ctx.shop._id ||
      staff.organizationId !== args.organizationId ||
      staff.isDeleted ||
      normalizeEmail(staff.email) !== entry.email ||
      (audit.fromState === "new" && staff.name !== entry.name)
    ) {
      throw new ConvexError("以前のスタッフ追加結果を確認できません。\n画面を更新して、もう一度お試しください。");
    }
    staffIds.push(staff._id);
    if (audit.fromState === "removedPerson") {
      if (!staff.organizationPersonId) {
        throw new ConvexError("以前のスタッフ追加結果を確認できません。\n画面を更新して、もう一度お試しください。");
      }
      reactivatedPersonIds.push(staff.organizationPersonId);
    }
  }
  if (!sameIds(reactivatedPersonIds, args.confirmedPersonIds)) {
    throw new ConvexError("確認対象が変わりました。\n追加内容をもう一度確認してください。");
  }
  return { status: "added" as const, staffIds };
}

async function getSendableStaff(ctx: ManagerStaffMutationCtx, staffId: Id<"staffs">) {
  const staff = await getActiveStaffInShop(ctx, ctx.shop._id, staffId);
  if (!staff) {
    throw new ConvexError("Not found");
  }

  const lineAccount = await getStaffLineAccount(ctx, staff._id);
  const canSend = staff.email.length > 0 || Boolean(lineAccount?.lineUserId && lineAccount.following);
  if (!canSend) {
    throw new ConvexError("メールアドレスの登録またはLINE連携が必要です。");
  }

  return staff;
}

async function allowStaffNotificationResend(
  ctx: ManagerStaffMutationCtx,
  staffId: Id<"staffs">,
  kind: StaffNotificationKind,
  targetCount: number,
) {
  if (!Number.isSafeInteger(targetCount) || targetCount < 1) {
    throw new Error("Staff notification resend target count must be a positive integer");
  }
  const recipientScope = `${ctx.shop._id}:${staffId}:${kind}`;
  const actorKey = `${ctx.user._id}:${recipientScope}`;
  const organizationScope = ctx.organization?._id ?? ctx.shop._id;
  const organizationKey = `${organizationScope}:${recipientScope}`;
  const scopeTargetKey = `${organizationScope}:${kind}`;
  const limits = [
    { name: "staffNotificationResendActorShort", key: actorKey, count: 1 },
    { name: "staffNotificationResendActorDaily", key: actorKey, count: 1 },
    { name: "staffNotificationResendOrganizationShort", key: organizationKey, count: 1 },
    { name: "staffNotificationResendOrganizationDaily", key: organizationKey, count: 1 },
    { name: "staffNotificationResendScopeTargetShort", key: scopeTargetKey, count: targetCount },
    { name: "staffNotificationResendScopeTargetDaily", key: scopeTargetKey, count: targetCount },
  ] as const;

  const statuses = await Promise.all(limits.map(async (limit) => await checkRateLimit(ctx, limit)));
  if (statuses.some((status) => !status.ok)) return false;

  for (const limit of limits) {
    const consumed = await rateLimit(ctx, limit);
    if (!consumed.ok) {
      // 同じtransaction内のnon-mutating確認後なので通常は到達しない。throwして先行consumeもrollbackする。
      throw new Error("Staff notification resend rate limit changed during consumption");
    }
  }
  return true;
}

async function validateOptionalNotificationRequestId(requestId: string | undefined) {
  if (requestId !== undefined) {
    // client request IDは入力契約だけ検証し、quotaや通知operationのidentityには使わない。
    await toAuditRequestKey(requestId);
  }
}

type CurrentShiftNotificationScope =
  | { recruitments: Doc<"recruitments">[] }
  | { reason: "noCurrentShift" | "tooManyCurrentShifts" | "unconfirmedChanges" };

async function getCurrentShiftNotificationScope(
  ctx: MutationCtx,
  shopId: Id<"shops">,
): Promise<CurrentShiftNotificationScope> {
  const today = todayJST();
  const recruitments = await ctx.db
    .query("recruitments")
    .withIndex("by_shopId_and_isDeleted_and_status_and_periodEnd", (q) =>
      q.eq("shopId", shopId).eq("isDeleted", false).eq("status", "confirmed").gte("periodEnd", today),
    )
    .order("asc")
    .take(CURRENT_SHIFT_NOTIFICATION_LIMIT + 1);
  if (recruitments.length > CURRENT_SHIFT_NOTIFICATION_LIMIT) return { reason: "tooManyCurrentShifts" };
  if (recruitments.length === 0) return { reason: "noCurrentShift" };
  if (
    recruitments.some(
      (recruitment) =>
        recruitment.draftSavedAt !== undefined &&
        (recruitment.confirmedAt === undefined || recruitment.draftSavedAt > recruitment.confirmedAt),
    )
  ) {
    return { reason: "unconfirmedChanges" };
  }
  return { recruitments };
}

async function createCurrentShiftNotificationFanouts(
  ctx: MutationCtx,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    recruitments: readonly Doc<"recruitments">[];
    operationGroupKey: string;
    organizationBillingVersionAtOrigin?: number;
  },
) {
  let createdOperationCount = 0;
  for (const recruitment of args.recruitments) {
    const operationKey = `shift.confirmation.staff-resend:v1:${recruitment._id}:${args.staffId}:${args.operationGroupKey}`;
    const { operation, created } = await ensureNotificationFanoutOperation(ctx, {
      operationKey,
      kind: "confirmation",
      purpose: "confirmation",
      recruitmentId: recruitment._id,
      shopId: args.shopId,
      targetStaffIds: [args.staffId],
      dedupeSuffix: `staff-resend:${args.operationGroupKey}`,
      supersedeActiveOperations: false,
      confirmationOperationKeyAtOrigin: recruitment.lastConfirmationNotificationOperationKey ?? null,
      recruitmentDraftSavedAtAtOrigin: recruitment.draftSavedAt ?? null,
      ...(args.organizationBillingVersionAtOrigin === undefined
        ? {}
        : { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }),
    });
    if (!created) continue;

    const scheduledFunctionId = await ctx.scheduler.runAfter(
      0,
      internal.notification.actions.sendShiftConfirmationEmails,
      {
        recruitmentId: recruitment._id,
        isResend: false,
        fanoutOperationId: operation._id,
        ...(args.organizationBillingVersionAtOrigin === undefined
          ? {}
          : { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }),
      },
    );
    await ctx.db.patch(operation._id, { scheduledFunctionId });
    createdOperationCount += 1;
  }
  return createdOperationCount;
}

type AddStaffEntriesArgs = {
  entries: Array<{ name: string; email: string }>;
  confirmReactivationPersonIds?: Array<Id<"organizationPeople">>;
  requestId: string;
};

async function addStaffEntries(ctx: ManagerStaffMutationCtx, args: AddStaffEntriesArgs) {
  const parsed = addStaffsSchema.safeParse(args);
  if (!parsed.success) {
    throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
  }
  const requestId = await toAuditRequestKey(args.requestId);
  const validEntries = parsed.data.entries
    .map((entry) => ({ name: entry.name, email: normalizeEmail(entry.email) }))
    .filter((e) => e.name !== "");
  const confirmedPersonIds = args.confirmReactivationPersonIds ?? [];
  if (new Set(confirmedPersonIds).size !== confirmedPersonIds.length) {
    throw new ConvexError("確認対象が重複しています。\n追加内容をもう一度確認してください。");
  }

  const organizationId = ctx.shop.organizationId;
  if (organizationId) {
    if (ctx.organization?._id !== organizationId) throw new ConvexError("Not found");
    const completed = await recoverCompletedStaffAddition(ctx, {
      organizationId,
      entries: validEntries,
      confirmedPersonIds,
      requestId,
    });
    if (completed) return completed;
  } else if (confirmedPersonIds.length > 0) {
    throw new ConvexError("確認対象が変わりました。\n追加内容をもう一度確認してください。");
  }

  const inputEmails = new Set<string>();
  for (const entry of validEntries) {
    if (inputEmails.has(entry.email)) {
      throw new ConvexError("同じメールアドレスが複数入力されています。");
    }
    inputEmails.add(entry.email);

    const existingStaff = await findActiveStaffByEmail(ctx, ctx.shop._id, entry.email);
    if (existingStaff) {
      throw new ConvexError("このメールアドレスはすでに登録されています。");
    }

    const pendingRequest = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_emailNormalized_status", (q) =>
        q.eq("shopId", ctx.shop._id).eq("emailNormalized", entry.email).eq("status", "pending"),
      )
      .first();
    if (pendingRequest) {
      throw new ConvexError("このメールアドレスはスタッフ登録の承認待ちです。");
    }
  }

  type StaffInsertEntry = {
    name: string;
    email: string;
    organizationId?: Id<"organizations">;
    organizationPersonId?: Id<"organizationPeople">;
    sourceState: "new" | "activePerson" | "removedPerson";
    reactivatedPersonId?: Id<"organizationPeople">;
  };
  let staffEntries: StaffInsertEntry[] = validEntries.map((entry) => ({ ...entry, sourceState: "new" }));
  if (organizationId) {
    const prepared = await prepareOrganizationPeopleForStaffAddition(ctx, {
      organizationId,
      shopId: ctx.shop._id,
      entries: validEntries,
      allowRemovedPeople: true,
      deferCapacityCheck: true,
    });
    const reactivationCandidates = prepared.flatMap((entry) =>
      entry.personState === "removed" && entry.existingPersonId
        ? [{ personId: entry.existingPersonId, name: entry.name, email: entry.registeredEmail }]
        : [],
    );
    const reactivationPersonIds = reactivationCandidates.map((candidate) => candidate.personId);
    if (reactivationCandidates.length > 0 && args.confirmReactivationPersonIds === undefined) {
      return { status: "requiresConfirmation" as const, candidates: reactivationCandidates };
    }
    if (!sameIds(reactivationPersonIds, confirmedPersonIds)) {
      throw new ConvexError("確認対象が変わりました。\n追加内容をもう一度確認してください。");
    }
    if (reactivationCandidates.length > 0 && !ctx.organizationMember) throw new ConvexError("Not found");

    // pending manager招待の予約枠を、これから保存する同一人物へtransaction内で付け替える。
    await releasePendingInvitationReservationsForStaffAddition(ctx, organizationId, prepared);
    const additionalPeople = prepared.filter((entry) => entry.addsPersonToUsage).length;
    if (additionalPeople > 0) {
      // pending招待の予約枠も含め、明示確認後の最新read setで再検証する。
      await requireOrganizationCapacity(ctx, { organizationId, additionalPeople });
    }
    const materialized = await materializeOrganizationPeopleForStaffAddition(ctx, organizationId, prepared);
    staffEntries = materialized.map((entry) => ({
      name: entry.name,
      email: entry.email,
      organizationId,
      organizationPersonId: entry.personId,
      sourceState: entry.reactivated ? "removedPerson" : entry.personState === "active" ? "activePerson" : "new",
      ...(entry.reactivated ? { reactivatedPersonId: entry.personId } : {}),
    }));
  }

  const inserted: Id<"staffs">[] = [];
  for (const entry of staffEntries) {
    // TODO[narrow]: 全deploymentでm025/m027完走・staff readiness 0確認後、canonical IDsを必須にする。
    const id = await ctx.db.insert("staffs", {
      shopId: ctx.shop._id,
      ...(entry.organizationId && entry.organizationPersonId
        ? { organizationId: entry.organizationId, organizationPersonId: entry.organizationPersonId }
        : {}),
      name: entry.name,
      email: entry.email,
      emailNormalized: entry.email,
      excludedFromShift: false,
      isDeleted: false,
    });
    inserted.push(id);
  }
  const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
  for (const staffId of inserted) {
    // スタッフ追加直後に必要な案内をまとめて fire-and-forget する。
    // mutation は登録完了を優先し、外部送信の失敗や dry-run 判定は action 側で扱う。
    await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentEmail, {
      staffId,
      ...notificationOrigin,
    });
    await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
      staffId,
      ...notificationOrigin,
    });
    await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff, {
      staffId,
      ...notificationOrigin,
    });
  }

  if (organizationId) {
    const correlationBase = `${organizationId}:staff-add:${requestId}`;
    const now = Date.now();
    for (const [index, staffId] of inserted.entries()) {
      const entry = staffEntries[index];
      if (!entry) {
        throw new ConvexError("スタッフの追加結果を確認できません。\n画面を更新して、もう一度お試しください。");
      }
      await recordOrganizationAuditEvent(ctx, {
        organizationId,
        actorUserId: ctx.user._id,
        actorPersonId: ctx.organizationMember?.personId,
        action: "organization.staff_added",
        targetKind: "staff",
        targetId: staffId,
        fromState: entry.sourceState,
        toState: `active:${ctx.shop._id}:batch:${inserted.length}`,
        correlationId: `${correlationBase}:staff:${index}`,
        occurredAt: now,
        ...(index === 0
          ? {
              analyticsEvent: {
                eventType: "staffMembership.changed" as const,
                shopId: ctx.shop._id,
                payload: {
                  kind: "staffMembershipBatch" as const,
                  memberships: inserted.map((insertedStaffId, insertedIndex) => {
                    const insertedEntry = staffEntries[insertedIndex];
                    if (!insertedEntry) throw new ConvexError("スタッフの追加結果を確認できません。");
                    return {
                      staffId: insertedStaffId,
                      ...(insertedEntry.organizationPersonId
                        ? {
                            organizationPersonId: insertedEntry.organizationPersonId,
                            personFirstObservedAt: now,
                          }
                        : {}),
                      isShiftTarget: true,
                      validFrom: now,
                      lineLinked: false,
                      lineFollowing: false,
                    };
                  }),
                },
              },
            }
          : {}),
      });
      if (entry.reactivatedPersonId) {
        await recordOrganizationAuditEvent(ctx, {
          organizationId,
          actorUserId: ctx.user._id,
          actorPersonId: ctx.organizationMember?.personId,
          action: "organization.person_reactivated",
          targetKind: "person",
          targetId: entry.reactivatedPersonId,
          fromState: "removed",
          toState: "active",
          correlationId: `${correlationBase}:person:${entry.reactivatedPersonId}`,
          occurredAt: now,
          suppressAnalyticsEvent: true,
        });
      }
    }
  }
  return { status: "added" as const, staffIds: inserted };
}

export const addStaffs = managerMutation({
  args: {
    entries: v.array(v.object({ name: v.string(), email: v.string() })),
    confirmReactivationPersonIds: v.optional(v.array(v.id("organizationPeople"))),
    requestId: v.string(),
  },
  returns: staffAddResultValidator,
  handler: addStaffEntries,
});

export const addOrganizationPersonToShop = managerMutation({
  args: {
    personId: v.id("organizationPeople"),
    requestId: v.string(),
  },
  returns: v.object({ staffId: v.id("staffs") }),
  handler: async (ctx, args) => {
    if (!ctx.organization || ctx.shop.organizationId !== ctx.organization._id) {
      throw new ConvexError("Not found");
    }

    const person = await ctx.db.get(args.personId);
    if (
      !person ||
      person.organizationId !== ctx.organization._id ||
      person.status !== "active" ||
      normalizeEmail(person.email) !== person.emailNormalized
    ) {
      throw new ConvexError("Not found");
    }

    const result = await addStaffEntries(ctx, {
      entries: [{ name: person.name, email: person.email }],
      requestId: args.requestId,
    });
    if (result.status !== "added" || result.staffIds.length !== 1) {
      throw new ConvexError("スタッフの追加結果を確認できません。\n画面を更新して、もう一度お試しください。");
    }
    const staffId = result.staffIds[0];
    const staff = await ctx.db.get(staffId);
    if (
      !staff ||
      staff.isDeleted ||
      staff.shopId !== ctx.shop._id ||
      staff.organizationId !== ctx.organization._id ||
      staff.organizationPersonId !== person._id ||
      staff.name !== person.name ||
      staff.email !== person.emailNormalized ||
      staff.emailNormalized !== person.emailNormalized
    ) {
      throw new ConvexError("スタッフの追加結果を確認できません。\n画面を更新して、もう一度お試しください。");
    }
    return { staffId };
  },
});

const shopMembershipRemovalPreviewValidator = expectedPersonRemovalPreviewValidator.extend({
  shopId: v.id("shops"),
  staffId: v.id("staffs"),
});

const shopMembershipChangeResultValidator = v.object({
  changed: v.boolean(),
  addedShopIds: v.array(v.id("shops")),
  removedShopIds: v.array(v.id("shops")),
});

type ShopMembershipRemovalPreviewInput = {
  shopId: Id<"shops">;
  staffId: Id<"staffs">;
  assignmentCount: number;
  fingerprint: string;
};

type ShopMembershipChangeResult = {
  changed: boolean;
  addedShopIds: Id<"shops">[];
  removedShopIds: Id<"shops">[];
};

const PREVIOUS_SHOP_MEMBERSHIP_CHANGE_MISMATCH_ERROR =
  "以前の店舗所属変更と内容が一致しません。\n画面を更新して、もう一度お試しください。";

function canonicalRemovalPreviews(previews: readonly ShopMembershipRemovalPreviewInput[]) {
  return [...previews].sort(
    (left, right) => left.shopId.localeCompare(right.shopId) || left.staffId.localeCompare(right.staffId),
  );
}

function validateShopMembershipChangeInput(
  desiredActiveShopIds: readonly Id<"shops">[],
  removalPreviews: readonly ShopMembershipRemovalPreviewInput[],
  expectedMembershipFingerprint: string,
) {
  const isSha256Hex = (value: string) => /^[0-9a-f]{64}$/.test(value);
  if (
    desiredActiveShopIds.length > ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT ||
    new Set(desiredActiveShopIds).size !== desiredActiveShopIds.length ||
    removalPreviews.length > ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT ||
    !isSha256Hex(expectedMembershipFingerprint) ||
    removalPreviews.some(
      (preview) =>
        !Number.isSafeInteger(preview.assignmentCount) ||
        preview.assignmentCount < 0 ||
        !isSha256Hex(preview.fingerprint),
    ) ||
    new Set(removalPreviews.map((preview) => preview.shopId)).size !== removalPreviews.length ||
    new Set(removalPreviews.map((preview) => preview.staffId)).size !== removalPreviews.length
  ) {
    throw new ConvexError("入力内容を確認してください。");
  }
}

async function createShopMembershipChangeIntentHash(args: {
  personId: Id<"organizationPeople">;
  desiredActiveShopIds: readonly Id<"shops">[];
  expectedMembershipFingerprint: string;
  removalPreviews: readonly ShopMembershipRemovalPreviewInput[];
}) {
  return await sha256Hex(
    JSON.stringify({
      version: 1,
      personId: args.personId,
      expectedMembershipFingerprint: args.expectedMembershipFingerprint,
      desiredActiveShopIds: sortShopIds(args.desiredActiveShopIds),
      removalPreviews: canonicalRemovalPreviews(args.removalPreviews),
    }),
  );
}

function shopMembershipChangeReceiptIntentState(intentHash: string) {
  return JSON.stringify({ version: 1, intentHash });
}

function shopMembershipChangeReceiptResultState(result: ShopMembershipChangeResult) {
  return JSON.stringify({
    version: 1,
    changed: result.changed,
    addedShopIds: sortShopIds(result.addedShopIds),
    removedShopIds: sortShopIds(result.removedShopIds),
  });
}

function parseReceiptShopIds(ctx: MutationCtx, value: unknown) {
  if (!Array.isArray(value) || value.length > ORGANIZATION_USER_DETAIL_SHOP_SCAN_LIMIT) return null;
  const shopIds: Id<"shops">[] = [];
  for (const item of value) {
    const shopId = typeof item === "string" ? ctx.db.normalizeId("shops", item) : null;
    if (!shopId) return null;
    shopIds.push(shopId);
  }
  if (new Set(shopIds).size !== shopIds.length) return null;
  return sortShopIds(shopIds);
}

function parseShopMembershipChangeReceiptResult(ctx: MutationCtx, value: string | undefined) {
  if (!value) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const state = parsed as Record<string, unknown>;
  if (state.version !== 1 || typeof state.changed !== "boolean") return null;
  const addedShopIds = parseReceiptShopIds(ctx, state.addedShopIds);
  const removedShopIds = parseReceiptShopIds(ctx, state.removedShopIds);
  if (!addedShopIds || !removedShopIds || addedShopIds.some((shopId) => removedShopIds.includes(shopId))) return null;
  if (
    (state.changed && addedShopIds.length === 0 && removedShopIds.length === 0) ||
    (!state.changed && (addedShopIds.length > 0 || removedShopIds.length > 0))
  ) {
    return null;
  }
  return { changed: state.changed, addedShopIds, removedShopIds } satisfies ShopMembershipChangeResult;
}

async function recoverCompletedShopMembershipChange(
  ctx: ManagerStaffMutationCtx,
  args: {
    organizationId: Id<"organizations">;
    personId: Id<"organizationPeople">;
    intentHash: string;
    correlationId: string;
  },
) {
  const audits = await ctx.db
    .query("organizationAuditEvents")
    .withIndex("by_correlationId", (q) => q.eq("correlationId", args.correlationId))
    .take(2);
  if (audits.length === 0) return null;
  const audit = audits.length === 1 ? audits[0] : null;
  const result = audit ? parseShopMembershipChangeReceiptResult(ctx, audit.toState) : null;
  if (
    !audit ||
    audit.organizationId !== args.organizationId ||
    audit.actorUserId !== ctx.user._id ||
    audit.actorPersonId !== ctx.organizationMember?.personId ||
    audit.action !== "organization.person_shop_memberships_changed" ||
    audit.targetKind !== "person" ||
    audit.targetId !== args.personId ||
    audit.fromState !== shopMembershipChangeReceiptIntentState(args.intentHash) ||
    audit.correlationId !== args.correlationId ||
    !result
  ) {
    throw new ConvexError(PREVIOUS_SHOP_MEMBERSHIP_CHANGE_MISMATCH_ERROR);
  }
  return result;
}

export const changeOrganizationPersonShopMemberships = managerMutation({
  args: {
    personId: v.id("organizationPeople"),
    desiredActiveShopIds: v.array(v.id("shops")),
    expectedMembershipFingerprint: v.string(),
    removalPreviews: v.array(shopMembershipRemovalPreviewValidator),
    requestId: v.string(),
  },
  returns: shopMembershipChangeResultValidator,
  handler: async (ctx, args) => {
    validateShopMembershipChangeInput(
      args.desiredActiveShopIds,
      args.removalPreviews,
      args.expectedMembershipFingerprint,
    );
    if (
      !ctx.organization ||
      !ctx.organizationMember ||
      ctx.shop.organizationId !== ctx.organization._id ||
      ctx.organizationMember.organizationId !== ctx.organization._id
    ) {
      throw new ConvexError("Not found");
    }

    const organizationId = ctx.organization._id;
    const requestKey = await toAuditRequestKey(args.requestId);
    const intentHash = await createShopMembershipChangeIntentHash(args);
    const correlationId = `${organizationId}:person-shop-memberships:${requestKey}`;
    const completed = await recoverCompletedShopMembershipChange(ctx, {
      organizationId,
      personId: args.personId,
      intentHash,
      correlationId,
    });
    if (completed) return completed;

    const person = await ctx.db.get(args.personId);
    if (
      !person ||
      person.organizationId !== organizationId ||
      person.status !== "active" ||
      normalizeEmail(person.email) !== person.emailNormalized
    ) {
      throw new ConvexError("Not found");
    }

    const staffDocs = await ctx.db
      .query("staffs")
      .withIndex("by_organizationId_and_organizationPersonId", (q) =>
        q.eq("organizationId", organizationId).eq("organizationPersonId", person._id),
      )
      .take(ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT + 1);
    if (staffDocs.length > ORGANIZATION_USER_DETAIL_STAFF_SCAN_LIMIT) {
      throw new ConvexError("ユーザーの店舗所属を確認できません。\n画面を更新して、もう一度お試しください。");
    }

    const activeStaffs = staffDocs.filter((staff) => !staff.isDeleted);
    const currentMemberships = await Promise.all(
      activeStaffs.map(async (staff) => {
        const shop = await ctx.db.get(staff.shopId);
        if (!shop || shop.isDeleted || shop.organizationId !== organizationId) {
          throw new ConvexError("Not found");
        }
        return { staff, shop, shopStatus: organizationShopOperatingStatus(shop.operatingStatus) };
      }),
    );
    if (new Set(currentMemberships.map((membership) => membership.shop._id)).size !== currentMemberships.length) {
      throw new ConvexError("ユーザーの店舗所属を確認できません。\n画面を更新して、もう一度お試しください。");
    }

    const currentFingerprint = await createOrganizationPersonShopMembershipFingerprint(
      currentMemberships.map((membership) => ({
        staffId: membership.staff._id,
        shopId: membership.shop._id,
        shopStatus: membership.shopStatus,
      })),
    );
    if (currentFingerprint !== args.expectedMembershipFingerprint) {
      throw new ConvexError(STALE_SHOP_MEMBERSHIP_CHANGE_ERROR);
    }

    const desiredActiveShopIds = sortShopIds(args.desiredActiveShopIds);
    const desiredShops = await Promise.all(
      desiredActiveShopIds.map(async (shopId) => {
        const shop = await ctx.db.get(shopId);
        if (!shop || shop.isDeleted || shop.organizationId !== organizationId) throw new ConvexError("Not found");
        if (organizationShopOperatingStatus(shop.operatingStatus) !== "active") {
          throw new ConvexError(INACTIVE_SHOP_MEMBERSHIP_CHANGE_DISABLED_REASON);
        }
        return shop;
      }),
    );
    const desiredShopById = new Map(desiredShops.map((shop) => [shop._id, shop]));
    const desiredShopIdSet = new Set(desiredActiveShopIds);
    const currentMembershipByShopId = new Map(
      currentMemberships.map((membership) => [membership.shop._id, membership]),
    );
    const removals = currentMemberships
      .filter((membership) => membership.shopStatus === "active" && !desiredShopIdSet.has(membership.shop._id))
      .sort((left, right) => left.shop._id.localeCompare(right.shop._id));
    const addedShopIds = desiredActiveShopIds.filter((shopId) => !currentMembershipByShopId.has(shopId));
    const removedShopIds = removals.map((membership) => membership.shop._id);

    const removalByShopId = new Map(removals.map((membership) => [membership.shop._id, membership]));
    if (
      args.removalPreviews.length !== removals.length ||
      args.removalPreviews.some((preview) => {
        const membership = removalByShopId.get(preview.shopId);
        return !membership || membership.staff._id !== preview.staffId;
      })
    ) {
      throw new ConvexError(STALE_PERSON_REMOVAL_PREVIEW_ERROR);
    }

    const removalPreviewByShopId = new Map(args.removalPreviews.map((preview) => [preview.shopId, preview]));
    const assignmentIds = new Set<Id<"shiftAssignments">>();
    for (const membership of removals) {
      const expectedPreview = removalPreviewByShopId.get(membership.shop._id);
      if (!expectedPreview) throw new ConvexError(STALE_PERSON_REMOVAL_PREVIEW_ERROR);
      const preview = await collectPersonRemovalPreview(ctx, {
        scope: {
          kind: "shop",
          organizationId,
          shopId: membership.shop._id,
          staffId: membership.staff._id,
        },
        staffs: [membership.staff],
        asOfDate: todayJST(),
      });
      if (preview.kind === "tooMany") {
        throw new ConvexError(
          `今日以降のシフトの割り当てが${preview.limit}件を超えています。\n先にシフトを整理してから、変更してください。`,
        );
      }
      if (
        expectedPreview.assignmentCount !== preview.assignmentCount ||
        expectedPreview.fingerprint !== preview.fingerprint
      ) {
        throw new ConvexError(STALE_PERSON_REMOVAL_PREVIEW_ERROR);
      }
      for (const assignmentId of preview.assignmentIds) {
        assignmentIds.add(assignmentId);
        if (assignmentIds.size > ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT) {
          throw new ConvexError(
            `今日以降のシフトの割り当てが${ORGANIZATION_PERSON_REMOVAL_ASSIGNMENT_LIMIT}件を超えています。\n先にシフトを整理してから、変更してください。`,
          );
        }
      }
    }

    if (addedShopIds.length === 0 && removedShopIds.length === 0) {
      const result = { changed: false, addedShopIds: [], removedShopIds: [] } satisfies ShopMembershipChangeResult;
      await recordOrganizationAuditEvent(ctx, {
        organizationId,
        actorUserId: ctx.user._id,
        actorPersonId: ctx.organizationMember.personId,
        action: "organization.person_shop_memberships_changed",
        targetKind: "person",
        targetId: person._id,
        fromState: shopMembershipChangeReceiptIntentState(intentHash),
        toState: shopMembershipChangeReceiptResultState(result),
        correlationId,
        suppressAnalyticsEvent: true,
      });
      return result;
    }

    const now = Date.now();
    await deletePersonRemovalAssignments(ctx, [...assignmentIds]);
    for (const membership of removals) {
      await ctx.db.patch(membership.staff._id, { isDeleted: true });
      await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, {
        shopId: membership.shop._id,
        staffId: membership.staff._id,
      });
    }
    const removedStaffIds = removals.map((membership) => membership.staff._id);
    await revokeStaffAccessForRemoval(ctx, removedStaffIds, now);
    await cancelOrganizationRecipientBusinessNotifications(ctx, { organizationId, staffIds: removedStaffIds });
    for (const membership of removals) {
      await recordOrganizationAuditEvent(ctx, {
        organizationId,
        actorUserId: ctx.user._id,
        actorPersonId: ctx.organizationMember.personId,
        action: "organization.person_removed_from_shop",
        targetKind: "person",
        targetId: person._id,
        fromState: `active:${membership.shop._id}`,
        toState: `removed:${membership.shop._id}`,
        correlationId: `${correlationId}:remove:${membership.staff._id}`,
        occurredAt: now,
        analyticsEvent: {
          eventType: "staffMembership.changed",
          shopId: membership.shop._id,
          subjectId: membership.staff._id,
          payload: {
            kind: "staffMembership",
            staffId: membership.staff._id,
            organizationPersonId: person._id,
            status: "removed",
            isShiftTarget: !membership.staff.excludedFromShift,
            validFrom: now,
            validTo: now,
            lineLinked: false,
            lineFollowing: false,
          },
        },
      });
    }

    for (const shopId of addedShopIds) {
      const targetShop = desiredShopById.get(shopId);
      if (!targetShop) throw new ConvexError("Not found");
      const derivedRequestId = await sha256Hex(
        JSON.stringify({ version: 1, requestKey, intentHash, operation: "add", shopId }),
      );
      const addition = await addStaffEntries(
        { ...ctx, shop: targetShop },
        {
          entries: [{ name: person.name, email: person.email }],
          requestId: derivedRequestId,
        },
      );
      if (addition.status !== "added" || addition.staffIds.length !== 1) {
        throw new ConvexError("スタッフの追加結果を確認できません。\n画面を更新して、もう一度お試しください。");
      }
      const addedStaff = await ctx.db.get(addition.staffIds[0]);
      if (
        !addedStaff ||
        addedStaff.isDeleted ||
        addedStaff.shopId !== targetShop._id ||
        addedStaff.organizationId !== organizationId ||
        addedStaff.organizationPersonId !== person._id
      ) {
        throw new ConvexError("スタッフの追加結果を確認できません。\n画面を更新して、もう一度お試しください。");
      }
    }

    await recalculateOpenRecruitmentStatsForShops(ctx, [...removedShopIds, ...addedShopIds], now);

    const result = { changed: true, addedShopIds, removedShopIds } satisfies ShopMembershipChangeResult;
    await recordOrganizationAuditEvent(ctx, {
      organizationId,
      actorUserId: ctx.user._id,
      actorPersonId: ctx.organizationMember.personId,
      action: "organization.person_shop_memberships_changed",
      targetKind: "person",
      targetId: person._id,
      fromState: shopMembershipChangeReceiptIntentState(intentHash),
      toState: shopMembershipChangeReceiptResultState(result),
      correlationId,
      occurredAt: now,
      suppressAnalyticsEvent: true,
    });
    return result;
  },
});

export const editStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
    name: v.string(),
    email: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parsed = editStaffSchema.safeParse({ name: args.name, email: args.email });
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください。");
    }
    const input = parsed.data;
    const staff = await getActiveStaffInShop(ctx, ctx.shop._id, args.staffId);
    if (!staff) {
      throw new ConvexError("Not found");
    }

    const trimmedEmail = normalizeEmail(input.email);
    const trimmedName = input.name;
    const organizationId = staff.organizationId;
    const organizationPersonId = staff.organizationPersonId;
    const hasOrganizationLink = Boolean(organizationId || organizationPersonId);
    if (hasOrganizationLink && (!organizationId || !organizationPersonId)) {
      throw new ConvexError("スタッフのユーザー情報を確認できません。\n組織設定で登録内容を確認してください。");
    }
    if (organizationId && (!ctx.organization || organizationId !== ctx.organization._id)) {
      throw new ConvexError("スタッフのユーザー情報を確認できません。\n組織設定で登録内容を確認してください。");
    }
    const organizationPerson = organizationId && organizationPersonId ? await ctx.db.get(organizationPersonId) : null;
    if (
      organizationId &&
      (!organizationPerson ||
        organizationPerson.organizationId !== organizationId ||
        organizationPerson.status !== "active")
    ) {
      throw new ConvexError("スタッフのユーザー情報を確認できません。\n組織設定で登録内容を確認してください。");
    }

    if (organizationPerson && organizationId) {
      const result = await updateOrganizationPersonProfile(ctx, {
        organizationId,
        personId: organizationPerson._id,
        actorUser: ctx.user,
        notificationShopId: ctx.shop._id,
        name: trimmedName,
        email: trimmedEmail,
      });
      if (result.changed) {
        await recordOrganizationAuditEvent(ctx, {
          organizationId,
          actorUserId: ctx.user._id,
          actorPersonId: ctx.organizationMember?.personId,
          action: "organization.person_profile_updated",
          targetKind: "person",
          targetId: organizationPerson._id,
        });
      }
      return null;
    }

    const duplicateByNormalized = await ctx.db
      .query("staffs")
      .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
        q.eq("shopId", ctx.shop._id).eq("emailNormalized", trimmedEmail).eq("isDeleted", false),
      )
      .first();
    const duplicate =
      duplicateByNormalized ??
      (await ctx.db
        .query("staffs")
        .withIndex("by_shopId_email_isDeleted", (q) =>
          q.eq("shopId", ctx.shop._id).eq("email", trimmedEmail).eq("isDeleted", false),
        )
        .first());
    if (duplicate && duplicate._id !== args.staffId) {
      throw new ConvexError("このメールアドレスはすでに使用されています。");
    }

    // TODO[narrow]: 全deploymentでm032が完走し、verifyStaffsのemail残件が全pageで0になった後にemail fallbackを削除する。
    const previousEmailNormalized = normalizeEmail(staff.emailNormalized ?? staff.email);
    const emailChanged = trimmedEmail !== previousEmailNormalized;
    const emailChangedAt = Date.now();
    await ctx.db.patch(staff._id, { name: trimmedName, email: trimmedEmail, emailNormalized: trimmedEmail });
    if (staff.userId === ctx.user._id) {
      // legacy staffでも表示名だけを同期し、シフト連絡先をusersのbootstrap snapshotへ逆同期しない。
      await ctx.db.patch(ctx.user._id, { name: trimmedName });
    }

    if (emailChanged) {
      const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
      await ctx.scheduler.runAfter(
        0,
        internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange,
        {
          staffId: staff._id,
          expectedEmailNormalized: trimmedEmail,
          emailChangedAt,
          ...notificationOrigin,
        },
      );
    }
    return null;
  },
});

export const sendOpenRecruitmentNotifications = managerMutation({
  args: {
    staffId: v.id("staffs"),
    requestId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ scheduled: v.literal(true) }),
    v.object({
      scheduled: v.literal(false),
      reason: v.union(v.literal("noEligibleRecruitments"), v.literal("rateLimited")),
    }),
  ),
  handler: async (ctx, args) => {
    await validateOptionalNotificationRequestId(args.requestId);
    const staff = await getSendableStaff(ctx, args.staffId);
    const notificationData = await ctx.runQuery(
      internal.notification.queries.getOpenRecruitmentNotificationDataForStaff,
      {
        staffId: staff._id,
      },
    );
    if (!notificationData || notificationData.shopId !== ctx.shop._id || notificationData.recruitments.length === 0) {
      return { scheduled: false, reason: "noEligibleRecruitments" as const };
    }

    const allowed = await allowStaffNotificationResend(
      ctx,
      staff._id,
      "openRecruitments",
      notificationData.recruitments.length,
    );
    if (!allowed) return { scheduled: false, reason: "rateLimited" as const };
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationsForStaff, {
      staffId: staff._id,
      ...notificationOrigin,
    });
    return { scheduled: true as const };
  },
});

export const sendCurrentShiftNotification = managerMutation({
  args: {
    staffId: v.id("staffs"),
    requestId: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ scheduled: v.literal(true) }),
    v.object({
      scheduled: v.literal(false),
      reason: v.union(
        v.literal("noCurrentShift"),
        v.literal("tooManyCurrentShifts"),
        v.literal("unconfirmedChanges"),
        v.literal("rateLimited"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await validateOptionalNotificationRequestId(args.requestId);
    const staff = await getSendableStaff(ctx, args.staffId);
    if (!isShiftTargetStaff(staff)) {
      return { scheduled: false, reason: "noCurrentShift" as const };
    }
    const scope = await getCurrentShiftNotificationScope(ctx, ctx.shop._id);
    if ("reason" in scope) return { scheduled: false, reason: scope.reason };

    const allowed = await allowStaffNotificationResend(ctx, staff._id, "currentShift", scope.recruitments.length);
    if (!allowed) return { scheduled: false, reason: "rateLimited" as const };
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });
    await createCurrentShiftNotificationFanouts(ctx, {
      staffId: staff._id,
      shopId: ctx.shop._id,
      recruitments: scope.recruitments,
      operationGroupKey: crypto.randomUUID(),
      ...notificationOrigin,
    });
    return { scheduled: true as const };
  },
});

/**
 * 旧deploymentが予約済みの個別確定通知actionを、同じdurable operationへexact-onceで収束させる。
 * 認可とquotaは旧public mutationで完了済みのため再消費せず、現在の配送scopeだけをfail closedで再検証する。
 */
export const prepareLegacyCurrentShiftConfirmationFanout = internalMutation({
  args: {
    staffId: v.id("staffs"),
    organizationBillingVersionAtOrigin: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    const shop = staff ? await ctx.db.get(staff.shopId) : null;
    if (!staff || staff.isDeleted || !isShiftTargetStaff(staff) || !(await isShopParentActive(ctx, shop))) {
      return { status: "skipped" as const, reason: "noCurrentShift" as const };
    }
    const lineAccount = await getStaffLineAccount(ctx, staff._id);
    if (staff.email.length === 0 && !(lineAccount?.lineUserId && lineAccount.following)) {
      return { status: "skipped" as const, reason: "noCurrentShift" as const };
    }

    const scope = await getCurrentShiftNotificationScope(ctx, staff.shopId);
    if ("reason" in scope) return { status: "skipped" as const, reason: scope.reason };

    const createdOperationCount = await createCurrentShiftNotificationFanouts(ctx, {
      staffId: staff._id,
      shopId: staff.shopId,
      recruitments: scope.recruitments,
      // 旧argsにはrequest identityがないため、staff単位の安定keyでaction retryと重複予約を一つへ寄せる。
      operationGroupKey: `legacy:${staff._id}`,
      ...(args.organizationBillingVersionAtOrigin === undefined
        ? {}
        : { organizationBillingVersionAtOrigin: args.organizationBillingVersionAtOrigin }),
    });
    return { status: "accepted" as const, createdOperationCount };
  },
});

export const setShiftExclusion = managerMutation({
  args: {
    staffId: v.id("staffs"),
    excluded: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await getActiveStaffInShop(ctx, ctx.shop._id, args.staffId);
    if (!staff) {
      throw new ConvexError("Not found");
    }
    // 削除と異なり、管理者（店舗共通アドレス本人）もシフト対象外にできる（主ユースケース）。
    const now = Date.now();
    await ctx.db.patch(args.staffId, { excludedFromShift: args.excluded });
    const organizationId = staff.organizationId ?? ctx.shop.organizationId;
    if (organizationId) {
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `staffMembership:${staff._id}:shiftTarget:${crypto.randomUUID()}`,
        eventType: "staffMembership.changed",
        occurredAt: now,
        organizationId,
        shopId: staff.shopId,
        subjectId: staff._id,
        payload: {
          kind: "staffMembership",
          staffId: staff._id,
          ...(staff.organizationPersonId ? { organizationPersonId: staff.organizationPersonId } : {}),
          status: "active",
          isShiftTarget: !args.excluded,
          validFrom: now,
        },
      });
    }

    // 対象外にする場合は、発行済みのシフト用セッション・マジックリンクを失効させ、
    // 古いリンクでのシフト閲覧・希望提出を即座に遮断する（LINE連携は他通知で使うため残す）。
    if (args.excluded) {
      const [sessions, magicLinks] = await Promise.all([
        ctx.db
          .query("sessions")
          .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
          .collect(),
        ctx.db
          .query("magicLinks")
          .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
          .collect(),
      ]);
      await Promise.all([
        ...sessions
          .filter((session) => !session.revokedAt)
          .map((session) => ctx.db.patch(session._id, { revokedAt: now })),
        ...magicLinks.filter((link) => !link.revokedAt).map((link) => ctx.db.patch(link._id, { revokedAt: now })),
      ]);
    }
    return null;
  },
});

/**
 * organization link未設定staffだけを扱う旧削除API。
 * TODO[narrow]: 全deploymentでm027完走・verifyStaffsのlink残件0・旧client配布終了を確認後に削除する。
 */
export const deleteStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await getActiveStaffInShop(ctx, ctx.shop._id, args.staffId);
    if (!staff) {
      throw new ConvexError("Not found");
    }
    if (staff.organizationId || staff.organizationPersonId) {
      throw new ConvexError("この店舗への所属は、組織設定のユーザー画面から解除してください。");
    }

    if (staff.userId === ctx.user._id) {
      throw new ConvexError("自分のアカウントは削除できません。");
    }

    const now = Date.now();
    await ctx.db.patch(args.staffId, { isDeleted: true });
    if (ctx.shop.organizationId) {
      await recordAnalyticsSourceEvent(ctx, {
        eventKey: `staffMembership:${staff._id}:deleted:${now}`,
        eventType: "staffMembership.changed",
        occurredAt: now,
        organizationId: ctx.shop.organizationId,
        shopId: staff.shopId,
        subjectId: staff._id,
        payload: {
          kind: "staffMembership",
          staffId: staff._id,
          status: "removed",
          isShiftTarget: !staff.excludedFromShift,
          validFrom: staff._creationTime,
          validTo: now,
        },
      });
    }
    await ctx.scheduler.runAfter(0, internal.notificationOutbox.mutations.deleteStaffNotificationHistoryBatch, {
      shopId: ctx.shop._id,
      staffId: args.staffId,
    });

    const [sessions, magicLinks, lineLinkTokens, lineAccounts] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
        .collect(),
      ctx.db
        .query("magicLinks")
        .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
        .collect(),
      ctx.db
        .query("lineLinkTokens")
        .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
        .collect(),
      ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", args.staffId))
        .collect(),
    ]);
    await Promise.all([
      ...sessions.map((session) => ctx.db.patch(session._id, { revokedAt: now })),
      ...magicLinks.map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineLinkTokens.map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineAccounts.map((account) => ctx.db.patch(account._id, { isDeleted: true, following: false })),
    ]);
    return null;
  },
});
