import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { managerMutation } from "../_lib/functions";
import { rateLimit } from "../_lib/rateLimits";
import { getStaffLineAccount } from "../line/service";
import { addStaffsSchema, editStaffSchema } from "./schemas";
import { findActiveStaffByEmail, normalizeEmail } from "./service";

type StaffNotificationKind = "openRecruitments" | "currentShift";
type ManagerStaffMutationCtx = MutationCtx & {
  user: Doc<"users">;
  shop: Doc<"shops">;
};

async function getSendableStaff(ctx: ManagerStaffMutationCtx, staffId: Id<"staffs">) {
  const staff = await ctx.db.get(staffId);
  if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
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
  const shortLimit = await rateLimit(ctx, {
    name: "staffNotificationResendShort",
    key: `${ctx.shop._id}:${staffId}:${kind}`,
  });
  return shortLimit.ok;
}

export const addStaffs = managerMutation({
  args: {
    entries: v.array(v.object({ name: v.string(), email: v.string() })),
  },
  handler: async (ctx, args) => {
    const parsed = addStaffsSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }
    const validEntries = parsed.data.entries
      .map((entry) => ({ name: entry.name, email: normalizeEmail(entry.email) }))
      .filter((e) => e.name !== "");

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

    const inserted: Id<"staffs">[] = [];
    for (const entry of validEntries) {
      const id = await ctx.db.insert("staffs", {
        shopId: ctx.shop._id,
        name: entry.name,
        email: entry.email,
        emailNormalized: entry.email,
        isDeleted: false,
      });
      inserted.push(id);
    }
    for (const staffId of inserted) {
      // スタッフ追加直後に必要な案内をまとめて fire-and-forget する。
      // mutation は登録完了を優先し、外部送信の失敗や dry-run 判定は action 側で扱う。
      await ctx.scheduler.runAfter(0, internal.legal.actions.sendStaffConsentEmail, {
        staffId,
      });
      await ctx.scheduler.runAfter(0, internal.line.actions.sendInviteEmail, {
        staffId,
      });
      await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaff, {
        staffId,
      });
    }
    return inserted;
  },
});

export const editStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const parsed = editStaffSchema.safeParse({ name: args.name, email: args.email });
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }
    const input = parsed.data;
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
      throw new ConvexError("Not found");
    }

    const trimmedEmail = normalizeEmail(input.email);
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

    const trimmedName = input.name;
    const previousEmailNormalized = (staff.emailNormalized ?? staff.email).trim().toLowerCase();
    const emailChanged = trimmedEmail !== previousEmailNormalized;
    const emailChangedAt = Date.now();
    await ctx.db.patch(args.staffId, { name: trimmedName, email: trimmedEmail, emailNormalized: trimmedEmail });
    if (staff.userId === ctx.user._id) {
      // manager 自身をスタッフとして持つ店舗では、スタッフ名と管理者名を同じ表示名として同期する。
      await ctx.db.patch(ctx.user._id, { name: trimmedName, email: trimmedEmail, emailNormalized: trimmedEmail });
    }

    if (emailChanged) {
      await ctx.scheduler.runAfter(
        0,
        internal.notification.actions.sendOpenRecruitmentNotificationEmailsForStaffEmailChange,
        {
          staffId: args.staffId,
          expectedEmailNormalized: trimmedEmail,
          emailChangedAt,
        },
      );
    }
  },
});

export const sendOpenRecruitmentNotifications = managerMutation({
  args: {
    staffId: v.id("staffs"),
  },
  handler: async (ctx, args) => {
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

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendOpenRecruitmentNotificationsForStaff, {
      staffId: staff._id,
    });
    return { scheduled: true as const };
  },
});

export const sendCurrentShiftNotification = managerMutation({
  args: {
    staffId: v.id("staffs"),
  },
  handler: async (ctx, args) => {
    const staff = await getSendableStaff(ctx, args.staffId);
    const notificationData = await ctx.runQuery(internal.notification.queries.getCurrentConfirmationEmailDataForStaff, {
      staffId: staff._id,
    });
    if (!notificationData || notificationData.shopId !== ctx.shop._id || notificationData.recruitments.length === 0) {
      return { scheduled: false, reason: "noCurrentShift" as const };
    }

    const allowed = await allowStaffNotificationResend(ctx, staff._id, "currentShift");
    if (!allowed) return { scheduled: false, reason: "rateLimited" as const };

    await ctx.scheduler.runAfter(0, internal.notification.actions.sendCurrentShiftConfirmationForStaff, {
      staffId: staff._id,
    });
    return { scheduled: true as const };
  },
});

export const setShiftExclusion = managerMutation({
  args: {
    staffId: v.id("staffs"),
    excluded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
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
  },
});

export const deleteStaff = managerMutation({
  args: {
    staffId: v.id("staffs"),
  },
  handler: async (ctx, args) => {
    const staff = await ctx.db.get(args.staffId);
    if (!staff || staff.shopId !== ctx.shop._id || staff.isDeleted) {
      throw new ConvexError("Not found");
    }

    if (staff.userId === ctx.user._id) {
      throw new ConvexError("自分のアカウントは削除できません");
    }

    await ctx.db.patch(args.staffId, { isDeleted: true });

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
  },
});
