import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { toAuditRequestKey } from "../_lib/auditCorrelation";
import { managerMutation } from "../_lib/functions";
import { checkRateLimit, rateLimit } from "../_lib/rateLimits";
import { normalizeEmail } from "../_lib/validation";
import { getStaffLineAccount } from "../line/service";
import { getBusinessNotificationOrigin } from "../notificationOutbox/origin";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { updateOrganizationPersonProfile } from "../organization/personProfile";
import { requireOrganizationCapacity } from "../organizationBilling/service";
import { addStaffsSchema, editStaffSchema } from "./schemas";
import {
  findActiveStaffByEmail,
  getActiveStaffInShop,
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
    throw new ConvexError("同じリクエストIDが別の追加操作で使用されています");
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
      throw new ConvexError("以前のスタッフ追加結果を確認できません");
    }
    staffIds.push(staff._id);
    if (audit.fromState === "removedPerson") {
      if (!staff.organizationPersonId) throw new ConvexError("以前のスタッフ追加結果を確認できません");
      reactivatedPersonIds.push(staff.organizationPersonId);
    }
  }
  if (!sameIds(reactivatedPersonIds, args.confirmedPersonIds)) {
    throw new ConvexError("確認対象が変わりました。追加内容をもう一度確認してください");
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
    throw new ConvexError("メールアドレスまたはLINE連携が必要です");
  }

  return staff;
}

