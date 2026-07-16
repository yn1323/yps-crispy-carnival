import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { getShopActivationReminderAt } from "../_lib/dateFormat";
import { authenticatedMutation } from "../_lib/functions";
import { normalizeSubmissionPattern, submissionPatternValidator } from "../_lib/submissionPattern";
import { recordStaffLegalConsent, recordUserLegalConsent } from "../legal/service";
import { recordOrganizationAuditEvent } from "../organization/audit";
import { TRIAL_ENDING_REMINDER_LEAD_MS } from "../organizationBilling/notification";
import { calculateTrialEndsAt } from "../organizationBilling/policy";
import { ensureDefaultPosition } from "../position/service";
import { sendReminderRef } from "../shopActivationReminder/refs";
import { normalizeEmail } from "../staff/service";
import { setupShopAndManagerSchema } from "./schemas";

export const setupShopAndManager = authenticatedMutation({
  args: {
    shopName: v.string(),
    submissionPattern: submissionPatternValidator,
    managerName: v.string(),
    managerEmail: v.string(),
    acceptedLegal: v.literal(true),
  },
  returns: v.id("shops"),
  handler: async (ctx, args) => {
    const parsed = setupShopAndManagerSchema.safeParse(args);
    if (!parsed.success) {
      throw new ConvexError(parsed.error.issues[0]?.message ?? "入力内容を確認してください");
    }
    const input = parsed.data;
    const currentUser = ctx.user;
    if (currentUser?.isDeleted) {
      throw new ConvexError("無効になったアカウントでは初期設定を開始できません");
    }
    if (currentUser) {
      const selfCreatedOrganization = await ctx.db
        .query("organizations")
        .withIndex("by_createdByUserId", (q) => q.eq("createdByUserId", currentUser._id))
        .first();
      if (selfCreatedOrganization) {
        throw new ConvexError("自分で作成できる事業者は一つまでです");
      }

      // TODO[narrow]: develop/prodでm009_shops_to_organizationsと
      //   m010_shop_members_to_organization_membersが完走していることを
      //   `pnpm convex:migrate:status`（state: done）で確認後、このlegacy shopMembers guardを削除する。
      //   事業者へ招待された所属は自分で作成した事業者ではないため、org付き店舗はここで拒否しない。
      const legacyMemberships = ctx.db
        .query("shopMembers")
        .withIndex("by_userId_and_isDeleted", (q) => q.eq("userId", currentUser._id).eq("isDeleted", false));
      for await (const membership of legacyMemberships) {
        const legacyShop = await ctx.db.get(membership.shopId);
        if (legacyShop && !legacyShop.isDeleted && !legacyShop.organizationId) {
          throw new ConvexError("既に店舗が登録されています");
        }
      }
    }

    const now = Date.now();
    const managerEmailNormalized = normalizeEmail(input.managerEmail);
    const userId = currentUser
      ? currentUser._id
      : await ctx.db.insert("users", {
          authTokenIdentifier: ctx.identity.tokenIdentifier,
          name: input.managerName,
          email: input.managerEmail,
          emailNormalized: managerEmailNormalized,
          role: "manager",
          isDeleted: false,
        });
    if (currentUser) {
      await ctx.db.patch(currentUser._id, {
        name: input.managerName,
        email: input.managerEmail,
        emailNormalized: managerEmailNormalized,
      });
    }

    const organizationId = await ctx.db.insert("organizations", {
      createdByUserId: userId,
      name: input.shopName,
      billingEmail: input.managerEmail,
      billingEmailNormalized: managerEmailNormalized,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });
    const personId = await ctx.db.insert("organizationPeople", {
      organizationId,
      userId,
      name: input.managerName,
      email: input.managerEmail,
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

    const submissionPattern = normalizeSubmissionPattern(input.submissionPattern);
    const shopId = await ctx.db.insert("shops", {
      organizationId,
      operatingStatus: "active",
      name: input.shopName,
      regularClosedDays: [],
      submissionPattern,
      isDeleted: false,
    });
    const trialEndsAt = calculateTrialEndsAt(now);
    await ctx.db.insert("organizationBillingStates", {
      organizationId,
      state: { kind: "trial", trialEndsAt },
      freeManagerPersonId: personId,
      freeShopId: shopId,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // TODO[narrow]: develop/prodでm009〜m011が完走し、分析と旧読み取りがorganizationBillingStatesへ
    //   切り替わったことを `pnpm convex:migrate:status` と `rg -n "shopBillingStates" convex apps` で確認後、
    //   このshopBillingStates互換書き込みを削除する。
    await ctx.db.insert("shopBillingStates", {
      shopId,
      planKey: "free",
      source: "system",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("shopMembers", {
      shopId,
      userId,
      role: "manager",
      isDeleted: false,
    });
    await ensureDefaultPosition(ctx, shopId);

    await recordUserLegalConsent(ctx, {
      userId,
      shopId,
      method: "manager_setup",
    });

    // manager もスタッフ一覧に含める。自分のシフトやLINE通知を同じ画面で扱うため、
    // users と staffs は userId で紐付け、後続の編集時に表示名を同期する。
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      organizationId,
      organizationPersonId: personId,
      name: input.managerName,
      email: input.managerEmail,
      emailNormalized: managerEmailNormalized,
      userId,
      isDeleted: false,
    });

    // 初回セットアップで同意済みの manager は、同時に作られる staff としても提出時の同意確認を不要にする。
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
      toState: "trial",
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
    await ctx.scheduler.runAt(trialEndsAt, internal.organizationBilling.mutations.processDeadline, {
      organizationId,
      expectedVersion: 1,
      expectedDeadlineAt: trialEndsAt,
    });
    await ctx.scheduler.runAt(
      trialEndsAt - TRIAL_ENDING_REMINDER_LEAD_MS,
      internal.organizationBilling.actions.enqueueBillingNotification,
      {
        organizationId,
        event: "trialEnding",
        eventKey: `${organizationId}:trial-ending:${trialEndsAt}`,
        expectedDeadlineAt: trialEndsAt,
      },
    );

    return shopId;
  },
});
