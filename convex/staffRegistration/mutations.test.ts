import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

describe("staffRegistration/mutations", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("店舗固定の登録リンクを作成し、再取得では同じリンクを返す", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, { subject: "manager_link", email: "manager-link@example.com" });
    });

    const first = await t
      .withIdentity({ subject: "manager_link" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    const second = await t
      .withIdentity({ subject: "manager_link" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});

    expect(first.token).toBe(second.token);
    expect(first.registrationUrl).toContain(`/staff/register?token=${first.token}`);
  });

  it("スタッフが登録リンクから参加申請できる", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, { subject: "manager_submit", email: "manager-submit@example.com" });
    });
    const link = await t
      .withIdentity({ subject: "manager_submit" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});

    await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請スタッフ",
      email: "Request@Example.com",
      acceptedLegal: true,
    });

    const requests = await t
      .withIdentity({ subject: "manager_submit" })
      .query(api.staffRegistration.queries.getPendingRequests, {});
    expect(requests).toMatchObject([{ name: "申請スタッフ", email: "request@example.com" }]);
  });

  it("参加申請の入力内容をサーバー側でも検証する", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, { subject: "manager_validation", email: "manager-validation@example.com" });
    });
    const link = await t
      .withIdentity({ subject: "manager_validation" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});

    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: "not-email",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("正しいメールアドレスを入力してください");
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
  });

  it("同じメールアドレスの承認待ち申請は重複登録できない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, { subject: "manager_duplicate", email: "manager-duplicate@example.com" });
    });
    const link = await t
      .withIdentity({ subject: "manager_duplicate" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});

    await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請スタッフ",
      email: "duplicate@example.com",
      acceptedLegal: true,
    });

    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "別の申請スタッフ",
        email: "Duplicate@Example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("このメールアドレスは申請済みです");
  });

  it("既存スタッフと同じメールアドレスでは参加申請できない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
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
    });
    const link = await t
      .withIdentity({ subject: "manager_existing_staff" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});

    await expect(
      t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: "existing@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("このメールアドレスはすでに登録されています");

    const requests = await t
      .withIdentity({ subject: "manager_existing_staff" })
      .query(api.staffRegistration.queries.getPendingRequests, {});
    expect(requests).toEqual([]);
  });

  it("他店舗のシフト担当者は承認待ち申請を閲覧・承認・却下できない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedManagerShop(ctx, { subject: "manager_manager", email: "manager-manager@example.com" });
      await seedManagerShop(ctx, { subject: "manager_other", email: "manager-other@example.com" });
    });
    const link = await t
      .withIdentity({ subject: "manager_manager" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    const { requestId } = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "承認待ちスタッフ",
      email: "pending@example.com",
      acceptedLegal: true,
    });

    const otherShopRequests = await t
      .withIdentity({ subject: "manager_other" })
      .query(api.staffRegistration.queries.getPendingRequests, {});
    expect(otherShopRequests).toEqual([]);
    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
      }),
    ).rejects.toThrow("Not found");
    await expect(
      t.withIdentity({ subject: "manager_other" }).mutation(api.staffRegistration.mutations.rejectRequest, {
        requestId,
      }),
    ).rejects.toThrow("Not found");
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
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    const { requestId } = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "承認スタッフ",
      email: "approved@example.com",
      acceptedLegal: true,
    });

    const { staffId } = await t
      .withIdentity({ subject: "manager_approve" })
      .mutation(api.staffRegistration.mutations.approveRequest, { requestId });

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
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {});
    const { requestId } = await t.mutation(api.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "却下スタッフ",
      email: "rejected@example.com",
      acceptedLegal: true,
    });

    await t.withIdentity({ subject: "manager_reject" }).mutation(api.staffRegistration.mutations.rejectRequest, {
      requestId,
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
