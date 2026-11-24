import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedOrganizationMembership, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { getOrganizationPersonLineState } from "../line/service";
import { buildConfirmationSnapshotSignature } from "../notification/confirmationSnapshots";
import { USER_SEED_PRODUCTION_DEPLOYMENT_NAME } from "./guard";

const RANDOM_SEED = 20261122;
const CLERK_ISSUER = "https://user-seed.clerk.accounts.dev";
const SEED_AUTH_TOKEN_IDENTIFIER = `${CLERK_ISSUER}|user_seedTarget01`;

function enableUserSeed() {
  vi.stubEnv("DEBUG_MODE", "true");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://user-seed-development.convex.cloud");
}

/** 実行先に、確認用データの入れ先にするClerk利用者の識別子を設定する。 */
function configureSeedUser(authTokenIdentifier = SEED_AUTH_TOKEN_IDENTIFIER) {
  enableUserSeed();
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", CLERK_ISSUER);
  vi.stubEnv("DEBUG_SEED_PRIMARY_AUTH_TOKEN_IDENTIFIER", authTokenIdentifier);
}

async function readUsers(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) =>
    (await ctx.db.query("users").collect()).map(
      ({ _id, authTokenIdentifier, name, email, emailNormalized, role, isDeleted }) => ({
        _id,
        authTokenIdentifier,
        name,
        email,
        emailNormalized,
        role,
        isDeleted,
      }),
    ),
  );
}

async function countOrganizations(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => (await ctx.db.query("organizations").collect()).length);
}

async function readScheduledFunctionNames(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect()).map((job) => job.name),
  );
}

