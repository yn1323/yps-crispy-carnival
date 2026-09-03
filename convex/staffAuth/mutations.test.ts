import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";

/** テスト用データセットアップ */
async function setupTestData(
  t: TestConvex<typeof schema>,
  options: {
    accessKind?: "submit" | "view";
    expiresAt?: number;
    usedAt?: number;
  } = {},
) {
  const magicLinkToken = "test-token-valid";
  const accessKind = options.accessKind ?? "view";
  const status = accessKind === "submit" ? "open" : "confirmed";

  const result = await t.run(async (ctx) => {
    const shopId = await seedShop(ctx, "テスト店舗");
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId,
      periodStart: "2026-01-20",
      periodEnd: "2026-01-26",
      deadline: accessKind === "submit" ? "2026-12-31" : "2026-01-17",
      shopClosedDates: [],
      status,
      ...(status === "confirmed" ? { confirmedAt: Date.now() } : {}),
      isDeleted: false,
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    });
    const staffId = await seedStaff(ctx, {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
    });
    await ctx.db.insert("magicLinks", {
      token: magicLinkToken,
      staffId,
      shopId,
      recruitmentId,
      accessKind,
      expiresAt: options.expiresAt ?? Date.now() + 24 * 60 * 60 * 1000,
      ...(options.usedAt === undefined ? {} : { usedAt: options.usedAt }),
    });
    return { shopId, recruitmentId, staffId };
  });

  return { ...result, magicLinkToken };
}

async function invalidateCanonicalStaffLinkedUser(
  t: TestConvex<typeof schema>,
  staffId: Id<"staffs">,
  state: "dangling" | "deleted" | "requested",
) {
  await t.run(async (ctx) => {
    const staff = await ctx.db.get(staffId);
    if (!staff?.organizationPersonId) throw new Error("canonical staff person not found");
    const now = Date.now();
    const linkedUserId = await ctx.db.insert("users", {
      authTokenIdentifier: `https://convex.test|staff_auth_linked_user_${state}`,
      name: "スタッフ認証対象",
      email: `staff-auth-linked-user-${state}@example.com`,
      emailNormalized: `staff-auth-linked-user-${state}@example.com`,
      role: "manager",
      isDeleted: false,
    });
    await Promise.all([
      ctx.db.patch(staff.organizationPersonId, { userId: linkedUserId, updatedAt: now }),
      ctx.db.patch(staffId, { userId: linkedUserId }),
    ]);
    if (state === "dangling") await ctx.db.delete(linkedUserId);
    else if (state === "deleted") await ctx.db.patch(linkedUserId, { isDeleted: true });
    else await ctx.db.patch(linkedUserId, { accountDeletionRequestedAt: now });
  });
}

