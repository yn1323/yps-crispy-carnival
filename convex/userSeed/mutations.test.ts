import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedOrganizationMembership, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
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

    it("Trialの組織に3つの集め方の店舗と4つの状態の募集を作り、メモと希望を食い違わせない", async () => {
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
              excludedCount: staffs.filter((staff) => staff.excludedFromShift).length,
              managerStaffCount: staffs.filter((staff) => staff.userId === userId).length,
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
          activeManagers: members.filter((member) => member.status === "active").map((member) => member.userId),
          perShop,
        };
      });

      expect(snapshot).toEqual({
        organizationName: "シフトリ確認用グループ",
        createdByUserId: userId,
        billingKind: "trial",
        activeManagers: [userId],
        perShop: [
          {
            name: "時間指定",
            pattern: "time",
            staffCount: 21,
            excludedCount: 1,
            managerStaffCount: 1,
            recruitmentStatuses: ["2026-11-12:confirmed", "2026-11-19:confirmed", "2026-11-26:open", "2026-12-03:open"],
          },
          {
            name: "日付選択",
            pattern: "dateOnly",
            staffCount: 21,
            excludedCount: 1,
            managerStaffCount: 1,
            recruitmentStatuses: ["2026-11-12:confirmed", "2026-11-19:confirmed", "2026-11-26:open", "2026-12-03:open"],
          },
          {
            name: "パターン選択",
            pattern: "shiftType",
            staffCount: 21,
            excludedCount: 1,
            managerStaffCount: 1,
            recruitmentStatuses: ["2026-11-12:confirmed", "2026-11-19:confirmed", "2026-11-26:open", "2026-12-03:open"],
          },
        ],
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
      expect(emails.length).toBe(61);
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