describe("userSeed", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-22T10:00:00+09:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("有効にする条件", () => {
    it("DEBUG_MODEがない実行先では、一覧・削除・投入のどれも拒否してDBを変えない", async () => {
      vi.stubEnv("DEBUG_MODE", "");
      vi.stubEnv("CONVEX_CLOUD_URL", "https://user-seed-development.convex.cloud");
      const t = convexTest(schema, modules);
      const { userId } = await t.run(async (ctx) =>
        seedOrganizationManagerShop(ctx, { subject: "seed_disabled", plan: "free" }),
      );

      await expect(t.query(internal.userSeed.queries.listUsers, {})).rejects.toThrowError("DEBUG_MODE");
      await expect(t.mutation(internal.userSeed.mutations.resetUserOrganizations, { userId })).rejects.toThrowError(
        "DEBUG_MODE",
      );
      await expect(t.mutation(internal.userSeed.mutations.seedUserOrganization, { userId })).rejects.toThrowError(
        "DEBUG_MODE",
      );
      expect(await countOrganizations(t)).toBe(1);
      expect(await readScheduledFunctionNames(t)).toEqual([]);
    });

    it("本番のdeploymentでは、DEBUG_MODEがあっても拒否してDBを変えない", async () => {
      vi.stubEnv("DEBUG_MODE", "true");
      vi.stubEnv("CONVEX_CLOUD_URL", `https://${USER_SEED_PRODUCTION_DEPLOYMENT_NAME}.convex.cloud`);
      const t = convexTest(schema, modules);
      const { userId, organizationId } = await t.run(async (ctx) =>
        seedOrganizationManagerShop(ctx, { subject: "seed_production", plan: "free" }),
      );

      await expect(t.query(internal.userSeed.queries.listUsers, {})).rejects.toThrowError("production");
      await expect(t.mutation(internal.userSeed.mutations.resetUserOrganizations, { userId })).rejects.toThrowError(
        "production",
      );
      await expect(t.mutation(internal.userSeed.mutations.seedUserOrganization, { userId })).rejects.toThrowError(
        "production",
      );
      expect(await t.run(async (ctx) => (await ctx.db.get(organizationId))?.isDeleted)).toBe(false);
      expect(await countOrganizations(t)).toBe(1);
    });
  });

  describe("listUsers", () => {
    it("削除済みのユーザーを除き、組織ごとに消せるかと理由を返す", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const fixture = await t.run(async (ctx) => {
        const solo = await seedOrganizationManagerShop(ctx, {
          subject: "seed_solo",
          shopName: "ひとりの店",
          plan: "free",
        });
        const shared = await seedOrganizationManagerShop(ctx, {
          subject: "seed_partner",
          shopName: "共同の店",
          plan: "free",
        });
        await seedOrganizationMembership(ctx, { userId: solo.userId, shopId: shared.shopId });
        const deletedUserId = await seedUser(ctx, "seed_deleted");
        await ctx.db.patch(deletedUserId, { isDeleted: true });
        return { solo, shared };
      });

      const users = await t.query(internal.userSeed.queries.listUsers, {});

      expect(
        users.map((user) => ({
          userId: user.userId,
          email: user.email,
          organizations: user.organizations.map(({ name, canDelete, reason }) => ({ name, canDelete, reason })),
        })),
      ).toEqual([
        {
          userId: fixture.solo.userId,
          email: "seed_solo@example.com",
          organizations: [
            { name: "ひとりの店事業者", canDelete: true, reason: null },
            {
              name: "共同の店事業者",
              canDelete: false,
              reason: "組織を削除するには、先にほかの管理者の権限を外してください。",
            },
          ],
        },
        {
          userId: fixture.shared.userId,
          email: "seed_partner@example.com",
          organizations: [
            {
              name: "共同の店事業者",
              canDelete: false,
              reason: "組織を削除するには、先にほかの管理者の権限を外してください。",
            },
          ],
        },
      ]);
    });
  });

  describe("ensureSeedUser", () => {
    it("DEBUG_MODEがない実行先と本番のdeploymentでは、識別子が設定されていても拒否してユーザーを作らない", async () => {
      configureSeedUser();
      vi.stubEnv("DEBUG_MODE", "");
      const disabled = convexTest(schema, modules);
      await expect(disabled.mutation(internal.userSeed.mutations.ensureSeedUser, {})).rejects.toThrowError(
        "DEBUG_MODE",
      );
      expect(await readUsers(disabled)).toEqual([]);

      configureSeedUser();
      vi.stubEnv("CONVEX_CLOUD_URL", `https://${USER_SEED_PRODUCTION_DEPLOYMENT_NAME}.convex.cloud`);
      const production = convexTest(schema, modules);
      await expect(production.mutation(internal.userSeed.mutations.ensureSeedUser, {})).rejects.toThrowError(
        "production",
      );
      expect(await readUsers(production)).toEqual([]);
    });

    it("識別子が未設定、形が不正、実行先のClerkのissuerと不一致の場合は、拒否してユーザーを作らない", async () => {
      const cases = [
        { authTokenIdentifier: "", error: "not configured" },
        { authTokenIdentifier: "user_seedTarget01", error: "is invalid" },
        { authTokenIdentifier: `${CLERK_ISSUER}|seedTarget01`, error: "is invalid" },
        { authTokenIdentifier: "https://other.clerk.accounts.dev|user_seedTarget01", error: "does not match" },
      ];
      for (const { authTokenIdentifier, error } of cases) {
        configureSeedUser(authTokenIdentifier);
        const t = convexTest(schema, modules);
        await expect(t.mutation(internal.userSeed.mutations.ensureSeedUser, {})).rejects.toThrowError(error);
        expect(await readUsers(t)).toEqual([]);
      }
    });

    it("識別子が指す利用者のユーザーを1件だけ作り、もう一度呼んでも増やさない。返り値に識別子を含めない", async () => {
      configureSeedUser();
      const t = convexTest(schema, modules);

      const first = await t.mutation(internal.userSeed.mutations.ensureSeedUser, {});
      const second = await t.mutation(internal.userSeed.mutations.ensureSeedUser, {});

      expect(first).toEqual({ userId: first.userId, created: true });
      expect(second).toEqual({ userId: first.userId, created: false });
      expect(await readUsers(t)).toEqual([
        {
          _id: first.userId,
          authTokenIdentifier: SEED_AUTH_TOKEN_IDENTIFIER,
          name: "確認用ユーザー",
          email: "user-seed-manager@example.com",
          emailNormalized: "user-seed-manager@example.com",
          role: "manager",
          isDeleted: false,
        },
      ]);
      // 本人の操作ではないため、利用規約などへの同意は記録しない。
      expect(await t.run(async (ctx) => (await ctx.db.query("legalConsentStates").collect()).length)).toBe(0);
    });

    it("同じ識別子のユーザーが画面で作られている場合は、名前とメールアドレスを変えずにそのユーザーを返す", async () => {
      configureSeedUser();
      const t = convexTest(schema, modules);
      const existingUserId = await t.run(async (ctx) => {
        const userId = await seedUser(ctx, "seed_existing", "existing@example.test");
        await ctx.db.patch(userId, { authTokenIdentifier: SEED_AUTH_TOKEN_IDENTIFIER });
        return userId;
      });

      await expect(t.mutation(internal.userSeed.mutations.ensureSeedUser, {})).resolves.toEqual({
        userId: existingUserId,
        created: false,
      });
      expect(await readUsers(t)).toEqual([
        {
          _id: existingUserId,
          authTokenIdentifier: SEED_AUTH_TOKEN_IDENTIFIER,
          name: "管理者",
          email: "existing@example.test",
          emailNormalized: "existing@example.test",
          role: "manager",
          isDeleted: false,
        },
      ]);
    });

    it("同じ識別子のユーザーが削除済みか、アカウント削除を受け付けている場合は、拒否して作り直さない", async () => {
      for (const patch of [{ isDeleted: true }, { accountDeletionRequestedAt: Date.now() }]) {
        configureSeedUser();
        const t = convexTest(schema, modules);
        await t.run(async (ctx) => {
          const userId = await seedUser(ctx, "seed_removed");
          await ctx.db.patch(userId, { authTokenIdentifier: SEED_AUTH_TOKEN_IDENTIFIER, ...patch });
        });

        await expect(t.mutation(internal.userSeed.mutations.ensureSeedUser, {})).rejects.toThrowError("deleted");
        expect(await readUsers(t)).toHaveLength(1);
      }
    });

    it("作ったユーザーへ、そのまま確認用データを入れられる", async () => {
      configureSeedUser();
      const t = convexTest(schema, modules);

      const { userId } = await t.mutation(internal.userSeed.mutations.ensureSeedUser, {});
      const result = await t.mutation(internal.userSeed.mutations.seedUserOrganization, {
        userId,
        randomSeed: RANDOM_SEED,
      });

      const users = await t.query(internal.userSeed.queries.listUsers, {});
      expect(
        users.map((user) => ({ userId: user.userId, organizations: user.organizations.map(({ name }) => name) })),
      ).toEqual([{ userId, organizations: [result.organizationName] }]);
    });
  });

  describe("resetUserOrganizations", () => {
    it("唯一の管理者である組織だけを論理削除して後片付けを予約し、共同管理の組織と他人の組織は残す", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const fixture = await t.run(async (ctx) => {
        const solo = await seedOrganizationManagerShop(ctx, {
          subject: "seed_reset",
          shopName: "消す店",
          plan: "free",
        });
        const shared = await seedOrganizationManagerShop(ctx, {
          subject: "seed_reset_partner",
          shopName: "共同の店",
          plan: "free",
        });
        await seedOrganizationMembership(ctx, { userId: solo.userId, shopId: shared.shopId });
        const other = await seedOrganizationManagerShop(ctx, {
          subject: "seed_reset_other",
          shopName: "他人の店",
          plan: "free",
        });
        return { solo, shared, other };
      });

      const result = await t.mutation(internal.userSeed.mutations.resetUserOrganizations, {
        userId: fixture.solo.userId,
      });

      expect(result).toEqual({
        deleted: [{ organizationId: fixture.solo.organizationId, name: "消す店事業者" }],
        kept: [
          {
            organizationId: fixture.shared.organizationId,
            name: "共同の店事業者",
            reason: "組織を削除するには、先にほかの管理者の権限を外してください。",
          },
        ],
      });
      const organizations = await t.run(async (ctx) =>
        Promise.all(
          [fixture.solo.organizationId, fixture.shared.organizationId, fixture.other.organizationId].map(
            async (organizationId) => (await ctx.db.get(organizationId))?.isDeleted,
          ),
        ),
      );
      expect(organizations).toEqual([true, false, false]);
      expect(await readScheduledFunctionNames(t)).toEqual(["deletionCleanup/mutations:kick"]);
      // ユーザーの行は残し、もう一度画面から使える。
      expect(await t.run(async (ctx) => (await ctx.db.get(fixture.solo.userId))?.isDeleted)).toBe(false);
    });
  });

  describe("入れ直し", () => {
    it("ほかの管理者が確認用の管理者だけの組織は、その権限を外してから消し、ユーザーを増やさずに入れ直せる", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => seedUser(ctx, "seed_again", "again@example.test"));
      const first = await t.mutation(internal.userSeed.mutations.seedUserOrganization, {
        userId,
        randomSeed: RANDOM_SEED,
      });

      const listed = await t.query(internal.userSeed.queries.listUsers, {});
      expect(
        listed.map((user) =>
          user.organizations.map(({ organizationId, canDelete, reason }) => ({
            organizationId,
            canDelete,
            reason,
          })),
        ),
      ).toEqual([[{ organizationId: first.organizationId, canDelete: true, reason: null }]]);

      const reset = await t.mutation(internal.userSeed.mutations.resetUserOrganizations, { userId });

      expect(reset).toEqual({
        deleted: [{ organizationId: first.organizationId, name: "シフトリ確認用グループ" }],
        kept: [],
      });
      const afterReset = await t.run(async (ctx) => {
        const members = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", first.organizationId))
          .collect();
        return {
          isDeleted: (await ctx.db.get(first.organizationId))?.isDeleted,
          memberStatuses: members.map((member) => (member.userId === userId ? "本人" : member.status)).sort(),
        };
      });
      expect(afterReset).toEqual({ isDeleted: true, memberStatuses: ["removed", "removed", "removed", "本人"] });

      const second = await t.mutation(internal.userSeed.mutations.seedUserOrganization, {
        userId,
        randomSeed: RANDOM_SEED,
      });

      expect(second.managerCount).toBe(4);
      // 入れ先のユーザーと、ほかの管理者3人。入れ直してもユーザーは増えない。
      expect((await readUsers(t)).length).toBe(4);
      const relisted = await t.query(internal.userSeed.queries.listUsers, {});
      expect(
        relisted.map((user) =>
          user.organizations.map(({ organizationId, canDelete }) => ({ organizationId, canDelete })),
        ),
      ).toEqual([[{ organizationId: second.organizationId, canDelete: true }]]);
    });

    it("消したあとの後片付けが、LINE連携とほかの管理者を入れた組織でも最後まで進む", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => seedUser(ctx, "seed_cleanup", "cleanup@example.test"));
      await t.mutation(internal.userSeed.mutations.seedUserOrganization, { userId, randomSeed: RANDOM_SEED });
      await t.mutation(internal.userSeed.mutations.resetUserOrganizations, { userId });

      // 後片付けは少しずつ進む。終わるまで、予約された処理を1つずつ進める。
      for (let iteration = 0; iteration < 3000; iteration += 1) {
        vi.advanceTimersByTime(0);
        await t.finishInProgressScheduledFunctions();
        const completed = await t.run(
          async (ctx) => (await ctx.db.query("deletionCleanupJobs").first())?.status === "completed",
        );
        if (completed) break;
      }

      const jobs = await t.run(async (ctx) =>
        (await ctx.db.query("deletionCleanupJobs").collect()).map(({ scope, status }) => ({ scope, status })),
      );
      expect(jobs).toEqual([{ scope: "organization", status: "completed" }]);
      const failedJobs = await t.run(async (ctx) =>
        (await ctx.db.system.query("_scheduled_functions").collect())
          .filter((job) => job.state.kind === "failed")
          .map((job) => job.name),
      );
      expect(failedJobs).toEqual([]);
      const remainingLine = await t.run(async (ctx) => ({
        links: (await ctx.db.query("organizationPersonLineLinks").collect()).filter((link) => !link.isDeleted).length,
        accounts: (await ctx.db.query("staffLineAccounts").collect()).filter((account) => !account.isDeleted).length,
        providers: (await ctx.db.query("lineProviderUsers").collect()).filter((provider) => !provider.isDeleted).length,
      }));
      expect(remainingLine).toEqual({ links: 0, accounts: 0, providers: 0 });
    });

    it("画面で招待した管理者もいる組織は、確認用の管理者がいても消さず、だれの権限も外さない", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => seedUser(ctx, "seed_shared", "shared@example.test"));
      const seeded = await t.mutation(internal.userSeed.mutations.seedUserOrganization, {
        userId,
        randomSeed: RANDOM_SEED,
      });
      await t.run(async (ctx) => {
        const partnerUserId = await seedUser(ctx, "seed_shared_partner");
        const shop = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .first();
        if (!shop) throw new Error("Seeded shop was not found");
        await seedOrganizationMembership(ctx, { userId: partnerUserId, shopId: shop._id });
      });

      const reset = await t.mutation(internal.userSeed.mutations.resetUserOrganizations, { userId });

      expect(reset).toEqual({
        deleted: [],
        kept: [
          {
            organizationId: seeded.organizationId,
            name: "シフトリ確認用グループ",
            reason: "組織を削除するには、先にほかの管理者の権限を外してください。",
          },
        ],
      });
      const after = await t.run(async (ctx) => {
        const members = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .collect();
        return {
          isDeleted: (await ctx.db.get(seeded.organizationId))?.isDeleted,
          memberStatuses: members.map((member) => member.status),
        };
      });
      expect(after).toEqual({ isDeleted: false, memberStatuses: ["active", "active", "active", "active", "active"] });
      expect(await readScheduledFunctionNames(t)).toEqual([]);
    });

    it("ほかのユーザーのために作った確認用の管理者は、自分の組織の確認用の管理者として扱わない", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const { userId, otherCoManagerUserId } = await t.run(async (ctx) => {
        const ownerId = await seedUser(ctx, "seed_owner_a", "owner-a@example.test");
        const otherOwnerId = await seedUser(ctx, "seed_owner_b", "owner-b@example.test");
        const coManagerId = await seedUser(ctx, "seed_other_co_manager");
        await ctx.db.patch(coManagerId, {
          authTokenIdentifier: `https://seed.example.test|user-seed-${otherOwnerId}-manager-1`,
        });
        return { userId: ownerId, otherCoManagerUserId: coManagerId };
      });
      const seeded = await t.mutation(internal.userSeed.mutations.seedUserOrganization, {
        userId,
        randomSeed: RANDOM_SEED,
      });
      await t.run(async (ctx) => {
        const shop = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", seeded.organizationId))
          .first();
        if (!shop) throw new Error("Seeded shop was not found");
        await seedOrganizationMembership(ctx, { userId: otherCoManagerUserId, shopId: shop._id });
      });

      const reset = await t.mutation(internal.userSeed.mutations.resetUserOrganizations, { userId });

      expect(reset.deleted).toEqual([]);
      expect(reset.kept.map(({ organizationId }) => organizationId)).toEqual([seeded.organizationId]);
      expect(await t.run(async (ctx) => (await ctx.db.get(seeded.organizationId))?.isDeleted)).toBe(false);
    });
  });

  describe("seedUserOrganization", () => {
    async function seedForFreshUser() {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) => seedUser(ctx, "seed_target", "manager@example.test"));
      const result = await t.mutation(internal.userSeed.mutations.seedUserOrganization, {
        userId,
        randomSeed: RANDOM_SEED,
      });
      return { t, userId, result };
    }

    it("Trialの組織に3つの集め方の店舗と4つの状態の募集を作り、管理者4人とシフトから外した人を入れ、メモと希望を食い違わせない", async () => {
      const { t, userId, result } = await seedForFreshUser();

      expect(result.randomSeed).toBe(RANDOM_SEED);
      expect(result.noteMismatchCount).toBe(0);
      const snapshot = await t.run(async (ctx) => {
        const organization = await ctx.db.get(result.organizationId);
        const billing = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .unique();
        const members = await ctx.db
          .query("organizationMembers")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const shops = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const perShop = await Promise.all(
          shops.map(async (shop) => {
            const staffs = await ctx.db
              .query("staffs")
              .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
              .collect();
            const recruitments = await ctx.db
              .query("recruitments")
              .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
              .collect();
            return {
              name: shop.name,
              pattern: shop.submissionPattern.kind,
              staffCount: staffs.length,
              excludedStaffCount: staffs.filter((staff) => !staff.userId && staff.excludedFromShift).length,
              // 管理者は、本人を「本人」、ほかの管理者を名前で示す。
              managers: staffs
                .filter((staff) => staff.userId)
                .map((staff) => (staff.userId === userId ? "本人" : staff.name))
                .sort(),
              excludedManagers: staffs
                .filter((staff) => staff.userId && staff.excludedFromShift)
                .map((staff) => (staff.userId === userId ? "本人" : staff.name))
                .sort(),
              recruitmentStatuses: recruitments
                .map((recruitment) => `${recruitment.periodStart}:${recruitment.status}`)
                .sort(),
            };
          }),
        );
        return {
          organizationName: organization?.name,
          createdByUserId: organization?.createdByUserId,
          billingKind: billing?.state.kind,
          activeManagerCount: members.filter((member) => member.status === "active").length,
          perShop,
        };
      });

      const managers = ["岡田 修", "本人", "石川 誠", "藤井 香織"];
      expect(snapshot).toEqual({
        organizationName: "シフトリ確認用グループ",
        createdByUserId: userId,
        billingKind: "trial",
        activeManagerCount: 4,
        perShop: [
          {
            name: "時間指定",
            pattern: "time",
            staffCount: 24,
            excludedStaffCount: 3,
            managers,
            excludedManagers: ["藤井 香織"],
            recruitmentStatuses: ["2026-11-12:confirmed", "2026-11-19:confirmed", "2026-11-26:open", "2026-12-03:open"],
          },
          {
            name: "日付選択",
            pattern: "dateOnly",
            staffCount: 24,
            excludedStaffCount: 3,
            managers,
            excludedManagers: ["岡田 修", "本人"],
            recruitmentStatuses: ["2026-11-12:confirmed", "2026-11-19:confirmed", "2026-11-26:open", "2026-12-03:open"],
          },
          {
            name: "パターン選択",
            pattern: "shiftType",
            staffCount: 24,
            excludedStaffCount: 3,
            managers,
            excludedManagers: ["石川 誠"],
            recruitmentStatuses: ["2026-11-12:confirmed", "2026-11-19:confirmed", "2026-11-26:open", "2026-12-03:open"],
          },
        ],
      });
      expect({ managerCount: result.managerCount, lineLinkedStaffCount: result.lineLinkedStaffCount }).toEqual({
        managerCount: 4,
        lineLinkedStaffCount: 8,
      });
      for (const shop of result.shops) {
        expect(shop.recruitments.map((recruitment) => recruitment.submittedCount > 0)).toEqual([
          true,
          true,
          true,
          true,
        ]);
        // 割り当ては締め切り後の募集と確定済みの募集にだけ入れる。
        expect(shop.recruitments.map((recruitment) => recruitment.assignmentCount > 0)).toEqual([
          true,
          true,
          true,
          false,
        ]);
      }
    });

    it("通知を予約せず、管理者本人以外のメールアドレスをすべてexample.comにする", async () => {
      const { t, userId } = await seedForFreshUser();

      expect(await readScheduledFunctionNames(t)).toEqual([]);
      const emails = await t.run(async (ctx) => {
        const staffs = await ctx.db.query("staffs").collect();
        const requests = await ctx.db.query("staffRegistrationRequests").collect();
        return [
          ...staffs.filter((staff) => staff.userId !== userId).map((staff) => staff.email),
          ...requests.map((request) => request.email),
        ];
      });
      // スタッフ20人とほかの管理者3人が3店舗ぶんと、登録申請の1件。
      expect(emails.length).toBe(70);
      expect(emails.filter((email) => !email.endsWith("@example.com"))).toEqual([]);
    });

    it("確定済みの通知の記録は割り当てと一致させ、「確定後に変更あり」だけ2人を変更ありにする", async () => {
      const { t, result } = await seedForFreshUser();

      const changedCounts = await t.run(async (ctx) => {
        const shops = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const counts: Array<{ periodStart: string; changed: number; snapshots: number }> = [];
        for (const shop of shops) {
          const recruitments = await ctx.db
            .query("recruitments")
            .withIndex("by_shopId_status", (q) => q.eq("shopId", shop._id).eq("status", "confirmed"))
            .collect();
          for (const recruitment of recruitments) {
            const snapshots = await ctx.db
              .query("shiftConfirmationSnapshots")
              .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
              .collect();
            let changed = 0;
            for (const snapshot of snapshots) {
              const assignments = await ctx.db
                .query("shiftAssignments")
                .withIndex("by_recruitmentId_staffId", (q) =>
                  q.eq("recruitmentId", recruitment._id).eq("staffId", snapshot.staffId),
                )
                .collect();
              const current = assignments.map(({ date, startTime, endTime, positionId, optionId, breaks }) => ({
                date,
                startTime,
                endTime,
                positionId,
                ...(optionId ? { optionId } : {}),
                ...(breaks ? { breaks } : {}),
              }));
              if (buildConfirmationSnapshotSignature(current) !== snapshot.signature) changed += 1;
            }
            counts.push({ periodStart: recruitment.periodStart, changed, snapshots: snapshots.length });
          }
        }
        return counts;
      });

      expect(changedCounts.every((entry) => entry.snapshots > 0)).toBe(true);
      expect(
        changedCounts
          .map(({ periodStart, changed }) => ({ periodStart, changed }))
          .sort((a, b) => a.periodStart.localeCompare(b.periodStart)),
      ).toEqual([
        { periodStart: "2026-11-12", changed: 0 },
        { periodStart: "2026-11-12", changed: 0 },
        { periodStart: "2026-11-12", changed: 0 },
        { periodStart: "2026-11-19", changed: 2 },
        { periodStart: "2026-11-19", changed: 2 },
        { periodStart: "2026-11-19", changed: 2 },
      ]);
    });

    it("入れた募集はすべて、管理者のシフト表のqueryで割り当てと必要人数まで読める", async () => {
      const { t, result } = await seedForFreshUser();
      const manager = t.withIdentity({ subject: "seed_target" });
      const recruitments = await t.run(async (ctx) => {
        const shops = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const rows: Array<{ shopId: Id<"shops">; recruitmentId: Id<"recruitments"> }> = [];
        for (const shop of shops) {
          const shopRecruitments = await ctx.db
            .query("recruitments")
            .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
            .collect();
          rows.push(...shopRecruitments.map((recruitment) => ({ shopId: shop._id, recruitmentId: recruitment._id })));
        }
        return rows;
      });
      const expectedAssignmentCounts = result.shops.flatMap((shop) =>
        shop.recruitments.map((recruitment) => recruitment.assignmentCount),
      );

      const readCounts: number[] = [];
      for (const { shopId, recruitmentId } of recruitments) {
        const scope = { shopId, expectedOrganizationId: result.organizationId, recruitmentId };
        const board = await manager.query(api.shiftBoard.queries.getShiftBoardData, {
          ...scope,
          refreshDayKey: "2026-11-22",
        });
        const staffing = await manager.query(api.shiftBoard.queries.getShiftBoardStaffing, scope);
        expect(board).not.toBeNull();
        expect(staffing).not.toBeNull();
        readCounts.push(board?.shiftAssignments.length ?? -1);
      }
      expect(readCounts).toEqual(expectedAssignmentCounts);
    });

    it("シフトから外した人には希望も割り当ても入れず、シフトに入るほかの管理者には希望を入れる", async () => {
      const { t, userId, result } = await seedForFreshUser();

      const counts = await t.run(async (ctx) => {
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const submissions = await ctx.db.query("shiftSubmissions").collect();
        const assignments = await ctx.db.query("shiftAssignments").collect();
        const submissionCountOf = (staff: (typeof staffs)[number]) =>
          submissions.filter((submission) => submission.staffId === staff._id).length;
        const assignmentCountOf = (staff: (typeof staffs)[number]) =>
          assignments.filter((assignment) => assignment.staffId === staff._id).length;
        const excluded = staffs.filter((staff) => staff.excludedFromShift);
        const coManagersInShift = staffs.filter(
          (staff) => staff.userId && staff.userId !== userId && !staff.excludedFromShift,
        );
        return {
          excludedCount: excluded.length,
          excludedSubmissions: excluded.map(submissionCountOf).reduce((a, b) => a + b, 0),
          excludedAssignments: excluded.map(assignmentCountOf).reduce((a, b) => a + b, 0),
          coManagerInShiftCount: coManagersInShift.length,
          coManagersWithoutSubmission: coManagersInShift.filter((staff) => submissionCountOf(staff) === 0).length,
        };
      });

      expect(counts).toEqual({
        // スタッフ3人が3店舗ぶんと、管理者の4人。
        excludedCount: 13,
        excludedSubmissions: 0,
        excludedAssignments: 0,
        // ほかの管理者3人が3店舗ぶんの9件から、外した3件を引く。
        coManagerInShiftCount: 6,
        coManagersWithoutSubmission: 0,
      });
    });

    it("スタッフ8人をLINE連携済みにし、その人の全店舗のスタッフへ同じ連携を書く。管理者は連携しない", async () => {
      const { t, result } = await seedForFreshUser();

      const snapshot = await t.run(async (ctx) => {
        const people = await ctx.db
          .query("organizationPeople")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const states = await Promise.all(
          people.map(async (person) => ({
            person,
            state: await getOrganizationPersonLineState(ctx, {
              organizationId: result.organizationId,
              organizationPersonId: person._id,
            }),
          })),
        );
        const linked = states.filter(({ state }) => state?.status !== "unlinked");
        const providers = await ctx.db.query("lineProviderUsers").collect();
        const accounts = await ctx.db.query("staffLineAccounts").collect();
        const staffs = await ctx.db
          .query("staffs")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const linkedPersonIds = new Set(linked.map(({ person }) => person._id));
        const lineUserIdByPerson = new Map<string, Set<string>>();
        for (const account of accounts) {
          const staff = staffs.find((candidate) => candidate._id === account.staffId);
          const key = String(staff?.organizationPersonId);
          lineUserIdByPerson.set(key, (lineUserIdByPerson.get(key) ?? new Set()).add(account.lineUserId));
        }
        return {
          peopleCount: people.length,
          linkedStatuses: linked.map(({ state }) => state?.status),
          linkedManagerCount: linked.filter(({ person }) => person.userId).length,
          providerCount: providers.length,
          uniqueLineUserIdCount: new Set(providers.map((provider) => provider.lineUserId)).size,
          fakeLineUserIdCount: providers.filter((provider) => provider.lineUserId.startsWith("U_USER_SEED_")).length,
          // 連携済みの人の全店舗のスタッフにだけ、連携の行がある。
          accountStaffIds: accounts.map((account) => account.staffId).sort(),
          linkedStaffIds: staffs
            .filter((staff) => linkedPersonIds.has(staff.organizationPersonId))
            .map((staff) => staff._id)
            .sort(),
          // 1人の連携は、どの店舗でも同じLINEの利用者を指す。
          peopleWithOneLineUserId: [...lineUserIdByPerson.values()].filter((ids) => ids.size === 1).length,
          deletedOrUnfollowedAccountCount: accounts.filter((account) => account.isDeleted || !account.following).length,
        };
      });

      expect(snapshot.accountStaffIds).toEqual(snapshot.linkedStaffIds);
      expect({ ...snapshot, accountStaffIds: snapshot.accountStaffIds.length, linkedStaffIds: undefined }).toEqual({
        // 管理者4人とスタッフ20人。
        peopleCount: 24,
        linkedStatuses: Array.from({ length: 8 }, () => "linked_following"),
        linkedManagerCount: 0,
        providerCount: 8,
        uniqueLineUserIdCount: 8,
        fakeLineUserIdCount: 8,
        // 8人が3店舗ぶん。
        accountStaffIds: 24,
        linkedStaffIds: undefined,
        peopleWithOneLineUserId: 8,
        deletedOrUnfollowedAccountCount: 0,
      });
    });

    it("ほかの管理者のユーザーはログインできない識別子で作り、入れ先の一覧に出さず、入れ先にもできない", async () => {
      const { t, userId } = await seedForFreshUser();

      const users = await readUsers(t);
      const coManagers = users.filter((user) => user._id !== userId);
      expect(
        coManagers.map(({ authTokenIdentifier, name, email, isDeleted }) => ({
          authTokenIdentifier,
          name,
          email,
          isDeleted,
        })),
      ).toEqual([
        {
          authTokenIdentifier: `https://seed.example.test|user-seed-${userId}-manager-1`,
          name: "石川 誠",
          email: "devmanager01@example.com",
          isDeleted: false,
        },
        {
          authTokenIdentifier: `https://seed.example.test|user-seed-${userId}-manager-2`,
          name: "藤井 香織",
          email: "devmanager02@example.com",
          isDeleted: false,
        },
        {
          authTokenIdentifier: `https://seed.example.test|user-seed-${userId}-manager-3`,
          name: "岡田 修",
          email: "devmanager03@example.com",
          isDeleted: false,
        },
      ]);

      const listed = await t.query(internal.userSeed.queries.listUsers, {});
      expect(listed.map((user) => user.userId)).toEqual([userId]);
      await expect(
        t.mutation(internal.userSeed.mutations.seedUserOrganization, { userId: coManagers[0]._id }),
      ).rejects.toThrowError("not found");
      await expect(
        t.mutation(internal.userSeed.mutations.resetUserOrganizations, { userId: coManagers[0]._id }),
      ).rejects.toThrowError("not found");
      expect(await countOrganizations(t)).toBe(1);
    });

    it("送ったことにした通知は、送信済みの履歴とOutboxの組だけを書き、宛先と本文を持たせない", async () => {
      const { t, userId, result } = await seedForFreshUser();

      const snapshot = await t.run(async (ctx) => {
        const histories = await ctx.db.query("notificationHistory").collect();
        const outboxes = await ctx.db.query("notificationOutbox").collect();
        const staffs = await ctx.db.query("staffs").collect();
        const ownerStaffIds = new Set(staffs.filter((staff) => staff.userId === userId).map((staff) => staff._id));
        const outboxById = new Map(outboxes.map((outbox) => [outbox._id, outbox]));
        return {
          historyCount: histories.length,
          outboxCount: outboxes.length,
          pairedOutboxCount: new Set(histories.map((history) => history.outboxId)).size,
          channelMismatchCount: histories.filter(
            (history) => outboxById.get(history.outboxId)?.channel !== history.channel,
          ).length,
          emailCount: histories.filter((history) => history.channel === "email").length,
          lineCount: histories.filter((history) => history.channel === "line").length,
          historyStates: [
            ...new Set(
              histories.map((history) => `${history.channel}:${history.sendStatus}:${history.deliveryStatus}`),
            ),
          ].sort(),
          outboxStates: [
            ...new Set(
              outboxes.map(
                (outbox) =>
                  `${outbox.status}:${outbox.purpose}:${outbox.deliverySuppressed}:${outbox.payloadRedactedAt !== undefined}`,
              ),
            ),
          ],
          // 宛先と本文を持つOutboxがないこと。
          payloadsWithContent: outboxes.filter((outbox) =>
            outbox.payload.kind === "email"
              ? outbox.payload.to !== "" || outbox.payload.html !== "" || outbox.payload.subject !== ""
              : outbox.payload.kind !== "line" || outbox.payload.toUserId !== "" || outbox.payload.text !== "",
          ).length,
          uniqueDedupeKeyCount: new Set(outboxes.map((outbox) => outbox.dedupeKey)).size,
          // 本来の送信と同じ形のキーにすると、入れたあとに画面から送る通知が重複として止まる。
          realFormDedupeKeyCount: outboxes.filter((outbox) => !outbox.dedupeKey.startsWith("user-seed:")).length,
          ownerHistoryCount: histories.filter((history) => ownerStaffIds.has(history.staffId)).length,
          newestRequestedAtIsPast: Math.max(...histories.map((history) => history.requestedAt)) < Date.now(),
        };
      });

      expect(snapshot.historyCount).toBeGreaterThan(0);
      expect(snapshot).toEqual({
        historyCount: snapshot.historyCount,
        outboxCount: snapshot.historyCount,
        pairedOutboxCount: snapshot.historyCount,
        channelMismatchCount: 0,
        emailCount: result.emailNotificationCount,
        lineCount: result.lineNotificationCount,
        historyStates: ["email:sent:delivered", "line:sent:not_supported"],
        outboxStates: ["sent:business:true:true"],
        payloadsWithContent: 0,
        uniqueDedupeKeyCount: snapshot.historyCount,
        realFormDedupeKeyCount: 0,
        ownerHistoryCount: 0,
        newestRequestedAtIsPast: true,
      });
      expect(result.emailNotificationCount + result.lineNotificationCount).toBe(snapshot.historyCount);
      expect(await readScheduledFunctionNames(t)).toEqual([]);
    });

    it("通知の種類ごとに、届くはずの人にだけ記録を入れる", async () => {
      const { t, userId, result } = await seedForFreshUser();

      const { actual, expected } = await t.run(async (ctx) => {
        const histories = await ctx.db.query("notificationHistory").collect();
        const outboxes = await ctx.db.query("notificationOutbox").collect();
        const outboxById = new Map(outboxes.map((outbox) => [outbox._id, outbox]));
        const shops = await ctx.db
          .query("shops")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", result.organizationId))
          .collect();
        const actualRows: string[] = [];
        for (const history of histories) {
          const recruitmentId = outboxById.get(history.outboxId)?.recruitmentId ?? "-";
          actualRows.push(`${history.notificationKind}|${recruitmentId}|${history.staffId}`);
        }
        const expectedRows: string[] = [];
        for (const shop of shops) {
          const staffs = (
            await ctx.db
              .query("staffs")
              .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", shop._id).eq("isDeleted", false))
              .collect()
          ).filter((staff) => staff.userId !== userId);
          // 使い方の案内とLINE連携の案内は、管理者ではないスタッフの全員に届く。シフトから外した人にも届く。
          for (const staff of staffs.filter((candidate) => candidate.userId === undefined)) {
            expectedRows.push(`legal.consent|-|${staff._id}`, `line.invite|-|${staff._id}`);
          }
          const shiftTargets = staffs.filter((staff) => !staff.excludedFromShift);
          const recruitments = await ctx.db
            .query("recruitments")
            .withIndex("by_shopId", (q) => q.eq("shopId", shop._id))
            .collect();
          for (const recruitment of recruitments) {
            const submissions = await ctx.db
              .query("shiftSubmissions")
              .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
              .collect();
            const submitted = new Set(submissions.map((submission) => submission.staffId));
            const snapshots = await ctx.db
              .query("shiftConfirmationSnapshots")
              .withIndex("by_recruitmentId", (q) => q.eq("recruitmentId", recruitment._id))
              .collect();
            const confirmed = new Set(snapshots.map((snapshot) => snapshot.staffId));
            // 募集中の募集（期限が6日後）は、催促の時刻がまだ来ていない。
            const isReminderSent = recruitment.deadline < "2026-11-22";
            for (const staff of shiftTargets) {
              expectedRows.push(`shift.recruitment|${recruitment._id}|${staff._id}`);
              if (isReminderSent && !submitted.has(staff._id)) {
                expectedRows.push(`shift.reminder|${recruitment._id}|${staff._id}`);
              }
              if (confirmed.has(staff._id)) expectedRows.push(`shift.confirmation|${recruitment._id}|${staff._id}`);
            }
          }
        }
        return { actual: actualRows.sort(), expected: expectedRows.sort() };
      });

      expect(actual).toEqual(expected);
      const countOf = (kind: string) => actual.filter((row) => row.startsWith(`${kind}|`)).length;
      expect({
        consent: countOf("legal.consent"),
        invite: countOf("line.invite"),
        // 確定済みと確定後に変更ありで1人ずつ、下書きありで2人が未提出。3店舗ぶん。
        reminder: countOf("shift.reminder"),
        hasConfirmation: countOf("shift.confirmation") > 0,
      }).toEqual({ consent: 60, invite: 60, reminder: 12, hasConfirmation: true });
    });

    it("LINE連携した人の通知は連携より前がメール、あとがLINEになり、管理者の通知履歴でも切り替わって見える", async () => {
      const { t, result } = await seedForFreshUser();

      const { channelMismatchCount, unlinkedLineCount, switched } = await t.run(async (ctx) => {
        const histories = await ctx.db.query("notificationHistory").collect();
        const links = await ctx.db.query("organizationPersonLineLinks").collect();
        const linkedAtByPerson = new Map(links.map((link) => [link.organizationPersonId, link.linkedAt]));
        const staffs = await ctx.db.query("staffs").collect();
        const staffById = new Map(staffs.map((staff) => [staff._id, staff]));
        let mismatches = 0;
        let lineForUnlinked = 0;
        const channelsByStaff = new Map<Id<"staffs">, Set<string>>();
        for (const history of histories) {
          const staff = staffById.get(history.staffId);
          const linkedAt = staff?.organizationPersonId ? linkedAtByPerson.get(staff.organizationPersonId) : undefined;
          if (linkedAt === undefined && history.channel === "line") lineForUnlinked += 1;
          const expectedChannel = linkedAt !== undefined && linkedAt <= history.requestedAt ? "line" : "email";
          if (history.channel !== expectedChannel) mismatches += 1;
          channelsByStaff.set(
            history.staffId,
            (channelsByStaff.get(history.staffId) ?? new Set()).add(history.channel),
          );
        }
        const switchedStaff = staffs.find((staff) => channelsByStaff.get(staff._id)?.size === 2);
        return {
          channelMismatchCount: mismatches,
          unlinkedLineCount: lineForUnlinked,
          switched: switchedStaff ? { staffId: switchedStaff._id, shopId: switchedStaff.shopId } : null,
        };
      });

      expect({ channelMismatchCount, unlinkedLineCount }).toEqual({ channelMismatchCount: 0, unlinkedLineCount: 0 });
      if (!switched) throw new Error("メールからLINEへ切り替わったスタッフがいない");

      const page = await t
        .withIdentity({ subject: "seed_target" })
        .query(api.notificationOutbox.queries.listStaffNotificationHistory, {
          shopId: switched.shopId,
          expectedOrganizationId: result.organizationId,
          staffId: switched.staffId,
          paginationOpts: { numItems: 50, cursor: null },
        });

      // 新しい順に返る。古い順に直すと、メールが続いたあとにLINEが続く。
      const oldestFirst = [...page.page].reverse();
      expect(page.isDone).toBe(true);
      expect(oldestFirst.map((item) => item.requestedAt)).toEqual(
        [...oldestFirst.map((item) => item.requestedAt)].sort((a, b) => a - b),
      );
      const channels = oldestFirst.map((item) => item.channel);
      const firstLineIndex = channels.indexOf("line");
      expect(firstLineIndex).toBeGreaterThan(1);
      expect(channels).toEqual([
        ...Array.from({ length: firstLineIndex }, () => "email"),
        ...Array.from({ length: channels.length - firstLineIndex }, () => "line"),
      ]);
      expect(
        oldestFirst
          .slice(0, 2)
          .map(({ channel, displayTitle, displayStatus }) => ({ channel, displayTitle, displayStatus })),
      ).toEqual([
        {
          channel: "email",
          displayTitle: expect.stringMatching(/^【シフトリ：.+】シフトリの使い方のご案内$/),
          displayStatus: "delivered",
        },
        {
          channel: "email",
          displayTitle: expect.stringMatching(/^【シフトリ：.+】シフト通知をLINEで受け取れます$/),
          displayStatus: "delivered",
        },
      ]);
      const lineItems = oldestFirst.slice(firstLineIndex);
      expect([...new Set(lineItems.map((item) => item.displayStatus))]).toEqual(["sent"]);
      expect(
        lineItems.filter(
          (item) =>
            !/^(シフト募集のお知らせ|確定シフトのお知らせ) .+〜.+$|^シフト提出のお願い$/.test(item.displayTitle),
        ),
      ).toEqual([]);
    });

    it("削除済みのユーザーには入れず、組織を作らない", async () => {
      enableUserSeed();
      const t = convexTest(schema, modules);
      const userId: Id<"users"> = await t.run(async (ctx) => {
        const id = await seedUser(ctx, "seed_deleted_target");
        await ctx.db.patch(id, { isDeleted: true });
        return id;
      });

      await expect(t.mutation(internal.userSeed.mutations.seedUserOrganization, { userId })).rejects.toThrowError(
        "not found",
      );
      expect(await countOrganizations(t)).toBe(0);
    });
  });
});
