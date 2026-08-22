import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  seedLegacyShopMembership,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedOrganizationPersonLineLink,
  seedShop,
  seedStaffLineAccount,
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

async function seedBlockedAnonymousRegistrationUsage(
  ctx: MutationCtx,
  args: {
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    usageState: "overLimit" | "unknown";
  },
) {
  const now = Date.now();
  const count = args.usageState === "overLimit" ? 5 : 100;
  for (let index = 0; index < count; index += 1) {
    const email = `${args.usageState}-anonymous-registration-${index}@example.com`;
    const personId = await ctx.db.insert("organizationPeople", {
      organizationId: args.organizationId,
      name: `${args.usageState}登録対象外${index}`,
      email,
      emailNormalized: email,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    if (args.usageState === "overLimit") {
      await ctx.db.insert("staffs", {
        shopId: args.shopId,
        organizationId: args.organizationId,
        organizationPersonId: personId,
        name: `上限超過スタッフ${index}`,
        email,
        emailNormalized: email,
        isDeleted: false,
      });
    }
  }
}

describe("staffRegistration/mutations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
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

  it("存在しない・失効済みtokenと削除済み店舗は同じエラーで申請を作成しない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const activeShopId = await seedShop(ctx, "有効店舗");
      const deletedShopId = await seedShop(ctx, "削除済み店舗");
      await ctx.db.patch(deletedShopId, { isDeleted: true });
      await ctx.db.insert("shopRegistrationLinks", {
        shopId: activeShopId,
        token: "revoked-submit-registration-token",
        createdAt: Date.now(),
        revokedAt: Date.now(),
      });
      await ctx.db.insert("shopRegistrationLinks", {
        shopId: deletedShopId,
        token: "deleted-shop-submit-registration-token",
        createdAt: Date.now(),
      });
    });

    for (const token of [
      "missing-submit-registration-token",
      "revoked-submit-registration-token",
      "deleted-shop-submit-registration-token",
    ]) {
      await expect(
        t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
          token,
          name: "申請スタッフ",
          email: `${token}@example.com`,
          acceptedLegal: true,
        }),
      ).rejects.toThrow("登録リンクの有効期限が切れています");
    }

    await expect(t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect())).resolves.toEqual([]);
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

  it.each(["overLimit", "unknown"] as const)(
    "active.freeの利用数が%sになった場合、発行済みlinkの事前確認と最終writeを拒否する",
    async (usageState) => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(
        async (ctx) =>
          await seedOrganizationManagerShop(ctx, {
            subject: `registration_${usageState}_submit_manager`,
            plan: "free",
          }),
      );
      const link = await t
        .withIdentity({ subject: `registration_${usageState}_submit_manager` })
        .mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, { shopId: seeded.shopId });

      await expect(
        t.mutation(internal.staffRegistration.mutations.checkSubmissionRateLimit, {
          token: link.token,
          emailKey: `${usageState}-before-email`,
          linkKey: `${usageState}-before-link`,
        }),
      ).resolves.toEqual({ status: "allowed" });

      await t.run(async (ctx) => {
        await seedBlockedAnonymousRegistrationUsage(ctx, {
          organizationId: seeded.organizationId,
          shopId: seeded.shopId,
          usageState,
        });
      });

      await expect(
        t.mutation(internal.staffRegistration.mutations.checkSubmissionRateLimit, {
          token: link.token,
          emailKey: `${usageState}-after-email`,
          linkKey: `${usageState}-after-link`,
        }),
      ).resolves.toEqual({ status: "unavailable" });
      await expect(
        t.mutation(internal.staffRegistration.mutations.submitRegistrationRequestFromHttp, {
          token: link.token,
          name: "上限超過後の申請者",
          email: `${usageState}-blocked-request@example.com`,
          acceptedLegal: true,
        }),
      ).resolves.toEqual({ status: "unavailable" });

      const state = await t.run(async (ctx) => ({
        requests: await ctx.db.query("staffRegistrationRequests").collect(),
        audits: await ctx.db.query("organizationAuditEvents").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        rateLimitRows: await ctx.db.query("rateLimits").collect(),
        billingState: await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .unique(),
      }));
      expect(state.requests).toEqual([]);
      expect(state.audits).toEqual([]);
      expect(state.outbox).toEqual([]);
      expect(state.scheduled).toEqual([]);
      expect(state.rateLimitRows).toMatchObject([
        { name: "staffRegistrationEmailShort", key: `${usageState}-before-email` },
        { name: "staffRegistrationEmailDaily", key: `${usageState}-before-email` },
        { name: "staffRegistrationLinkShort", key: `${usageState}-before-link` },
        { name: "staffRegistrationLinkDaily", key: `${usageState}-before-link` },
      ]);
      expect(state.rateLimitRows).toHaveLength(4);
      expect(state.billingState?.state).toEqual({ kind: "active", plan: "free" });
    },
  );

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
    if (!state.staff?.organizationId || !state.staff.organizationPersonId) {
      throw new Error("承認スタッフのcanonical scopeがありません");
    }
    const { organizationId, organizationPersonId } = state.staff;
    const inviteJob = state.scheduled.find(
      (job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffId,
    );
    expect(inviteJob?.args[0]).toMatchObject({
      staffId,
      organizationPersonId,
      lineLinkGenerationAtSchedule: 0,
      context: "registration_approved",
    });
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

    await t.run(async (ctx) => {
      await seedOrganizationPersonLineLink(ctx, {
        organizationId,
        organizationPersonId,
        lineUserId: "U_linked_after_registration_invite_schedule",
      });
    });
    await t.action(internal.line.actions.sendInviteEmail, {
      staffId,
      organizationPersonId,
      lineLinkGenerationAtSchedule: 0,
      context: "registration_approved",
    });
    const afterAction = await t.run(async (ctx) => ({
      lineLinkTokens: await ctx.db.query("lineLinkTokens").collect(),
      outbox: await ctx.db.query("notificationOutbox").collect(),
    }));
    expect(afterAction).toEqual({ lineLinkTokens: [], outbox: [] });
  });

  it("事業者配下の承認は人物とstaffをdual-writeして組織共通順の末尾へ追加し、再承認で重複保存しない", async () => {
    const t = convexTest(schema, modules);
    const {
      shopId,
      organizationId,
      personId: managerPersonId,
    } = await t.run(
      async (ctx) =>
        await seedOrganizationManagerShop(ctx, {
          subject: "organization_approve_manager",
          email: "organization-approve-manager@example.com",
        }),
    );
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationStaffOrderStates", {
        organizationId,
        revision: 1,
        activatedAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("organizationStaffOrderEntries", {
        organizationId,
        organizationPersonId: managerPersonId,
        displayOrder: 0,
      });
    });
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
      const organizationOrder = await ctx.db
        .query("organizationStaffOrderEntries")
        .withIndex("by_organizationId_and_displayOrder", (q) => q.eq("organizationId", organizationId))
        .collect();
      const shopOrder = await ctx.db
        .query("shopStaffOrderEntries")
        .withIndex("by_shopId_and_displayOrder", (q) => q.eq("shopId", shopId))
        .collect();
      return { staff, person, staffs, people, scheduled, audits, organizationOrder, shopOrder };
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
    expect(state.organizationOrder.map(({ organizationPersonId }) => organizationPersonId)).toEqual([
      managerPersonId,
      state.person?._id,
    ]);
    expect(state.shopOrder).toEqual([
      expect.objectContaining({
        organizationId,
        shopId,
        staffId,
        organizationPersonId: state.person?._id,
        displayOrder: 1,
      }),
    ]);
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

  it("安全な削除済み人物の申請を承認すると同じ人物を申請内容で再有効化し、旧所属・credential・LINEを復元せず新staffを作る", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_safe_reactivation_manager",
        email: "registration-safe-reactivation-manager@example.com",
        plan: "pro",
      });
      const now = Date.now();
      const revokedAt = now - 1_000;
      const removedUserId = await seedUser(
        ctx,
        "registration_safe_reactivation_person",
        "registration-safe-reactivation@example.com",
      );
      const removedPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: organization.organizationId,
        userId: removedUserId,
        name: "削除前の人物名",
        email: "Registration-Safe-Reactivation@Example.com",
        emailNormalized: "registration-safe-reactivation@example.com",
        status: "removed",
        createdAt: now - 20_000,
        updatedAt: revokedAt,
      });
      const removedMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: organization.organizationId,
        personId: removedPersonId,
        userId: removedUserId,
        status: "removed",
        createdAt: now - 20_000,
        updatedAt: revokedAt,
      });
      const oldStaffId = await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: removedPersonId,
        userId: removedUserId,
        name: "削除前の店舗表示名",
        email: "registration-safe-reactivation@example.com",
        emailNormalized: "registration-safe-reactivation@example.com",
        excludedFromShift: true,
        isDeleted: true,
      });
      const removedLegacyMemberId = await seedLegacyShopMembership(ctx, {
        shopId: organization.shopId,
        userId: removedUserId,
        isDeleted: true,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId: organization.shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        deadline: "2026-07-31",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      });
      const sessionId = await ctx.db.insert("sessions", {
        sessionToken: "registration-safe-reactivation-session",
        staffId: oldStaffId,
        shopId: organization.shopId,
        recruitmentId,
        expiresAt: now + 86_400_000,
        revokedAt,
      });
      const magicLinkId = await ctx.db.insert("magicLinks", {
        token: "registration-safe-reactivation-magic",
        staffId: oldStaffId,
        shopId: organization.shopId,
        recruitmentId,
        expiresAt: now + 86_400_000,
        revokedAt,
      });
      const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
        token: "registration-safe-reactivation-line-token",
        staffId: oldStaffId,
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: removedPersonId,
        lineLinkGenerationAtIssue: 1,
        expiresAt: now + 86_400_000,
        revokedAt,
      });
      const oldLineAccountId = await seedStaffLineAccount(ctx, {
        staffId: oldStaffId,
        shopId: organization.shopId,
        lineUserId: "U_registration_safe_reactivation_legacy",
      });
      await ctx.db.patch(oldLineAccountId, { isDeleted: true });
      const canonicalLine = await seedOrganizationPersonLineLink(ctx, {
        organizationId: organization.organizationId,
        organizationPersonId: removedPersonId,
        lineUserId: "U_registration_safe_reactivation_canonical",
      });
      await ctx.db.patch(canonicalLine.organizationPersonLineLinkId, {
        isDeleted: true,
        unlinkedAt: revokedAt,
      });
      const reactivationGeneration = canonicalLine.generation + 1;
      await ctx.db.patch(removedPersonId, { lineLinkGeneration: reactivationGeneration, updatedAt: revokedAt });
      await ctx.db.patch(canonicalLine.lineProviderUserId, { following: false, isDeleted: true });
      return {
        ...organization,
        ...canonicalLine,
        lineLinkTokenId,
        magicLinkId,
        oldLineAccountId,
        oldStaffId,
        removedLegacyMemberId,
        removedMemberId,
        removedPersonId,
        reactivationGeneration,
        revokedAt,
        sessionId,
      };
    });
    const actor = t.withIdentity({ subject: "registration_safe_reactivation_manager" });
    const link = await actor.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.shopId,
    });
    await expect(
      t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
        token: link.token,
        name: "再登録後の申請名",
        email: " Registration-Safe-Reactivation@Example.com ",
        acceptedLegal: true,
      }),
    ).resolves.toEqual({ status: "accepted" });
    const requestId = await getPendingRequestId(t, seeded.shopId, "registration-safe-reactivation@example.com");

    const { staffId } = await actor.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId,
      shopId: seeded.shopId,
    });

    const state = await t.run(async (ctx) => ({
      activeCanonicalLinks: await ctx.db
        .query("organizationPersonLineLinks")
        .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
          q.eq("organizationPersonId", seeded.removedPersonId).eq("isDeleted", false),
        )
        .collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      canonicalLine: await ctx.db.get(seeded.organizationPersonLineLinkId),
      consent: await ctx.db
        .query("legalConsentStates")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .first(),
      lineLinkToken: await ctx.db.get(seeded.lineLinkTokenId),
      magicLink: await ctx.db.get(seeded.magicLinkId),
      member: await ctx.db.get(seeded.removedMemberId),
      newLineAccounts: await ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
        .collect(),
      newStaff: await ctx.db.get(staffId),
      oldLineAccount: await ctx.db.get(seeded.oldLineAccountId),
      oldStaff: await ctx.db.get(seeded.oldStaffId),
      people: await ctx.db
        .query("organizationPeople")
        .withIndex("by_organizationId_and_emailNormalized", (q) =>
          q
            .eq("organizationId", seeded.organizationId)
            .eq("emailNormalized", "registration-safe-reactivation@example.com"),
        )
        .collect(),
      person: await ctx.db.get(seeded.removedPersonId),
      provider: await ctx.db.get(seeded.lineProviderUserId),
      request: await ctx.db.get(requestId),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      session: await ctx.db.get(seeded.sessionId),
      shopMember: await ctx.db.get(seeded.removedLegacyMemberId),
      staffs: await ctx.db
        .query("staffs")
        .withIndex("by_organizationId_and_organizationPersonId", (q) =>
          q.eq("organizationId", seeded.organizationId).eq("organizationPersonId", seeded.removedPersonId),
        )
        .collect(),
    }));
    expect(staffId).not.toBe(seeded.oldStaffId);
    expect(state.people).toHaveLength(1);
    expect(state.person).toMatchObject({
      _id: seeded.removedPersonId,
      status: "active",
      name: "再登録後の申請名",
      email: "registration-safe-reactivation@example.com",
      emailNormalized: "registration-safe-reactivation@example.com",
      lineLinkGeneration: seeded.reactivationGeneration,
    });
    expect(state.newStaff).toMatchObject({
      shopId: seeded.shopId,
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.removedPersonId,
      name: "再登録後の申請名",
      email: "registration-safe-reactivation@example.com",
      emailNormalized: "registration-safe-reactivation@example.com",
      excludedFromShift: false,
      isDeleted: false,
    });
    expect(state.newStaff?.userId).toBeUndefined();
    expect(state.staffs).toHaveLength(2);
    expect(state.oldStaff).toMatchObject({
      _id: seeded.oldStaffId,
      name: "削除前の店舗表示名",
      excludedFromShift: true,
      isDeleted: true,
    });
    expect(state.member?.status).toBe("removed");
    expect(state.shopMember?.isDeleted).toBe(true);
    expect(state.session?.revokedAt).toBe(seeded.revokedAt);
    expect(state.magicLink?.revokedAt).toBe(seeded.revokedAt);
    expect(state.lineLinkToken?.revokedAt).toBe(seeded.revokedAt);
    expect(state.oldLineAccount?.isDeleted).toBe(true);
    expect(state.newLineAccounts).toEqual([]);
    expect(state.canonicalLine).toMatchObject({
      organizationPersonId: seeded.removedPersonId,
      generation: seeded.generation,
      isDeleted: true,
      unlinkedAt: seeded.revokedAt,
    });
    expect(state.activeCanonicalLinks).toEqual([]);
    expect(state.provider).toMatchObject({ following: false, isDeleted: true });
    expect(state.request).toMatchObject({ status: "approved", approvedStaffId: staffId });
    expect(state.consent).toMatchObject({ method: "staff_registration" });
    expect(state.audits.filter((audit) => audit.action === "organization.staff_added")).toEqual([
      expect.objectContaining({
        targetId: staffId,
        fromState: "removedPerson",
        toState: `active:${seeded.shopId}:batch:1`,
      }),
    ]);
    expect(state.audits.filter((audit) => audit.action === "organization.person_reactivated")).toEqual([
      expect.objectContaining({
        targetId: seeded.removedPersonId,
        fromState: "removed",
        toState: "active",
      }),
    ]);
    expect(state.scheduled.map((job) => job.name).sort()).toEqual(
      ["line/actions:sendInviteEmail", "notification/actions:sendOpenRecruitmentNotificationEmailsForStaff"].sort(),
    );
    expect(
      state.scheduled.find((job) => job.name === "line/actions:sendInviteEmail" && job.args[0]?.staffId === staffId)
        ?.args[0],
    ).toMatchObject({
      organizationPersonId: seeded.removedPersonId,
      lineLinkGenerationAtSchedule: seeded.reactivationGeneration,
      context: "registration_approved",
    });
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
      await seedOrganizationPersonLineLink(ctx, {
        organizationId: organization.organizationId,
        organizationPersonId: existingPersonId,
        lineUserId: "U_registration_shared",
        following: true,
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
      return {
        people,
        staff: await ctx.db.get(staffId),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
      };
    });
    expect(state.people).toHaveLength(2);
    expect(state.staff).toMatchObject({
      shopId: seeded.secondShopId,
      organizationId: seeded.organizationId,
      organizationPersonId: seeded.existingPersonId,
      name: "既存人物",
    });
    expect(state.scheduled.some((job) => job.name === "line/actions:sendInviteEmail")).toBe(false);
    expect(state.analytics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            kind: "staffMembership",
            staffId,
            lineLinked: true,
            lineFollowing: true,
          }),
        }),
      ]),
    );
  });

  it("最後の所属を外してもretained canonical LINEを承認先で利用する", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_retained_readd_manager",
        plan: "pro",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: organization.organizationId,
        operatingStatus: "active",
        name: "retained承認先店舗",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: organization.organizationId,
        name: "retained承認対象",
        email: "registration-retained-readd@example.com",
        emailNormalized: "registration-retained-readd@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const sourceStaffId = await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: personId,
        name: "retained承認対象",
        email: "registration-retained-readd@example.com",
        emailNormalized: "registration-retained-readd@example.com",
        isDeleted: false,
      });
      const canonical = await seedOrganizationPersonLineLink(ctx, {
        organizationId: organization.organizationId,
        organizationPersonId: personId,
        lineUserId: "U_registration_retained_readd",
        following: true,
      });
      return { ...organization, ...canonical, personId, secondShopId, sourceStaffId };
    });
    const actor = t.withIdentity({ subject: "registration_retained_readd_manager" });

    await actor.mutation(api.organization.mutations.removePersonFromShop, {
      shopId: seeded.shopId,
      staffId: seeded.sourceStaffId,
      requestId: "registration-retained-remove-last",
    });
    const link = await actor.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.secondShopId,
    });
    await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "申請側の表示名",
      email: "Registration-Retained-Readd@Example.com",
      acceptedLegal: true,
    });
    const requestId = await getPendingRequestId(t, seeded.secondShopId, "registration-retained-readd@example.com");
    const { staffId } = await actor.mutation(api.staffRegistration.mutations.approveRequest, {
      requestId,
      shopId: seeded.secondShopId,
    });

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      link: await ctx.db.get(seeded.organizationPersonLineLinkId),
      provider: await ctx.db.get(seeded.lineProviderUserId),
      sourceStaff: await ctx.db.get(seeded.sourceStaffId),
      staff: await ctx.db.get(staffId),
      targetAccounts: await ctx.db
        .query("staffLineAccounts")
        .withIndex("by_staffId_and_isDeleted", (q) => q.eq("staffId", staffId).eq("isDeleted", false))
        .collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      analytics: await ctx.db.query("analyticsSourceEvents").collect(),
    }));
    expect(state.request).toMatchObject({ status: "approved", approvedStaffId: staffId });
    expect(state.sourceStaff?.isDeleted).toBe(true);
    expect(state.staff).toMatchObject({
      _id: staffId,
      organizationPersonId: seeded.personId,
      shopId: seeded.secondShopId,
      isDeleted: false,
    });
    expect(state.link).toMatchObject({
      organizationPersonId: seeded.personId,
      lineProviderUserId: seeded.lineProviderUserId,
      generation: seeded.generation,
      isDeleted: false,
    });
    expect(state.provider).toMatchObject({
      lineUserId: "U_registration_retained_readd",
      following: true,
      isDeleted: false,
    });
    expect(state.targetAccounts).toEqual([]);
    expect(state.scheduled.some((job) => job.name === "line/actions:sendInviteEmail")).toBe(false);
    expect(state.analytics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payload: expect.objectContaining({
            kind: "staffMembership",
            staffId,
            lineLinked: true,
            lineFollowing: true,
          }),
        }),
      ]),
    );
  });

  it("canonical LINEのgeneration不整合では承認をrollbackし、LINE案内を予約しない", async () => {
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const organization = await seedOrganizationManagerShop(ctx, {
        subject: "registration_generation_mismatch_manager",
        plan: "pro",
      });
      const secondShopId = await ctx.db.insert("shops", {
        organizationId: organization.organizationId,
        operatingStatus: "active",
        name: "generation不整合承認先",
        submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        regularClosedDays: [],
        isDeleted: false,
      });
      const now = Date.now();
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: organization.organizationId,
        name: "generation不整合承認対象",
        email: "registration-generation-mismatch@example.com",
        emailNormalized: "registration-generation-mismatch@example.com",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const sourceStaffId = await ctx.db.insert("staffs", {
        shopId: organization.shopId,
        organizationId: organization.organizationId,
        organizationPersonId: personId,
        name: "generation不整合承認対象",
        email: "registration-generation-mismatch@example.com",
        emailNormalized: "registration-generation-mismatch@example.com",
        isDeleted: false,
      });
      await seedOrganizationPersonLineLink(ctx, {
        organizationId: organization.organizationId,
        organizationPersonId: personId,
        lineUserId: "U_registration_generation_mismatch",
        following: true,
      });
      await ctx.db.patch(personId, { lineLinkGeneration: 2, updatedAt: Date.now() });
      return { ...organization, personId, secondShopId, sourceStaffId };
    });
    const actor = t.withIdentity({ subject: "registration_generation_mismatch_manager" });
    const link = await actor.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
      shopId: seeded.secondShopId,
    });
    await t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
      token: link.token,
      name: "追加されない申請",
      email: "registration-generation-mismatch@example.com",
      acceptedLegal: true,
    });
    const requestId = await getPendingRequestId(t, seeded.secondShopId, "registration-generation-mismatch@example.com");

    await expect(
      actor.mutation(api.staffRegistration.mutations.approveRequest, {
        requestId,
        shopId: seeded.secondShopId,
      }),
    ).rejects.toThrow("スタッフのLINE連携状態を確認できません。");

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(requestId),
      sourceStaff: await ctx.db.get(seeded.sourceStaffId),
      targetStaffs: await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", seeded.secondShopId).eq("isDeleted", false))
        .collect(),
      lineAccounts: await ctx.db.query("staffLineAccounts").collect(),
      consents: await ctx.db.query("legalConsentStates").collect(),
      audits: await ctx.db.query("organizationAuditEvents").collect(),
      analytics: await ctx.db.query("analyticsSourceEvents").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.request?.status).toBe("pending");
    expect(state.sourceStaff).toMatchObject({ _id: seeded.sourceStaffId, isDeleted: false });
    expect(state.targetStaffs).toEqual([]);
    expect(state.lineAccounts).toEqual([]);
    expect(state.consents).toEqual([]);
    expect(state.audits).toEqual([]);
    expect(state.analytics).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it.each([
    ["アカウント削除受付済み", "accountDeletion", "account-deletion"],
    ["activeな旧staffあり", "activeStaff", "active-staff"],
    ["activeな管理者所属あり", "activeManagerMembership", "active-manager-membership"],
    ["activeなcanonical LINE連携あり", "activeCanonicalLine", "active-canonical-line"],
  ] as const)(
    "削除済み人物に%sの不整合がある参加申請は汎用理由で承認せず、副作用を残さない",
    async (_label, state, slug) => {
      const t = convexTest(schema, modules);
      const seeded = await t.run(async (ctx) => {
        const subject = `registration_unsafe_removed_${slug}`;
        const organization = await seedOrganizationManagerShop(ctx, {
          subject,
          email: `${slug}-manager@example.com`,
          plan: "pro",
        });
        const now = Date.now();
        const email = `${slug}@example.com`;
        const needsUser = state === "accountDeletion" || state === "activeManagerMembership";
        const removedUserId = needsUser ? await seedUser(ctx, `${subject}_person`, email) : undefined;
        if (state === "accountDeletion" && removedUserId) {
          await ctx.db.patch(removedUserId, { accountDeletionRequestedAt: now });
        }
        const removedPersonId = await ctx.db.insert("organizationPeople", {
          organizationId: organization.organizationId,
          ...(removedUserId ? { userId: removedUserId } : {}),
          name: "状態不整合の削除済み人物",
          email,
          emailNormalized: email,
          status: "removed",
          createdAt: now,
          updatedAt: now,
        });
        if (state === "activeStaff") {
          await ctx.db.insert("staffs", {
            shopId: organization.shopId,
            organizationId: organization.organizationId,
            organizationPersonId: removedPersonId,
            name: "残存staff",
            email,
            emailNormalized: email,
            isDeleted: false,
          });
        }
        if (state === "activeManagerMembership" && removedUserId) {
          await ctx.db.insert("organizationMembers", {
            organizationId: organization.organizationId,
            personId: removedPersonId,
            userId: removedUserId,
            status: "active",
            createdAt: now,
            updatedAt: now,
          });
        }
        if (state === "activeCanonicalLine") {
          await seedOrganizationPersonLineLink(ctx, {
            organizationId: organization.organizationId,
            organizationPersonId: removedPersonId,
            lineUserId: `U_registration_unsafe_removed_${slug}`,
          });
        }
        return { ...organization, email, removedPersonId, removedUserId, subject };
      });
      const actor = t.withIdentity({ subject: seeded.subject });
      const link = await actor.mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
        shopId: seeded.shopId,
      });
      await expect(
        t.mutation(internal.staffRegistration.mutations.submitRegistrationRequest, {
          token: link.token,
          name: "再登録申請",
          email: seeded.email,
          acceptedLegal: true,
        }),
      ).resolves.toEqual({ status: "accepted" });
      // active staffの公開申請は存在を隠してpendingを作らないため、この不整合だけ承認mutation用に直接作る。
      const requestId =
        state === "activeStaff"
          ? await t.run(async (ctx) => {
              const now = Date.now();
              return await ctx.db.insert("staffRegistrationRequests", {
                shopId: seeded.shopId,
                name: "再登録申請",
                email: seeded.email,
                emailNormalized: seeded.email,
                status: "pending",
                termsConsentVersion: "terms-consent",
                privacyConsentVersion: "privacy-consent",
                termsDocumentVersion: "terms-document",
                privacyDocumentVersion: "privacy-document",
                consentedAt: now,
                createdAt: now,
              });
            })
          : await getPendingRequestId(t, seeded.shopId, seeded.email);
      const readProtectedState = () =>
        t.run(async (ctx) => ({
          analytics: await ctx.db.query("analyticsSourceEvents").collect(),
          audits: await ctx.db.query("organizationAuditEvents").collect(),
          consents: await ctx.db.query("legalConsentStates").collect(),
          lineLinks: await ctx.db
            .query("organizationPersonLineLinks")
            .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
              q.eq("organizationPersonId", seeded.removedPersonId),
            )
            .collect(),
          members: await ctx.db
            .query("organizationMembers")
            .withIndex("by_organizationId_and_personId", (q) =>
              q.eq("organizationId", seeded.organizationId).eq("personId", seeded.removedPersonId),
            )
            .collect(),
          person: await ctx.db.get(seeded.removedPersonId),
          request: await ctx.db.get(requestId),
          scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
          staffs: await ctx.db
            .query("staffs")
            .withIndex("by_organizationId_and_organizationPersonId", (q) =>
              q.eq("organizationId", seeded.organizationId).eq("organizationPersonId", seeded.removedPersonId),
            )
            .collect(),
          user: seeded.removedUserId ? await ctx.db.get(seeded.removedUserId) : null,
        }));
      const before = await readProtectedState();

      await expect(
        actor.mutation(api.staffRegistration.mutations.approveRequest, {
          requestId,
          shopId: seeded.shopId,
        }),
      ).rejects.toThrow("この申請は現在承認できません。不要な申請は却下できます。");

      await expect(readProtectedState()).resolves.toEqual(before);
      expect(before.request?.status).toBe("pending");
      expect(before.person?.status).toBe("removed");
      expect(before.consents).toEqual([]);
      expect(before.audits).toEqual([]);
      expect(before.analytics).toEqual([]);
      expect(before.scheduled).toEqual([]);
    },
  );

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

  it.each(["overLimit", "unknown"] as const)("利用状態が%sでも登録申請の却下だけは実行できる", async (usageState) => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const base = await seedOrganizationManagerShop(ctx, {
        subject: `manager_reject_${usageState}`,
        plan: "free",
      });
      const now = Date.now();
      const requestId = await ctx.db.insert("staffRegistrationRequests", {
        shopId: base.shopId,
        name: "整理対象の登録申請",
        email: `reject-${usageState}@example.com`,
        emailNormalized: `reject-${usageState}@example.com`,
        status: "pending",
        termsConsentVersion: "terms-v1",
        privacyConsentVersion: "privacy-v1",
        termsDocumentVersion: "terms-doc-v1",
        privacyDocumentVersion: "privacy-doc-v1",
        consentedAt: now,
        createdAt: now,
      });
      await seedBlockedAnonymousRegistrationUsage(ctx, {
        organizationId: base.organizationId,
        shopId: base.shopId,
        usageState,
      });
      return { ...base, requestId };
    });
    const asManager = t.withIdentity({ subject: `manager_reject_${usageState}` });

    await expect(
      asManager.mutation(api.staffRegistration.mutations.approveRequest, {
        shopId: ids.shopId,
        requestId: ids.requestId,
      }),
    ).rejects.toMatchObject({
      data: {
        code: usageState === "unknown" ? "USAGE_LIMIT_EVALUATION_UNAVAILABLE" : "USAGE_LIMIT_EXCEEDED",
      },
    });

    await expect(
      asManager.mutation(api.staffRegistration.mutations.rejectRequest, {
        shopId: ids.shopId,
        requestId: ids.requestId,
      }),
    ).resolves.toBeNull();

    const state = await t.run(async (ctx) => ({
      request: await ctx.db.get(ids.requestId),
      applicantStaff: await ctx.db
        .query("staffs")
        .withIndex("by_shopId_emailNormalized_isDeleted", (q) =>
          q.eq("shopId", ids.shopId).eq("emailNormalized", `reject-${usageState}@example.com`).eq("isDeleted", false),
        )
        .first(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.request).toMatchObject({ status: "rejected", reviewedByUserId: ids.userId });
    expect(state.applicantStaff).toBeNull();
    expect(state.scheduled).toEqual([]);
  });
});
