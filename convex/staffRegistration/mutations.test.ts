import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop, seedShop, seedShopMembership, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH } from "../constants";

describe("staffRegistration/mutations", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("店舗固定の登録リンクを作成し、再取得では同じリンクを返す", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, { subject: "manager_link", email: "manager-link@example.com" });
      return seeded.shopId;
    });

    const first = await t
      .withIdentity({ subject: "manager_link" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });
    const second = await t
      .withIdentity({ subject: "manager_link" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });

    expect(first.token).toBe(second.token);
    expect(first.registrationUrl).toContain(`/staff/register?token=${first.token}`);
  });

  it("スタッフが登録リンクから参加申請できる", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, { subject: "manager_submit", email: "manager-submit@example.com" });
      return seeded.shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_submit" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });

    await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請スタッフ",
      email: "Request@Example.com",
      acceptedLegal: true,
    });

    const requests = await t
      .withIdentity({ subject: "manager_submit" })
      .query(api.staffRegistration.queries.getPendingRequests, { shopId });
    expect(requests).toMatchObject([{ name: "申請スタッフ", email: "request@example.com" }]);
  });

  it("参加申請の入力内容をサーバー側でも検証する", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_validation",
        email: "manager-validation@example.com",
      });
      return seeded.shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_validation" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });

    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: "not-email",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("メールアドレスの形式で入力してください");
    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "",
        email: "request@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("名前を入力してください");
    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: "request@example.com",
        acceptedLegal: false,
      }),
    ).rejects.toThrow("利用規約とプライバシーポリシーに同意してください");
    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1),
        email: "request@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("名前は80文字以内で入力してください");
    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請\nスタッフ",
        email: "request@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("名前に使用できない文字が含まれています");
    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.comx`,
        acceptedLegal: true,
      }),
    ).rejects.toThrow(`メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`);
  });

  it("同じメールアドレスの承認待ち申請は重複登録できない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_duplicate",
        email: "manager-duplicate@example.com",
      });
      return seeded.shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_duplicate" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });

    await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請スタッフ",
      email: "duplicate@example.com",
      acceptedLegal: true,
    });

    const duplicateResult = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "別の申請スタッフ",
      email: "Duplicate@Example.com",
      acceptedLegal: true,
    });
    expect(duplicateResult).toEqual({ status: "already_applied" });
  });

  it("既存スタッフと同じメールアドレスでは参加申請できない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const { shopId } = await seedManagerShop(ctx, {
        subject: "manager_existing_staff",
        email: "manager-existing-staff@example.com",
      });
      await ctx.db.insert("staffs", {
        shopId,
        name: "既存スタッフ",
        email: "Existing@Example.com",
        isDeleted: false,
      });
      return shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_existing_staff" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });

    const existingResult = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請スタッフ",
      email: "existing@example.com",
      acceptedLegal: true,
    });
    expect(existingResult).toEqual({ status: "already_registered" });

    const requests = await t
      .withIdentity({ subject: "manager_existing_staff" })
      .query(api.staffRegistration.queries.getPendingRequests, { shopId });
    expect(requests).toEqual([]);
  });

  it("他店舗のシフト担当者は承認待ち申請を閲覧・承認・却下できない", async () => {
    const t = convexTest(schema, modules);
    const { managerShopId, otherShopId } = await t.run(async (ctx) => {
      const manager = await seedManagerShop(ctx, {
        subject: "manager_manager",
        email: "manager-manager@example.com",
      });
      const other = await seedManagerShop(ctx, { subject: "manager_other", email: "manager-other@example.com" });
      return { managerShopId: manager.shopId, otherShopId: other.shopId };
    });
    const link = await t
      .withIdentity({ subject: "manager_manager" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId: managerShopId });
    const submitResult = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "承認待ちスタッフ",
      email: "pending@example.com",
      acceptedLegal: true,
    });
    if (submitResult.status !== "ok") throw new Error(`unexpected status: ${submitResult.status}`);
    const { requestId } = submitResult;

    const otherShopRequests = await t
      .withIdentity({ subject: "manager_other" })
      .query(api.staffRegistration.queries.getPendingRequests, { shopId: otherShopId });
    expect(otherShopRequests).toEqual([]);
    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
        shopId: otherShopId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.staffRegistration.mutations.rejectRequest, {
        requestId,
        shopId: otherShopId,
      }),
    ).rejects.toThrow("Not found");
  });

  it("削除済み店舗とは別の有効な所属店舗を指定すると、その店舗の承認待ち申請を返す", async () => {
    const t = convexTest(schema, modules);
    const activeShopId = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, "manager_deleted_first", "manager-deleted-first@example.com");
      const deletedShopId = await seedShop(ctx, "削除済み店舗");
      await ctx.db.patch(deletedShopId, { isDeleted: true });
      await seedShopMembership(ctx, { userId, shopId: deletedShopId });

      const activeShopId = await seedShop(ctx, "残っている店舗");
      await seedShopMembership(ctx, { userId, shopId: activeShopId });
      await ctx.db.insert("staffRegistrationRequests", {
        shopId: activeShopId,
        name: "承認待ちスタッフ",
        email: "pending-active@example.com",
        emailNormalized: "pending-active@example.com",
        status: "pending",
        termsConsentVersion: "2026-01-01",
        privacyConsentVersion: "2026-01-01",
        termsDocumentVersion: "2026-01-01",
        privacyDocumentVersion: "2026-01-01",
        consentedAt: Date.now(),
        createdAt: Date.now(),
      });
      return activeShopId;
    });

    const requests = await t
      .withIdentity({ subject: "manager_deleted_first" })
      .query(api.staffRegistration.queries.getPendingRequests, { shopId: activeShopId });

    expect(requests).toMatchObject([{ name: "承認待ちスタッフ", email: "pending-active@example.com" }]);
  });

  it("承認するとstaffs作成・同意コピー・LINE連携メール・募集中シフト通知へ反映し、同意依頼メールは予約しない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, { subject: "manager_approve", email: "manager-approve@example.com" });
      await ctx.db.insert("recruitments", {
        shopId: seeded.shopId,
        periodStart: "2026-06-01",
        periodEnd: "2026-06-07",
        deadline: "2026-05-30",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      return seeded.shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_approve" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });
    const submitResult = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "承認スタッフ",
      email: "approved@example.com",
      acceptedLegal: true,
    });
    if (submitResult.status !== "ok") throw new Error(`unexpected status: ${submitResult.status}`);
    const { requestId } = submitResult;

    const { staffId } = await t
      .withIdentity({ subject: "manager_approve" })
      .mutation(api.staffRegistration.mutations.approveRequest, { requestId, shopId });

    const state = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      const consentState = await ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first();
      const request = await ctx.db.get(requestId);
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      return { staff, consentState, request, scheduled };
    });

    expect(state.staff).toMatchObject({ shopId, name: "承認スタッフ", email: "approved@example.com" });
    expect(state.consentState).toMatchObject({ method: "staff_registration" });
    expect(state.request).toMatchObject({ status: "approved", approvedStaffId: staffId });
    expect(
      state.scheduled.some(
        (job) =>
          job.name === "line/actions:sendInviteEmail" &&
          job.args[0]?.staffId === staffId &&
          job.args[0]?.context === "registration_approved",
      ),
    ).toBe(true);
    expect(
      state.scheduled.some(
        (job) =>
          job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff" &&
          job.args[0]?.staffId === staffId,
      ),
    ).toBe(true);
    expect(
      state.scheduled.some(
        (job) => job.name === "legal/actions:sendStaffConsentEmail" && job.args[0]?.staffId === staffId,
      ),
    ).toBe(false);
  });

  it("却下するとstaffs作成と通知予約をしない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, { subject: "manager_reject", email: "manager-reject@example.com" });
      return seeded.shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_reject" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });
    const submitResult = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "却下スタッフ",
      email: "rejected@example.com",
      acceptedLegal: true,
    });
    if (submitResult.status !== "ok") throw new Error(`unexpected status: ${submitResult.status}`);
    const { requestId } = submitResult;

    await t.withIdentity({ subject: "manager_reject" }).mutation(api.staffRegistration.mutations.rejectRequest, {
      requestId,
      shopId,
    });

    const state = await t.run(async (ctx) => {
      const request = await ctx.db.get(requestId);
      const staffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect();
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      return { request, staffs, scheduled };
    });

    expect(state.request).toMatchObject({ status: "rejected" });
    expect(state.staffs).toHaveLength(0);
    expect(state.scheduled).toHaveLength(0);
  });
});