describe("staffAuth/mutations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T00:00:00+09:00"));
  });
  afterEach(() => vi.useRealTimers());

  describe("verifyToken", () => {
    it("有効なトークンでセッションが作成される", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t);

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "view",
      });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.sessionToken).toBeDefined();
        expect(result.recruitmentId).toBe(recruitmentId);
      }
    });

    it("シフト対象外スタッフのトークンはexpired(invalid_link)になる", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, staffId } = await setupTestData(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { excludedFromShift: true });
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "view",
      });

      expect(result.status).toBe("expired");
      if (result.status === "expired") {
        expect(result.reason).toBe("invalid_link");
      }
    });

    it("canonical IDが揃っていても人物がremovedなら新規sessionを発行しない", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, staffId, recruitmentId } = await setupTestData(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff person not found");
        await ctx.db.patch(staff.organizationPersonId, { status: "removed", updatedAt: Date.now() });
      });

      await expect(
        t.mutation(api.staffAuth.mutations.verifyToken, { token: magicLinkToken, accessKind: "view" }),
      ).resolves.toEqual({ status: "expired", reason: "invalid_link", recruitmentId });

      const state = await t.run(async (ctx) => ({
        sessions: await ctx.db.query("sessions").collect(),
        magicLink: await ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", magicLinkToken))
          .unique(),
      }));
      expect(state.sessions).toEqual([]);
      expect(state.magicLink?.usedAt).toBeUndefined();
    });

    it.each([
      ["参照切れ", "dangling"],
      ["削除済み", "deleted"],
      ["削除受付済み", "requested"],
    ] as const)("linked userが%sなら既存magic linkから新規sessionを発行しない", async (_label, state) => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, staffId, recruitmentId } = await setupTestData(t);
      await invalidateCanonicalStaffLinkedUser(t, staffId, state);

      await expect(
        t.mutation(api.staffAuth.mutations.verifyToken, { token: magicLinkToken, accessKind: "view" }),
      ).resolves.toEqual({ status: "expired", reason: "invalid_link", recruitmentId });

      const stateAfter = await t.run(async (ctx) => ({
        sessions: await ctx.db.query("sessions").collect(),
        magicLink: await ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", magicLinkToken))
          .unique(),
      }));
      expect(stateAfter.sessions).toEqual([]);
      expect(stateAfter.magicLink?.usedAt).toBeUndefined();
    });

    it("有効なトークンでセッションが14日後に期限切れになる", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken } = await setupTestData(t);

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "view",
      });

      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        // セッションのexpiresAtを検証
        await t.run(async (ctx) => {
          const session = await ctx.db
            .query("sessions")
            .withIndex("by_sessionToken", (q) => q.eq("sessionToken", result.sessionToken))
            .first();
          if (!session) throw new Error("session not found");
          const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
          const diff = session.expiresAt - Date.now();
          // 14日±1分の範囲
          expect(diff).toBeGreaterThan(fourteenDaysMs - 60000);
          expect(diff).toBeLessThanOrEqual(fourteenDaysMs);
        });
      }
    });

    it("viewトークンは使用済みになるとexpiredが返る（ワンタイム）", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken } = await setupTestData(t);

      const result1 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "view",
      });
      const result2 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "view",
      });

      expect(result1.status).toBe("ok");
      expect(result2.status).toBe("expired");
    });

    it("submitトークンは期限内なら複数回検証でき、usedAtを付けない", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, { accessKind: "submit" });

      const result1 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });
      const result2 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result1.status).toBe("ok");
      expect(result2.status).toBe("ok");
      if (result1.status === "ok") expect(result1.recruitmentId).toBe(recruitmentId);
      if (result2.status === "ok") expect(result2.recruitmentId).toBe(recruitmentId);

      const link = await t.run(async (ctx) =>
        ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", magicLinkToken))
          .first(),
      );
      expect(link?.usedAt).toBeUndefined();
    });

    it("submitトークンをview用途で検証するとexpiredが返る", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, { accessKind: "submit" });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "view",
      });

      expect(result).toEqual({ status: "expired", reason: "invalid_link", recruitmentId });
    });

    it("viewトークンをsubmit用途で検証するとexpiredが返る", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, { accessKind: "view" });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result).toEqual({ status: "expired", reason: "invalid_link", recruitmentId });
    });

    it("削除済み募集のsubmitトークンはrecruitment_deleted reasonでexpiredが返る", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, {
        accessKind: "submit",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { isDeleted: true });
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result).toEqual({ status: "expired", reason: "recruitment_deleted", recruitmentId });
    });

    it("submitトークンは募集の提出期限後でもopenならセッションを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, {
        accessKind: "submit",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { deadline: "2026-01-01" });
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result.status).toBe("ok");
      if (result.status === "ok") expect(result.recruitmentId).toBe(recruitmentId);
    });

    it("submitトークンはmagicLinkのexpiresAtを過ぎてもopenならセッションを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, {
        accessKind: "submit",
        expiresAt: Date.now() - 1000,
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result.status).toBe("ok");
      if (result.status === "ok") expect(result.recruitmentId).toBe(recruitmentId);
    });

    it("submitトークンはシフト開始日以降ならsubmission_closedでexpiredが返る", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, {
        accessKind: "submit",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { periodStart: "2026-01-01" });
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result).toEqual({ status: "expired", reason: "submission_closed", recruitmentId });
    });

    it("submitセッションは14日より先にシフト開始日が来る場合、開始日前日までに期限を丸める", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken } = await setupTestData(t, {
        accessKind: "submit",
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result.status).toBe("ok");
      if (result.status !== "ok") throw new Error("expected submit session");
      const session = await t.run(async (ctx) =>
        ctx.db
          .query("sessions")
          .withIndex("by_sessionToken", (q) => q.eq("sessionToken", result.sessionToken))
          .first(),
      );
      expect(session?.expiresAt).toBe(new Date("2026-01-20T00:00:00+09:00").getTime());
    });

    it("submitトークンは募集確定後ならexpiredが返る", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken, recruitmentId } = await setupTestData(t, {
        accessKind: "submit",
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      });
      await t.run(async (ctx) => {
        await ctx.db.patch(recruitmentId, { status: "confirmed", confirmedAt: Date.now() });
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "submit",
      });

      expect(result).toEqual({ status: "expired", reason: "submission_closed", recruitmentId });
    });

    it("期限切れトークンでexpiredが返る", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId } = await setupTestData(t);

      // 期限切れトークンを作成
      // biome-ignore lint/suspicious/noExplicitAny: t.run の ctx 型推論が効かないため
      await t.run(async (ctx: any) => {
        await ctx.db.insert("magicLinks", {
          token: "expired-token",
          staffId,
          shopId,
          recruitmentId,
          accessKind: "view",
          expiresAt: Date.now() - 1000,
        });
      });

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: "expired-token",
        accessKind: "view",
      });

      expect(result.status).toBe("expired");
      expect(result.recruitmentId).toBe(recruitmentId);
      if (result.status === "expired") expect(result.reason).toBe("invalid_link");
    });

    it("存在しないトークンでexpiredが返る", async () => {
      const t = convexTest(schema, modules);

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: "nonexistent-token",
        accessKind: "view",
      });

      expect(result.status).toBe("expired");
      expect(result.recruitmentId).toBeNull();
      if (result.status === "expired") expect(result.reason).toBe("invalid_link");
    });

    it("同一tokenが異なる募集に重複している場合は対象情報を返さずセッションを作らない", async () => {
      const t = convexTest(schema, modules);
      const first = await setupTestData(t);
      const second = await setupTestData(t);

      const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: first.magicLinkToken,
        accessKind: "view",
      });

      expect(result).toEqual({ status: "expired", reason: "invalid_link", recruitmentId: null });
      const state = await t.run(async (ctx) => ({
        sessions: await ctx.db.query("sessions").collect(),
        links: await ctx.db
          .query("magicLinks")
          .withIndex("by_token", (q) => q.eq("token", first.magicLinkToken))
          .collect(),
      }));
      expect(state.sessions).toEqual([]);
      expect(state.links).toHaveLength(2);
      expect(new Set(state.links.map((link) => link.recruitmentId))).toEqual(
        new Set([first.recruitmentId, second.recruitmentId]),
      );
      expect(state.links.every((link) => link.usedAt === undefined)).toBe(true);
    });
  });

  describe("verifyToken レートリミット", () => {
    it("同じキーで6回連続呼び出すと rate_limited が返る", async () => {
      const t = convexTest(schema, modules);
      const { magicLinkToken } = await setupTestData(t);

      // capacity 5 なので5回目までは通る（status は ok or expired）
      for (let i = 0; i < 5; i++) {
        const result = await t.mutation(api.staffAuth.mutations.verifyToken, {
          token: magicLinkToken,
          accessKind: "view",
        });
        expect(result.status).not.toBe("rate_limited");
      }

      // 6回目でレートリミット
      const result6 = await t.mutation(api.staffAuth.mutations.verifyToken, {
        token: magicLinkToken,
        accessKind: "view",
      });
      expect(result6.status).toBe("rate_limited");
      if (result6.status === "rate_limited") {
        expect(result6.retryAfter).toBeGreaterThan(Date.now() - 1000);
        expect(result6.recruitmentId).toBeNull();
      }
    });

    it("異なるトークンプレフィックスは独立してカウントされる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, recruitmentId, staffId } = await setupTestData(t);

      // 先頭8文字が異なるトークンを2つ作成
      await t.run(async (ctx) => {
        await ctx.db.insert("magicLinks", {
          token: "aaaaaaaa-token-1",
          staffId,
          shopId,
          recruitmentId,
          accessKind: "view",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
        await ctx.db.insert("magicLinks", {
          token: "bbbbbbbb-token-2",
          staffId,
          shopId,
          recruitmentId,
          accessKind: "view",
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        });
      });

      // 各トークンで5回ずつ呼んでもレートリミットされない
      for (let i = 0; i < 5; i++) {
        const resultA = await t.mutation(api.staffAuth.mutations.verifyToken, {
          token: "aaaaaaaa-token-1",
          accessKind: "view",
        });
        expect(resultA.status).not.toBe("rate_limited");
      }
      for (let i = 0; i < 5; i++) {
        const resultB = await t.mutation(api.staffAuth.mutations.verifyToken, {
          token: "bbbbbbbb-token-2",
          accessKind: "view",
        });
        expect(resultB.status).not.toBe("rate_limited");
      }
    });
  });

  describe("requestReissue", () => {
    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /**
     * 早期リターンの全分岐で void が返ることを確認するテーブルドリブンテスト。
     * setup フックで DB の状態をいじり、mutation がエラーを投げないことのみを検証する。
     * （個別ログ出力は実装側のレビューで担保し、テストは「void 維持」契約だけを守る）
     */
    type Setup = (t: TestConvex<typeof schema>, ids: Awaited<ReturnType<typeof setupTestData>>) => Promise<void>;

    const noop: Setup = async () => {};

    it.each<{ name: string; email: string; setup: Setup }>([
      { name: "未登録メールでも void", email: "unknown@example.com", setup: noop },
      { name: "正常系（有効なメール+recruitment）", email: "suzuki@example.com", setup: noop },
      { name: "大文字・前後空白つきメールでも void", email: "  SUZUKI@example.com  ", setup: noop },
      {
        name: "recruitment.status が confirmed 以外でも void",
        email: "suzuki@example.com",
        setup: async (t, { recruitmentId }) => {
          await t.run(async (ctx) => ctx.db.patch(recruitmentId, { status: "open" }));
        },
      },
      {
        name: "staff.shopId と recruitment.shopId 不一致でも void",
        email: "suzuki@example.com",
        setup: async (t, { staffId }) => {
          await t.run(async (ctx) => {
            const otherShopId = await seedShop(ctx, "別店舗");
            await ctx.db.patch(staffId, { shopId: otherShopId });
          });
        },
      },
      {
        name: "staff が論理削除済みでも void",
        email: "suzuki@example.com",
        setup: async (t, { staffId }) => {
          await t.run(async (ctx) => ctx.db.patch(staffId, { isDeleted: true }));
        },
      },
      {
        name: "recruitment が論理削除済みでも void",
        email: "suzuki@example.com",
        setup: async (t, { recruitmentId }) => {
          await t.run(async (ctx) => ctx.db.patch(recruitmentId, { isDeleted: true }));
        },
      },
    ])("$name", async ({ email, setup }) => {
      const t = convexTest(schema, modules);
      const ids = await setupTestData(t);
      await setup(t, ids);

      await expect(
        t.mutation(api.staffAuth.mutations.requestReissue, { email, recruitmentId: ids.recruitmentId }),
      ).resolves.not.toThrow();
    });

    it("不正メールはthrowせずinvalid_emailだけをログに残す", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupTestData(t);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      await expect(
        t.mutation(api.staffAuth.mutations.requestReissue, {
          email: "bad\naddress@example.com",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.not.toThrow();

      expect(warnSpy).toHaveBeenCalledWith("[requestReissue] skip", {
        reason: "invalid_email",
        recruitmentId: ids.recruitmentId,
      });
      const logged = JSON.stringify(warnSpy.mock.calls);
      expect(logged).not.toContain("bad");
      warnSpy.mockRestore();
    });

    it("same email in another shop does not block reissue for the recruitment shop", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "Other shop");
        await seedStaff(ctx, {
          shopId: otherShopId,
          name: "Other staff",
          email: "shared@example.com",
        });

        const shopId = await seedShop(ctx, "Target shop");
        const recruitmentId = await ctx.db.insert("recruitments", {
          shopId,
          periodStart: "2026-01-20",
          periodEnd: "2026-01-26",
          deadline: "2026-01-17",
          shopClosedDates: [],
          status: "confirmed",
          confirmedAt: Date.now(),
          isDeleted: false,
          submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
        });
        await seedStaff(ctx, {
          shopId,
          name: "Deleted target staff",
          email: "shared@example.com",
          isDeleted: true,
        });
        const staffId = await seedStaff(ctx, {
          shopId,
          name: "Target staff",
          email: "shared@example.com",
        });

        return { staffId, recruitmentId };
      });
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

      await t.mutation(api.staffAuth.mutations.requestReissue, {
        email: "shared@example.com",
        recruitmentId: ids.recruitmentId,
      });

      expect(logSpy).toHaveBeenCalledWith("[requestReissue] scheduled", {
        staffId: ids.staffId,
        recruitmentId: ids.recruitmentId,
      });
      logSpy.mockRestore();
    });

    it("同一店舗に同じメールの有効staffが複数ある場合は一般化した応答のまま通知を予約しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupTestData(t);
      await t.run(async (ctx) => {
        await seedStaff(ctx, {
          shopId: ids.shopId,
          name: "重複スタッフ",
          email: "suzuki@example.com",
        });
      });

      await expect(
        t.mutation(api.staffAuth.mutations.requestReissue, {
          email: "suzuki@example.com",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled).toEqual([]);
    });

    it("canonical IDが揃っていても人物がremovedなら再発行通知を予約しない", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupTestData(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(ids.staffId);
        if (!staff?.organizationPersonId) throw new Error("canonical staff person not found");
        await ctx.db.patch(staff.organizationPersonId, { status: "removed", updatedAt: Date.now() });
      });

      await expect(
        t.mutation(api.staffAuth.mutations.requestReissue, {
          email: "suzuki@example.com",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "notification/actions:sendReissueEmail")).toEqual([]);
    });

    it.each([
      ["参照切れ", "dangling"],
      ["削除済み", "deleted"],
      ["削除受付済み", "requested"],
    ] as const)("linked userが%sなら再発行通知を予約しない", async (_label, state) => {
      const t = convexTest(schema, modules);
      const ids = await setupTestData(t);
      await invalidateCanonicalStaffLinkedUser(t, ids.staffId, state);

      await expect(
        t.mutation(api.staffAuth.mutations.requestReissue, {
          email: "suzuki@example.com",
          recruitmentId: ids.recruitmentId,
        }),
      ).resolves.toBeNull();

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "notification/actions:sendReissueEmail")).toEqual([]);
    });

    it("同じメールと募集の短時間連打では再発行通知予約を増やさない", async () => {
      const t = convexTest(schema, modules);
      const ids = await setupTestData(t);

      await t.mutation(api.staffAuth.mutations.requestReissue, {
        email: "suzuki@example.com",
        recruitmentId: ids.recruitmentId,
      });
      await t.mutation(api.staffAuth.mutations.requestReissue, {
        email: " SUZUKI@example.com ",
        recruitmentId: ids.recruitmentId,
      });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "notification/actions:sendReissueEmail")).toHaveLength(1);
    });
  });

  describe("requestReissue レートリミット", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("4回連続呼び出しでもエラーにならない（レートリミット時もvoid）", async () => {
      const t = convexTest(schema, modules);
      const { recruitmentId } = await setupTestData(t);

      for (let i = 0; i < 4; i++) {
        await expect(
          t.mutation(api.staffAuth.mutations.requestReissue, {
            email: " SUZUKI@example.com ",
            recruitmentId,
          }),
        ).resolves.not.toThrow();
      }
    });
  });
});
