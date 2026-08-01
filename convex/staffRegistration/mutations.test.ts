import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  seedLegacyShopMembership,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedShop,
  seedUser,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { EMAIL_MAX_LENGTH, PERSON_NAME_MAX_LENGTH, STAFF_REGISTRATION_PENDING_LIMIT } from "../constants";

async function getPendingRequestId(
  t: TestConvex<typeof schema>,
  shopId: Id<"shops">,
  email: string,
): Promise<Id<"staffRegistrationRequests">> {
  const emailNormalized = email.trim().toLowerCase();
  const request = await t.run(
    async (ctx) =>
      await ctx.db
        .query("staffRegistrationRequests")
        .withIndex("by_shopId_emailNormalized_status", (q) =>
          q.eq("shopId", shopId).eq("emailNormalized", emailNormalized).eq("status", "pending"),
        )
        .unique(),
  );
  if (!request) throw new Error(`pending registration request not found: ${emailNormalized}`);
  return request._id;
}

describe("staffRegistration/mutations", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

    await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
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

  it("同一tokenが異なる店舗に重複している場合は一般化したエラーで申請を作成しない", async () => {
    const t = convexTest(schema, modules);
    const token = "duplicate-target-registration-token";
    await t.run(async (ctx) => {
      for (const index of [1, 2]) {
        const shopId = await seedShop(ctx, `重複登録token対象店舗${index}`);
        await ctx.db.insert("shopRegistrationLinks", {
          shopId,
          token,
          createdAt: Date.now(),
        });
      }
    });

    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token,
        name: "重複token申請者",
        email: "duplicate-registration@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("登録リンクの有効期限が切れています");

    const state = await t.run(async (ctx) => ({
      requests: await ctx.db.query("staffRegistrationRequests").collect(),
      links: await ctx.db
        .query("shopRegistrationLinks")
        .withIndex("by_token", (q) => q.eq("token", token))
        .collect(),
    }));
    expect(state.requests).toEqual([]);
    expect(state.links).toHaveLength(2);
    expect(new Set(state.links.map((link) => link.shopId)).size).toBe(2);
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
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: "not-email",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("メールアドレスの形式で入力してください");
    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "",
        email: "request@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("名前を入力してください");
    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: "request@example.com",
        acceptedLegal: false,
      }),
    ).rejects.toThrow("利用規約とプライバシーポリシーに同意してください");
    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "あ".repeat(PERSON_NAME_MAX_LENGTH + 1),
        email: "request@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("名前は80文字以内で入力してください");
    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請\nスタッフ",
        email: "request@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("名前に使用できない文字が含まれています");
    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "申請スタッフ",
        email: `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(57)}.comx`,
        acceptedLegal: true,
      }),
    ).rejects.toThrow(`メールアドレスは${EMAIL_MAX_LENGTH}文字以内で入力してください`);
  });

  it.each(["archived", "planSuspended"] as const)(
    "%s店舗では既存の公開登録リンクから新しい申請を作成できない",
    async (operatingStatus) => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(
        async (ctx) =>
          await seedOrganizationManagerShop(ctx, {
            subject: `registration_${operatingStatus}_submit_manager`,
            plan: "pro",
          }),
      );
      const link = await t
        .withIdentity({ subject: `registration_${operatingStatus}_submit_manager` })
        .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId: seeded.shopId });
      await t.run(async (ctx) => await ctx.db.patch(seeded.shopId, { operatingStatus }));

      await expect(
        t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
          token: link.token,
          name: "停止後の申請者",
          email: `${operatingStatus}-submit@example.com`,
          acceptedLegal: true,
        }),
      ).rejects.toThrow("登録リンクの有効期限が切れています");

      await expect(t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect())).resolves.toEqual(
        [],
      );
    },
  );

  it("契約制限開始後は既存の公開登録リンクから新しい申請を作成できない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "registration_restricted_submit_manager",
          plan: "pro",
        }),
    );
    const link = await t
      .withIdentity({ subject: "registration_restricted_submit_manager" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId: seeded.shopId });
    await t.run(async (ctx) => {
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "restricted",
          reason: "freeConditionsNotMet",
          previousPlan: "pro",
          recoveryManagerPersonIds: [seeded.personId],
          previousActiveShopIds: [seeded.shopId],
          restrictedAt: Date.now(),
        },
      });
    });

    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "制限後の申請者",
        email: "restricted-submit@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow("登録リンクの有効期限が切れています");

    await expect(t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect())).resolves.toEqual([]);
  });

  it("新規・申請済み・登録済みの公開応答を統一し、重複時は副作用を作らない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_duplicate",
        email: "manager-duplicate@example.com",
      });
      await ctx.db.insert("staffs", {
        shopId: seeded.shopId,
        name: "既存スタッフ",
        email: "Existing@Example.com",
        isDeleted: false,
      });
      return seeded.shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_duplicate" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });

    const newResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請スタッフ",
      email: "duplicate@example.com",
      acceptedLegal: true,
    });
    const stateAfterNew = await t.run(async (ctx) => ({
      requests: await ctx.db.query("staffRegistrationRequests").collect(),
      staffs: await ctx.db.query("staffs").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const pendingResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "別の申請スタッフ",
      email: "Duplicate@Example.com",
      acceptedLegal: true,
    });
    const existingResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請スタッフ",
      email: "existing@example.com",
      acceptedLegal: true,
    });
    const stateAfterDuplicates = await t.run(async (ctx) => ({
      requests: await ctx.db.query("staffRegistrationRequests").collect(),
      staffs: await ctx.db.query("staffs").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));

    expect(newResult).toEqual({ status: "accepted" });
    expect(pendingResult).toEqual(newResult);
    expect(existingResult).toEqual(newResult);
    expect(stateAfterNew.requests).toHaveLength(1);
    expect(stateAfterDuplicates).toEqual(stateAfterNew);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("承認待ち上限の直前だけ一件を保存し、到達後は同じ受付結果のまま増やさない", async () => {
    const t = convexTest(schema, modules);
    const shopId = await t.run(async (ctx) => {
      const seeded = await seedManagerShop(ctx, {
        subject: "manager_pending_cap",
        email: "manager-pending-cap@example.com",
      });
      for (let index = 0; index < STAFF_REGISTRATION_PENDING_LIMIT - 1; index += 1) {
        const email = `pending-cap-${index}@example.com`;
        await ctx.db.insert("staffRegistrationRequests", {
          shopId: seeded.shopId,
          name: `承認待ち${index}`,
          email,
          emailNormalized: email,
          status: "pending",
          termsConsentVersion: "2026-01-01",
          privacyConsentVersion: "2026-01-01",
          termsDocumentVersion: "2026-01-01",
          privacyDocumentVersion: "2026-01-01",
          consentedAt: Date.now(),
          createdAt: Date.now(),
        });
      }
      return seeded.shopId;
    });
    const link = await t
      .withIdentity({ subject: "manager_pending_cap" })
      .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });

    const beforeCap = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "上限直前",
      email: "pending-cap-last@example.com",
      acceptedLegal: true,
    });
    const atCap = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "上限到達後",
      email: "pending-cap-over@example.com",
      acceptedLegal: true,
    });
    const state = await t.run(async (ctx) => ({
      requests: await ctx.db
        .query("staffRegistrationRequests")
        .withIndex("by_shopId_status", (q) => q.eq("shopId", shopId).eq("status", "pending"))
        .collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));

    expect(beforeCap).toEqual({ status: "accepted" });
    expect(atCap).toEqual(beforeCap);
    expect(state.requests).toHaveLength(STAFF_REGISTRATION_PENDING_LIMIT);
    expect(state.requests.some((request) => request.emailNormalized === "pending-cap-last@example.com")).toBe(true);
    expect(state.requests.some((request) => request.emailNormalized === "pending-cap-over@example.com")).toBe(false);
    expect(state.audits).toEqual([]);
    expect(state.outbox).toEqual([]);
    expect(state.scheduled).toEqual([]);
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
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "承認待ちスタッフ",
      email: "pending@example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, managerShopId, "pending@example.com");

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

  it.each(["archived", "planSuspended", "restricted", "readOnly"] as const)(
    "%sへの状態変更後は承認待ち申請を確定できず、副作用を作らない",
    async (blockedState) => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(
        async (ctx) =>
          await seedOrganizationManagerShop(ctx, {
            subject: `registration_${blockedState}_approve_manager`,
            plan: "pro",
          }),
      );
      const asManager = t.withIdentity({ subject: `registration_${blockedState}_approve_manager` });
      const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
        shopId: seeded.shopId,
      });
      const submitted = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "状態変更前の申請者",
        email: `${blockedState}-approve@example.com`,
        acceptedLegal: true,
      });
      expect(submitted).toEqual({ status: "accepted" });
      const requestId = await getPendingRequestId(t, seeded.shopId, `${blockedState}-approve@example.com`);

      await t.run(async (ctx) => {
        if (blockedState === "archived" || blockedState === "planSuspended") {
          await ctx.db.patch(seeded.shopId, { operatingStatus: blockedState });
          return;
        }
        if (blockedState === "readOnly") {
          await ctx.db.patch(seeded.memberId, { status: "readOnly", updatedAt: Date.now() });
          return;
        }
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique();
        if (!billingState) throw new Error("billing state not found");
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "freeConditionsNotMet",
            previousPlan: "pro",
            recoveryManagerPersonIds: [seeded.personId],
            previousActiveShopIds: [seeded.shopId],
            restrictedAt: Date.now(),
          },
        });
      });

      await expect(
        asManager.mutation(api.staffRegistration.mutations.approveRequest, {
          requestId,
          shopId: seeded.shopId,
        }),
      ).rejects.toThrow();

      const state = await t.run(async (ctx) => ({
        request: await ctx.db.get(requestId),
        people: await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
          .collect(),
        staffs: await ctx.db.query("staffs").collect(),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.request?.status).toBe("pending");
      expect(state.people).toHaveLength(1);
      expect(state.staffs).toEqual([]);
      expect(state.audits).toEqual([]);
      expect(state.scheduled).toEqual([]);
    },
  );

  it("削除済み店舗とは別の有効な所属店舗を指定すると、その店舗の承認待ち申請を返す", async () => {
    const t = convexTest(schema, modules);
    const activeShopId = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, "manager_deleted_first", "manager-deleted-first@example.com");
      const deletedShopId = await seedShop(ctx, "削除済み店舗");
      await ctx.db.patch(deletedShopId, { isDeleted: true });
      await seedLegacyShopMembership(ctx, { userId, shopId: deletedShopId });

      const activeShopId = await seedShop(ctx, "残っている店舗");
      await seedLegacyShopMembership(ctx, { userId, shopId: activeShopId });
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
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "承認スタッフ",
      email: "approved@example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, shopId, "approved@example.com");

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

  it("事業者配下の承認は人物とstaffsをdual-writeし、同じ申請の再承認でも重複保存しない", async () => {
    const t = convexTest(schema, modules);
    const { shopId, organizationId } = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "organization_approve_manager",
          email: "organization-approve-manager@example.com",
        }),
    );
    const asManager = t.withIdentity({ subject: "organization_approve_manager" });
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId });
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "承認対象スタッフ",
      email: "Org-Approved@Example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, shopId, "org-approved@example.com");

    const { staffId } = await asManager.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId,
      shopId,
    });
    await expect(
      asManager.mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
        shopId,
      }),
    ).rejects.toThrow("Not found");

    const state = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      const person = staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null;
      const staffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", shopId))
        .collect();
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", organizationId))
        .collect();
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      const audits = await ctx.db.query("organizationAuditEvents").collect();
      return { staff, person, staffs, people, scheduled, audits };
    });
    expect(state.staff).toMatchObject({
      shopId,
      organizationId,
      email: "org-approved@example.com",
      emailNormalized: "org-approved@example.com",
    });
    expect(state.staff?.organizationPersonId).toBe(state.person?._id);
    expect(state.person).toMatchObject({
      organizationId,
      emailNormalized: "org-approved@example.com",
      status: "active",
    });
    expect(state.staffs).toHaveLength(1);
    expect(state.people).toHaveLength(2);
    expect(state.scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(1);
    expect(
      state.scheduled.filter(
        (job) => job.name === "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff",
      ),
    ).toHaveLength(1);
    expect(state.audits).toEqual([
      expect.objectContaining({
        organizationId,
        actorUserId: expect.any(String),
        action: "organization.staff_added",
        targetKind: "staff",
        targetId: staffId,
        fromState: "new",
        toState: `active:${shopId}:batch:1`,
      }),
    ]);
  });

  it("同じメールのpending管理者招待が予約した利用枠を承認スタッフへ原子的に付け替える", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_reserved_invitation_manager",
        email: "registration-reserved-owner@example.com",
        plan: "pro",
      });
      const now = Date.now();
      for (let index = 0; index < 13; index += 1) {
        const email = `registration-reserved-filler-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: `既存スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: personId,
          name: `既存スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: organization.organizationId,
        email: "Reserved-Registration@Example.com",
        emailNormalized: "reserved-registration@example.com",
        tokenDigest: "registration-reserved-invitation-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: organization.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...organization, invitationId };
    });
    const asManager = t.withIdentity({ subject: "registration_reserved_invitation_manager" });
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.shopId,
    });
    const submitted = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "予約枠の申請スタッフ",
      email: "Reserved-Registration@Example.com",
      acceptedLegal: true,
    });
    expect(submitted).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, seeded.shopId, "reserved-registration@example.com");

    const { staffId } = await asManager.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId,
      shopId: seeded.shopId,
    });

    const state = await t.run(async (ctx) => {
      const staff = await ctx.db.get(staffId);
      const person = staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null;
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
        .collect();
      const invitations = await ctx.db
        .query("organizationInvitations")
        .withIndex("by_organizationId_and_emailNormalized_and_status", (q) =>
          q
            .eq("organizationId", seeded.organizationId)
            .eq("emailNormalized", "reserved-registration@example.com")
            .eq("status", "pending"),
        )
        .collect();
      const audits = await ctx.db.query("organizationAuditEvents").collect();
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      return { staff, person, people, invitations, audits, scheduled };
    });
    expect(state.people).toHaveLength(15);
    expect(state.staff).toMatchObject({
      organizationId: seeded.organizationId,
      organizationPersonId: state.person?._id,
      name: "予約枠の申請スタッフ",
      email: "reserved-registration@example.com",
      isDeleted: false,
    });
    expect(state.invitations).toEqual([
      expect.objectContaining({
        _id: seeded.invitationId,
        status: "pending",
        reservedSeat: false,
        version: 1,
      }),
    ]);
    expect(state.audits).toEqual([
      expect.objectContaining({
        organizationId: seeded.organizationId,
        action: "organization.staff_added",
        targetKind: "staff",
        targetId: staffId,
        fromState: "new",
      }),
    ]);
    expect(state.scheduled.map((job) => job.name).sort()).toEqual(
      ["line/actions:sendInviteEmail", "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff"].sort(),
    );
  });

  it("予約枠を付け替えても人数上限を超える場合は、招待予約を含む全変更をrollbackする", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_reservation_rollback_manager",
        plan: "pro",
      });
      const now = Date.now();
      for (let index = 0; index < 19; index += 1) {
        const email = `registration-rollback-filler-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: `上限スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: personId,
          name: `上限スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      const invitationId = await ctx.db.insert("organizationInvitations", {
        organizationId: organization.organizationId,
        email: "registration-rollback@example.com",
        emailNormalized: "registration-rollback@example.com",
        tokenDigest: "registration-reservation-rollback-digest",
        status: "pending",
        purpose: "managerAddition",
        inviterMemberId: organization.memberId,
        reservedSeat: true,
        version: 1,
        expiresAt: now + 7 * 24 * 60 * 60 * 1000,
        createdAt: now,
        updatedAt: now,
      });
      return { ...organization, invitationId };
    });
    const asManager = t.withIdentity({ subject: "registration_reservation_rollback_manager" });
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.shopId,
    });
    const submitted = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "上限超過の申請者",
      email: "registration-rollback@example.com",
      acceptedLegal: true,
    });
    expect(submitted).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, seeded.shopId, "registration-rollback@example.com");

    await expect(
      asManager.mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
        shopId: seeded.shopId,
      }),
    ).rejects.toThrow("利用人数が現在のプラン上限を超えます。\n現在20名、上限20名です。");

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      invitation: await ctx.db.get(seeded.invitationId),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
        .collect(),
      staffs: await ctx.db.query("staffs").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.request?.status).toBe("pending");
    expect(state.invitation).toMatchObject({ status: "pending", reservedSeat: true, version: 1 });
    expect(state.people).toHaveLength(20);
    expect(state.staffs).toHaveLength(19);
    expect(state.audits).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("同じ事業者の既存人物を別店舗の承認で再利用し、新しい人物を作らない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_reuse_manager",
        email: "registration-reuse-manager@example.com",
        plan: "pro",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: organization.organizationId,
        operatingStatus: "active",
        name: "承認先店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const now = Date.now();
      const existingPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: organization.organizationId,
        name: "既存人物",
        email: "registration-shared@example.com",
        emailNormalized: "registration-shared@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: existingPersonId,
        name: "既存店舗スタッフ",
        email: "registration-shared@example.com",
        emailNormalized: "registration-shared@example.com",
        isDeleted: false,
      });
      return { ...organization, secondShopId, existingPersonId };
    });
    const asManager = t.withIdentity({ subject: "registration_reuse_manager" });
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.secondShopId,
    });
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "別店舗の表示名",
      email: "Registration-Shared@Example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, seeded.secondShopId, "registration-shared@example.com");

    const { staffId } = await asManager.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId,
      shopId: seeded.secondShopId,
    });

    const state = await t.run(async (ctx) => {
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
        .collect();
      return { people, staff: await ctx.db.get(staffId) };
    });
    expect(state.people).toHaveLength(2);
    expect(state.staff).toMatchObject({
      shopId: seeded.secondShopId,
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.existingPersonId,
      name: "既存人物",
    });
  });

  it("アカウント削除受付済みuserを持つ削除済み人物の参加申請は承認せず、副作用を残さない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_removed_manager",
        email: "registration-removed-manager@example.com",
      });
      const now = Date.now();
      const removedUserId = await seedUser(ctx, "registration_removed_requested", "registration-removed@example.com");
      await ctx.db.patch(removedUserId, { accountDeletionRequestedAt: now });
      const removedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: organization.organizationId,
        userId: removedUserId,
        name: "削除済み人物",
        email: "registration-removed@example.com",
        emailNormalized: "registration-removed@example.com",
        status: "removed",
        createdAt: now,
        updatedAt: now,
      });
      return { ...organization, removedPersonId, removedUserId };
    });
    const asManager = t.withIdentity({ subject: "registration_removed_manager" });
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.shopId,
    });
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "再登録申請",
      email: "Registration-Removed@Example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, seeded.shopId, "registration-removed@example.com");

    await expect(
      asManager.mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
        shopId: seeded.shopId,
      }),
    ).rejects.toThrow("削除済みのユーザーです。\nユーザー画面で再追加したうえで、店舗に追加してください。");

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      person: await ctx.db.get(seeded.removedPersonId),
      user: await ctx.db.get(seeded.removedUserId),
      staffs: await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
        .collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.request?.status).toBe("pending");
    expect(state.person?.status).toBe("removed");
    expect(state.user).toMatchObject({
      isDeleted: false,
      accountDeletionRequestedAt: expect.any(Number),
      email: "registration-removed@example.com",
    });
    expect(state.staffs).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("参加申請の承認前に利用人数上限を検証し、申請だけをpendingのまま残す", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_capacity_manager",
        email: "registration-capacity-manager@example.com",
        plan: "free",
      });
      const now = Date.now();
      for (let index = 0; index < 4; index += 1) {
        const email = `registration-filler-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: `既存スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: personId,
          name: `既存スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      return organization;
    });
    const asManager = t.withIdentity({ subject: "registration_capacity_manager" });
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.shopId,
    });
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "上限超過スタッフ",
      email: "registration-over-limit@example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, seeded.shopId, "registration-over-limit@example.com");

    await expect(
      asManager.mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
        shopId: seeded.shopId,
      }),
    ).rejects.toThrow("利用人数が現在のプラン上限を超えます。\n現在5名、上限5名です。");

    const state = await t.run(async (ctx) => {
      const people = await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
        .collect();
      const staffs = await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
        .collect();
      const consents = await ctx.db.query("legalConsentStates").collect();
      const scheduled = await ctx.db.system.query("_scheduled_functions").collect();
      return { request: await ctx.db.get(requestId), people, staffs, consents, scheduled };
    });
    expect(state.request?.status).toBe("pending");
    expect(state.people).toHaveLength(5);
    expect(state.staffs).toHaveLength(4);
    expect(state.consents).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("BusinessからProへの変更予約中も適用日まではBusiness上限で参加申請を承認する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "scheduled_pro_registration_manager",
        plan: "business",
      });
      const now = Date.now();
      for (let index = 0; index < 29; index += 1) {
        const email = `scheduled-pro-registration-${index}@example.com`;
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          name: `既存スタッフ${index}`,
          email,
          emailNormalized: email,
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("staffs", {
          shopId: organization.shopId,
          organizationId: organization.organizationId,
          organizationPersonId: personId,
          name: `既存スタッフ${index}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
      const billingState = await ctx.db
        .query("organizationBillingStates")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization.organizationId))
        .unique();
      if (!billingState) throw new Error("billing state not found");
      await ctx.db.patch(billingState._id, {
        state: {
          kind: "scheduledChange",
          currentPlan: "business",
          targetPlan: "pro",
          effectiveAt: now + 30 * 24 * 60 * 60 * 1000,
        },
      });
      return organization;
    });
    const asManager = t.withIdentity({ subject: "scheduled_pro_registration_manager" });
    const link = await asManager.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.shopId,
    });
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "31人目",
      email: "scheduled-pro-registration-over-limit@example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, seeded.shopId, "scheduled-pro-registration-over-limit@example.com");

    await expect(
      asManager.mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
        shopId: seeded.shopId,
      }),
    ).resolves.toMatchObject({ staffId: expect.any(String) });

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) => q.eq("organizationId", seeded.organizationId))
        .collect(),
      staffs: await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", seeded.shopId))
        .collect(),
    }));
    expect(state.request?.status).toBe("approved");
    expect(state.people).toHaveLength(31);
    expect(state.staffs).toHaveLength(30);
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
    const submitResult = await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "却下スタッフ",
      email: "rejected@example.com",
      acceptedLegal: true,
    });
    expect(submitResult).toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, shopId, "rejected@example.com");

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