async function allowStaffNotificationResend(
  ctx: ManagerStaffMutationCtx,
  staffId: Id<"staffs">,
  kind: StaffNotificationKind,
) {
  const recipientScope = `${ctx.shop._id}:${staffId}:${kind}`;
  const actorKey = `${ctx.user._id}:${recipientScope}`;
  const organizationScope = ctx.organization?._id ?? ctx.shop._id;
  const organizationKey = `${organizationScope}:${recipientScope}`;
  const limits = [
    { name: "staffNotificationResendActorShort", key: actorKey },
    { name: "staffNotificationResendActorDaily", key: actorKey },
    { name: "staffNotificationResendOrganizationShort", key: organizationKey },
    { name: "staffNotificationResendOrganizationDaily", key: organizationKey },
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

type AddStaffEntriesArgs = {
  entries: Array<{ name: string; email: string }>;
  confirmReactivationPersonIds?: Array<Id<"organizationPeople">>;
  requestId: string;
};

async function addStaffEntries(ctx: ManagerStaffMutationCtx, args: AddStaffEntriesArgs) {
  const parsed = addStaffsSchema.safeParse(args);
  if (!parsed.success) {
    throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
  }
  const requestId = await toAuditRequestKey(args.requestId);
  const validEntries = parsed.data.entries
    .map((entry) => ({ name: entry.name, email: normalizeEmail(entry.email) }))
    .filter((e) => e.name !== "");
  const confirmedPersonIds = args.confirmReactivationPersonIds ?? [];
  if (new Set(confirmedPersonIds).size !== confirmedPersonIds.length) {
    throw new ConvexError("確認対象が重複しています。追加内容をもう一度確認してください");
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
    throw new ConvexError("確認対象が変わりました。追加内容をもう一度確認してください");
  }

  const inputEmails = new Set<string>();
  for (const entry of validEntries) {
    if (inputEmails.has(entry.email)) {
      throw new ConvexError("同じメールアドレスが入力されています");
    }
    inputEmails.add(entry.email);

    const existingStaff = await findActiveStaffByEmail(ctx, ctx.shop._id, entry.email);
    if (existingStaff) {
      throw new ConvexError("このメールアドレスはすでに登録されています");
    }

    const pendingRequest = await ctx.db
      .query("staffRegistrationRequests")
      .withIndex("by_shopId_emailNormalized_status", (q) =>
        q.eq("shopId", ctx.shop._id).eq("emailNormalized", entry.email).eq("status", "pending"),
      )
      .first();
    if (pendingRequest) {
      throw new ConvexError("このメールアドレスは承認待ちです");
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
      throw new ConvexError("確認対象が変わりました。追加内容をもう一度確認してください");
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
    const id = await ctx.db.insert("staffs", {
      shopId: ctx.shop._id,
      ...(entry.organizationId && entry.organizationPersonId
        ? { organizationId: entry.organizationId, organizationPersonId: entry.organizationPersonId }
        : {}),
      name: entry.name,
      email: entry.email,
      emailNormalized: entry.email,
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
      if (!entry) throw new ConvexError("スタッフ追加結果を確認できません");
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
      throw new ConvexError("スタッフ追加結果を確認できません");
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
      throw new ConvexError("スタッフ追加結果を確認できません");
    }
    return { staffId };
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
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
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
      throw new ConvexError("スタッフの人物情報を確認できません");
    }
    const organizationPerson = organizationId && organizationPersonId ? await ctx.db.get(organizationPersonId) : null;
    if (
      organizationId &&
      (!organizationPerson ||
        organizationPerson.organizationId !== organizationId ||
        organizationPerson.status !== "active")
    ) {
      throw new ConvexError("スタッフの人物情報を確認できません");
    }

    if (organizationPerson && organizationId) {
      await updateOrganizationPersonProfile(ctx, {
        organizationId,
        personId: organizationPerson._id,
        actorUser: ctx.user,
        notificationShopId: ctx.shop._id,
        name: trimmedName,
        email: trimmedEmail,
      });
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
      throw new ConvexError("このメールアドレスは既に使用されています");
    }

    const previousEmailNormalized = normalizeEmail(staff.emailNormalized ?? staff.email);
    const emailChanged = trimmedEmail !== previousEmailNormalized;
    const emailChangedAt = Date.now();
    await ctx.db.patch(staff._id, { name: trimmedName, email: trimmedEmail, emailNormalized: trimmedEmail });
    if (staff.userId === ctx.user._id) {
      // manager 自身をスタッフとして持つ店舗では、スタッフ名と管理者名を同じ表示名として同期する。
      await ctx.db.patch(ctx.user._id, { name: trimmedName, email: trimmedEmail, emailNormalized: trimmedEmail });
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

    const allowed = await allowStaffNotificationResend(ctx, staff._id, "openRecruitments");
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
      reason: v.union(v.literal("noCurrentShift"), v.literal("rateLimited")),
    }),
  ),
  handler: async (ctx, args) => {
    await validateOptionalNotificationRequestId(args.requestId);
    const staff = await getSendableStaff(ctx, args.staffId);
    const notificationData = await ctx.runQuery(internal.notification.queries.getCurrentConfirmationEmailDataForStaff, {
      staffId: staff._id,
    });
    if (!notificationData || notificationData.shopId !== ctx.shop._id || notificationData.recruitments.length === 0) {
      return { scheduled: false, reason: "noCurrentShift" as const };
    }

    const allowed = await allowStaffNotificationResend(ctx, staff._id, "currentShift");
    if (!allowed) return { scheduled: false, reason: "rateLimited" as const };
    const notificationOrigin = await getBusinessNotificationOrigin(ctx, { shopId: ctx.shop._id });

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendCurrentShiftConfirmationForStaff, {
      staffId: staff._id,
      ...notificationOrigin,
    });
    return { scheduled: true as const };
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
    await ctx.db.patch(args.staffId, { excludedFromShift: args.excluded });

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
      const now = Date.now();
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
      throw new ConvexError("グループ設定から店舗所属を解除してください");
    }

    if (staff.userId === ctx.user._id) {
      throw new ConvexError("自分のアカウントは削除できません");
    }

    await ctx.db.patch(args.staffId, { isDeleted: true });
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
    const now = Date.now();
    await Promise.all([
      ...sessions.map((session) => ctx.db.patch(session._id, { revokedAt: now })),
      ...magicLinks.map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineLinkTokens.map((token) => ctx.db.patch(token._id, { revokedAt: now })),
      ...lineAccounts.map((account) => ctx.db.patch(account._id, { isDeleted: true, following: false })),
    ]);
    return null;
  },
});
