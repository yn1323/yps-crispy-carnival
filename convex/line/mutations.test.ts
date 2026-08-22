import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  seedLegacyShopMembership,
  seedManagerShop,
  seedOrganizationManagerShop,
  seedShop,
  seedStaffLineAccount,
} from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { LINE_LINK_REDEEM_GLOBAL_LIMIT, LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT } from "../constants";
import { ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT } from "../organization/service";
import { resolveStaffLineRecipient } from "./service";

async function setupShop(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => {
    const { shopId } = await seedManagerShop(ctx, {
      subject: "user_mgr",
      email: "mgr@example.com",
      shopName: "テスト店舗",
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId,
      name: "鈴木太郎",
      email: "suzuki@example.com",
      isDeleted: false,
    });
    return { shopId, staffId };
  });
}

async function setupOrganizationShop(
  t: TestConvex<typeof schema>,
  subject: string,
  plan: "free" | "pro" | "business" = "pro",
) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, {
      subject,
      email: `${subject}@example.com`,
      shopName: "事業者店舗",
      plan,
    });
    const staffPersonId = await ctx.db.insert("organizationPeople", {
      organizationId: seeded.organizationId,
      name: "事業者店舗スタッフ",
      email: `${subject}-staff@example.com`,
      emailNormalized: `${subject}-staff@example.com`,
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const staffId = await ctx.db.insert("staffs", {
      shopId: seeded.shopId,
      organizationId: seeded.organizationId,
      organizationPersonId: staffPersonId,
      name: "事業者店舗スタッフ",
      email: `${subject}-staff@example.com`,
      isDeleted: false,
    });
    return { ...seeded, personId: staffPersonId, staffId };
  });
}

async function setupOrganizationPersonTwoShops(t: TestConvex<typeof schema>, subject: string) {
  return await t.run(async (ctx) => {
    const seeded = await seedOrganizationManagerShop(ctx, {
      subject,
      email: `${subject}@example.com`,
      shopName: "店舗A",
      plan: "pro",
    });
    const now = Date.now();
    const staffPersonId = await ctx.db.insert("organizationPeople", {
      organizationId: seeded.organizationId,
      name: "共通スタッフ",
      email: `${subject}-staff@example.com`,
      emailNormalized: `${subject}-staff@example.com`,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    const shopBId = await ctx.db.insert("shops", {
      organizationId: seeded.organizationId,
      operatingStatus: "active",
      name: "店舗B",
      submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
      regularClosedDays: [],
      isDeleted: false,
    });
    const staffAId = await ctx.db.insert("staffs", {
      shopId: seeded.shopId,
      organizationId: seeded.organizationId,
      organizationPersonId: staffPersonId,
      name: "共通スタッフ",
      email: `${subject}-staff@example.com`,
      isDeleted: false,
    });
    const staffBId = await ctx.db.insert("staffs", {
      shopId: shopBId,
      organizationId: seeded.organizationId,
      organizationPersonId: staffPersonId,
      name: "共通スタッフ",
      email: `${subject}-staff@example.com`,
      isDeleted: false,
    });
    return { ...seeded, personId: staffPersonId, shopBId, staffAId, staffBId };
  });
}

async function finalizeForStaff(
  t: TestConvex<typeof schema>,
  args: { subject: string; shopId: Id<"shops">; staffId: Id<"staffs">; lineUserId: string; following?: boolean },
) {
  const { token } = await t.withIdentity({ subject: args.subject }).mutation(api.line.mutations.generateLinkToken, {
    shopId: args.shopId,
    staffId: args.staffId,
  });
  const tokenDocId = await t.run(async (ctx) => {
    const tokenDoc = await ctx.db
      .query("lineLinkTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!tokenDoc) throw new Error("LINE token was not persisted");
    return tokenDoc._id;
  });
  return await t.mutation(internal.line.mutations.finalizeLinking, {
    staffId: args.staffId,
    tokenDocId,
    lineUserId: args.lineUserId,
    lineFollowing: args.following ?? true,
  });
}

async function seedLineLinkToken(
  t: TestConvex<typeof schema>,
  args: {
    staffId: Id<"staffs">;
    shopId: Id<"shops">;
    token?: string;
    expiresAt?: number;
    usedAt?: number;
  },
) {
  const token = args.token ?? "line-link-token";
  const tokenDocId = await t.run(async (ctx) => {
    const staff = await ctx.db.get(args.staffId);
    const person = staff?.organizationPersonId ? await ctx.db.get(staff.organizationPersonId) : null;
    const tokenDoc = {
      staffId: args.staffId,
      shopId: args.shopId,
      ...(staff?.organizationId && person
        ? {
            organizationId: staff.organizationId,
            organizationPersonId: person._id,
            lineLinkGenerationAtIssue: person.lineLinkGeneration ?? 0,
          }
        : {}),
      token,
      expiresAt: args.expiresAt ?? Date.now() + 72 * 60 * 60 * 1000,
      ...(args.usedAt === undefined ? {} : { usedAt: args.usedAt }),
    };
    return await ctx.db.insert("lineLinkTokens", tokenDoc);
  });
  return { token, tokenDocId };
}

async function issueOrganizationLineLinkToken(t: TestConvex<typeof schema>, subject: string) {
  const target = await setupOrganizationShop(t, subject, "free");
  const { token } = await t.withIdentity({ subject }).mutation(api.line.mutations.generateLinkToken, {
    shopId: target.shopId,
    staffId: target.staffId,
  });
  const tokenDocId = await t.run(async (ctx) => {
    const tokenDoc = await ctx.db
      .query("lineLinkTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!tokenDoc) throw new Error("LINE token was not persisted");
    return tokenDoc._id;
  });
  return { ...target, token, tokenDocId };
}

async function blockOrganizationBusinessWritesByUsage(
  t: TestConvex<typeof schema>,
  args: {
    organizationId: Id<"organizations">;
    shopId: Id<"shops">;
    suffix: string;
    state: "overLimit" | "unknown";
  },
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    const count = args.state === "overLimit" ? 4 : ORGANIZATION_USAGE_ACCESS_ACTIVE_PEOPLE_SCAN_LIMIT + 1;
    for (let index = 0; index < count; index += 1) {
      const email = `${args.suffix}-${String(index)}@example.com`;
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: args.organizationId,
        name: `利用状態変更${String(index)}`,
        email,
        emailNormalized: email,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      if (args.state === "overLimit") {
        await ctx.db.insert("staffs", {
          shopId: args.shopId,
          organizationId: args.organizationId,
          organizationPersonId: personId,
          name: `利用状態変更${String(index)}`,
          email,
          emailNormalized: email,
          isDeleted: false,
        });
      }
    }
  });
}

async function readLineLinkingBusinessState(t: TestConvex<typeof schema>, tokenDocId: Id<"lineLinkTokens">) {
  return await t.run(async (ctx) => ({
    token: await ctx.db.get(tokenDocId),
    accounts: await ctx.db.query("staffLineAccounts").collect(),
    providers: await ctx.db.query("lineProviderUsers").collect(),
    links: await ctx.db.query("organizationPersonLineLinks").collect(),
    fanoutJobs: await ctx.db.query("lineFriendshipFanoutJobs").collect(),
    analytics: await ctx.db.query("analyticsSourceEvents").collect(),
    notificationOutbox: await ctx.db.query("notificationOutbox").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

async function seedFriendshipFanoutJob(
  t: TestConvex<typeof schema>,
  args: { suffix: string; following: boolean; linkCount: number; firstPersonStaffCount?: number },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const providerId = await ctx.db.insert("lineProviderUsers", {
      lineUserId: `U_fanout_${args.suffix}`,
      following: args.following,
      stateVersion: 2,
      friendshipObservedAt: now,
      friendshipObservationSource: "webhook",
      lastWebhookAt: now,
      lastWebhookEventId: `fanout-event-${args.suffix}`,
      lastWebhookEventTimestamp: now,
      isDeleted: false,
    });
    const staffIds: Id<"staffs">[] = [];
    for (let index = 0; index < args.linkCount; index += 1) {
      const seeded = await seedOrganizationManagerShop(ctx, {
        subject: `fanout_${args.suffix}_${index}`,
        email: `fanout_${args.suffix}_${index}@example.com`,
        shopName: `fanout店舗${index}`,
        plan: "pro",
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId: seeded.organizationId,
        name: `fanoutスタッフ${index}`,
        email: `fanout-staff-${args.suffix}-${index}@example.com`,
        emailNormalized: `fanout-staff-${args.suffix}-${index}@example.com`,
        status: "active",
        lineLinkGeneration: 1,
        createdAt: now,
        updatedAt: now,
      });
      const staffCount = index === 0 ? (args.firstPersonStaffCount ?? 1) : 1;
      for (let staffIndex = 0; staffIndex < staffCount; staffIndex += 1) {
        const shopId =
          staffIndex === 0
            ? seeded.shopId
            : await ctx.db.insert("shops", {
                organizationId: seeded.organizationId,
                operatingStatus: "active",
                name: `fanout店舗${index}-${staffIndex}`,
                submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
                regularClosedDays: [],
                isDeleted: false,
              });
        staffIds.push(
          await ctx.db.insert("staffs", {
            shopId,
            organizationId: seeded.organizationId,
            organizationPersonId: personId,
            name: `fanoutスタッフ${index}-${staffIndex}`,
            email: `fanout-staff-${args.suffix}-${index}@example.com`,
            isDeleted: false,
          }),
        );
      }
      await ctx.db.insert("organizationPersonLineLinks", {
        organizationId: seeded.organizationId,
        organizationPersonId: personId,
        lineProviderUserId: providerId,
        generation: 1,
        linkedAt: now,
        isDeleted: false,
      });
    }
    const jobId = await ctx.db.insert("lineFriendshipFanoutJobs", {
      lineProviderUserId: providerId,
      stateVersion: 2,
      following: args.following,
      status: "queued",
      version: 1,
      attemptCount: 0,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000,
    });
    return { providerId, jobId, staffIds };
  });
}

async function claimFriendshipFanoutJob(t: TestConvex<typeof schema>, jobId: Id<"lineFriendshipFanoutJobs">) {
  await t.mutation(internal.line.mutations.kickFriendshipFanoutJob, { jobId });
  const job = await t.run(async (ctx) => await ctx.db.get(jobId));
  if (job?.status !== "processing" || !job.leaseId) throw new Error("fanout job was not claimed");
  return { leaseId: job.leaseId, expectedVersion: job.version };
}

describe("line/mutations", () => {
  describe("generateLinkToken", () => {
    it("未認証なら拒否", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await expect(t.mutation(api.line.mutations.generateLinkToken, { shopId, staffId })).rejects.toThrow();
      expect(await t.run(async (ctx) => await ctx.db.query("lineLinkTokens").collect())).toEqual([]);
    });

    it("認証済みシフト担当者は自店舗スタッフにトークンを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);

      const { token } = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.line.mutations.generateLinkToken, { shopId, staffId });
      expect(token).toMatch(/^[0-9a-f-]{36}$/);

      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.staffId).toBe(staffId);
      expect(link?.expiresAt).toBeGreaterThan(Date.now());
    });

    it("他店舗スタッフへのトークン発行は拒否（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const otherShopId = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: otherShopId,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.generateLinkToken, {
          shopId,
          staffId: otherStaffId,
        }),
      ).rejects.toThrow("Not found");
      expect(await t.run(async (ctx) => await ctx.db.query("lineLinkTokens").collect())).toEqual([]);
    });

    it("削除済みスタッフへのトークン発行を拒否し、既存トークンも変更しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await seedLineLinkToken(t, { shopId, staffId, token: "deleted-staff-existing-token" });
      await t.run(async (ctx) => await ctx.db.patch(staffId, { isDeleted: true }));
      const before = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect(),
      );

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.generateLinkToken, { shopId, staffId }),
      ).rejects.toThrow("Not found");

      const after = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect(),
      );
      expect(after).toEqual(before);
    });

    it("複数店舗マネージャーは shopId 指定でその店舗のスタッフにトークンを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { shopAId, shopBId, staffBId } = await t.run(async (ctx) => {
        const { userId, shopId: shopAId } = await seedManagerShop(ctx, {
          subject: "user_mgr",
          email: "mgr@example.com",
          shopName: "店舗A",
        });
        const shopBId = await seedShop(ctx, "店舗B");
        await seedLegacyShopMembership(ctx, { userId, shopId: shopBId });
        const staffBId = await ctx.db.insert("staffs", {
          shopId: shopBId,
          name: "B店スタッフ",
          email: "b@example.com",
          isDeleted: false,
        });
        return { shopAId, shopBId, staffBId };
      });

      // 店舗Aを明示した場合、店舗Bスタッフは店舗境界の外なので参照できない
      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.line.mutations.generateLinkToken, { shopId: shopAId, staffId: staffBId }),
      ).rejects.toThrow("Not found");

      const { token } = await t
        .withIdentity({ subject: "user_mgr" })
        .mutation(api.line.mutations.generateLinkToken, { shopId: shopBId, staffId: staffBId });
      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.staffId).toBe(staffBId);
      expect(link?.shopId).toBe(shopBId);
    });

    it("未所属の shopId 指定は拒否（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      const foreignShopId = await t.run(async (ctx) => await seedShop(ctx, "無関係店舗"));

      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.line.mutations.generateLinkToken, { staffId, shopId: foreignShopId }),
      ).rejects.toThrow("Not found");
      expect(await t.run(async (ctx) => await ctx.db.query("lineLinkTokens").collect())).toEqual([]);
    });
  });

  describe("createLinkTokenInternal", () => {
    it("LINE連携トークンを発行できる", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);

      const { token } = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });

      expect(token).toMatch(/^[0-9a-f-]{36}$/);
      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.staffId).toBe(staffId);
      expect(link?.shopId).toBe(shopId);
      expect(link?.expiresAt).toBeGreaterThan(Date.now());
    });

    it("managerとinternalの両発行入口で旧tokenを失効し、最新tokenだけを一度利用できる", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const manager = t.withIdentity({ subject: "user_mgr" });

      const first = await manager.mutation(api.line.mutations.generateLinkToken, { shopId, staffId });
      const second = await manager.mutation(api.line.mutations.generateLinkToken, { shopId, staffId });
      const afterManagerIssue = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect(),
      );
      expect(afterManagerIssue.find((token) => token.token === first.token)?.revokedAt).toEqual(expect.any(Number));
      expect(
        afterManagerIssue.filter((token) => !token.revokedAt && !token.usedAt && token.expiresAt >= Date.now()),
      ).toHaveLength(1);
      expect(afterManagerIssue.find((token) => token.token === second.token)?.revokedAt).toBeUndefined();

      const latest = await t.mutation(internal.line.mutations.createLinkTokenInternal, { staffId, shopId });
      const afterInternalIssue = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .collect(),
      );
      expect(afterInternalIssue.find((token) => token.token === second.token)?.revokedAt).toEqual(expect.any(Number));
      const activeUnused = afterInternalIssue.filter(
        (token) => !token.revokedAt && !token.usedAt && token.expiresAt >= Date.now(),
      );
      expect(activeUnused).toHaveLength(1);
      expect(activeUnused[0]?.token).toBe(latest.token);

      for (const revokedToken of [first.token, second.token]) {
        await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: revokedToken })).resolves.toEqual({
          status: "expired",
        });
      }
      const validation = await t.mutation(internal.line.mutations.validateLinkToken, { state: latest.token });
      expect(validation.status).toBe("ok");
      if (validation.status !== "ok") throw new Error("latest LINE token was not valid");
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId: validation.tokenDocId,
          lineUserId: "U_newest_only",
          lineFollowing: false,
        }),
      ).resolves.toEqual({ status: "ok" });
      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: latest.token })).resolves.toEqual({
        status: "expired",
      });
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId: validation.tokenDocId,
          lineUserId: "U_newest_only",
          lineFollowing: false,
        }),
      ).resolves.toEqual({ status: "expired" });
    });
  });

  describe("validateLinkToken", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("有効トークンは ok を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token, tokenDocId } = await seedLineLinkToken(t, { staffId, shopId });

      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });
      expect(result.status).toBe("ok");
      if (result.status !== "ok") return;
      expect(result.staffId).toBe(staffId);
      expect(result.shopId).toBe(shopId);
      expect(result.tokenDocId).toBe(tokenDocId);
    });

    it.each(["overLimit", "unknown"] as const)(
      "token発行後に組織の利用状態が%sへ変わった場合はexpiredを返し、LINE連携の副作用を残さない",
      async (state) => {
        const t = convexTest(schema, modules);
        const target = await issueOrganizationLineLinkToken(t, `validate_after_issue_${state}`);
        await blockOrganizationBusinessWritesByUsage(t, {
          organizationId: target.organizationId,
          shopId: target.shopId,
          suffix: `validate-after-issue-${state}`,
          state,
        });
        const before = await readLineLinkingBusinessState(t, target.tokenDocId);

        await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: target.token })).resolves.toEqual({
          status: "expired",
        });

        expect(await readLineLinkingBusinessState(t, target.tokenDocId)).toEqual(before);
      },
    );

    it("使用済みトークンは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, { staffId, shopId, usedAt: Date.now() - 1000 });

      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });

      expect(result.status).toBe("expired");
    });

    it("期限切れトークンは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      await seedLineLinkToken(t, { staffId, shopId, token: "expired-token", expiresAt: Date.now() - 1000 });

      const r = await t.mutation(internal.line.mutations.validateLinkToken, { state: "expired-token" });
      expect(r.status).toBe("expired");
    });

    it("存在しない state は expired", async () => {
      const t = convexTest(schema, modules);
      const r = await t.mutation(internal.line.mutations.validateLinkToken, { state: "nonexistent" });
      expect(r.status).toBe("expired");
    });

    it("同一stateが異なるスタッフに重複している場合は対象情報を返さず連携を変更しない", async () => {
      const t = convexTest(schema, modules);
      const first = await setupShop(t);
      const second = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, "重複token対象店舗");
        const staffId = await ctx.db.insert("staffs", {
          shopId,
          name: "重複token対象スタッフ",
          email: "duplicate-line@example.com",
          isDeleted: false,
        });
        return { shopId, staffId };
      });
      const token = "duplicate-target-line-token";
      await seedLineLinkToken(t, { ...first, token });
      await seedLineLinkToken(t, { ...second, token });

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });

      const state = await t.run(async (ctx) => ({
        links: await ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .collect(),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.links).toHaveLength(2);
      expect(new Set(state.links.map((link) => link.staffId))).toEqual(new Set([first.staffId, second.staffId]));
      expect(state.links.every((link) => link.usedAt === undefined)).toBe(true);
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("tokenの店舗とスタッフ所属店舗が一致しない場合は expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      const otherShopId = await t.run(async (ctx) => seedShop(ctx, "別店舗"));
      const { token } = await seedLineLinkToken(t, {
        staffId,
        shopId: otherShopId,
        token: "cross-shop-line-token",
      });

      const result = await t.mutation(internal.line.mutations.validateLinkToken, { state: token });

      expect(result).toEqual({ status: "expired" });
    });

    it("削除済みスタッフのtokenは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "deleted-staff-line-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(staffId, { isDeleted: true }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });
    });

    it("削除済み店舗のtokenは expired を返す", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "deleted-shop-line-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { isDeleted: true }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });
    });

    it("発行後に事業者店舗がplanSuspendedになったtokenは expired を返し副作用を起こさない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupOrganizationShop(t, "line_validate_suspended");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "suspended-shop-line-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { operatingStatus: "planSuspended" }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("発行後に事業者がrestrictedになったtokenは expired を返し副作用を起こさない", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, personId, staffId, shopId } = await setupOrganizationShop(t, "line_validate_restricted");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "restricted-organization-line-token",
      });
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!billingState) throw new Error("missing billing state");
        const now = Date.now();
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [personId],
            previousActiveShopIds: [shopId],
            restrictedAt: now,
          },
          version: billingState.version + 1,
          updatedAt: now,
        });
      });

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("Widen前tokenは現在のcanonical scopeを一意に導出できる場合だけ互換受理する", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationShop(t, "old_token_compat");
      const token = "old-shape-canonical-token";
      const tokenDocId = await t.run(async (ctx) =>
        ctx.db.insert("lineLinkTokens", {
          staffId: target.staffId,
          shopId: target.shopId,
          token,
          expiresAt: Date.now() + 60_000,
        }),
      );

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "ok",
        staffId: target.staffId,
        shopId: target.shopId,
        tokenDocId,
        organizationId: target.organizationId,
        organizationPersonId: target.personId,
        lineLinkGenerationAtIssue: 0,
      });
    });

    it("canonical tokenのgenerationが現在人物とずれた場合はexpiredへfail closedする", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationShop(t, "stale_generation");
      const { token } = await seedLineLinkToken(t, {
        staffId: target.staffId,
        shopId: target.shopId,
        token: "stale-generation-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(target.personId, { lineLinkGeneration: 1 }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });
    });

    it("canonical snapshotが一部だけのtokenは旧shapeとみなさずexpiredへfail closedする", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationShop(t, "partial_snapshot");
      const token = "partial-canonical-snapshot-token";
      await t.run(async (ctx) => {
        await ctx.db.insert("lineLinkTokens", {
          staffId: target.staffId,
          shopId: target.shopId,
          organizationId: target.organizationId,
          token,
          expiresAt: Date.now() + 60_000,
        });
      });

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toEqual({
        status: "expired",
      });
    });

    it("存在する同じstateを6回検証するとtoken単位の二次rate limitが働く", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, { staffId, shopId, token: "same-valid-state-token" });
      const results = [];
      for (let index = 0; index < 6; index++) {
        results.push(await t.mutation(internal.line.mutations.validateLinkToken, { state: token }));
      }

      expect(results.slice(0, 5).every((result) => result.status === "ok")).toBe(true);
      expect(results[5]).toEqual({ status: "rate_limited" });
    });

    it("異なる無効state prefixは固定global budgetを共有するが、有効stateを停止させない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token } = await seedLineLinkToken(t, { staffId, shopId, token: "recovery-valid-state-token" });
      const before = await t.run(async (ctx) => ({
        tokens: await ctx.db.query("lineLinkTokens").collect(),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));

      for (let attempt = 0; attempt < LINE_LINK_REDEEM_GLOBAL_LIMIT; attempt += 1) {
        const state = `${String(attempt).padStart(8, "0")}-invalid-state`;
        await expect(t.mutation(internal.line.mutations.validateLinkToken, { state })).resolves.toEqual({
          status: "expired",
        });
      }
      await expect(
        t.mutation(internal.line.mutations.validateLinkToken, { state: "overflow-invalid-state" }),
      ).resolves.toEqual({ status: "rate_limited" });

      const after = await t.run(async (ctx) => ({
        tokens: await ctx.db.query("lineLinkTokens").collect(),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        outbox: await ctx.db.query("notificationOutbox").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
        globalRows: await ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "lineLinkRedeemGlobal"))
          .collect(),
        tokenRows: await ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "lineLinkRedeem"))
          .collect(),
      }));
      expect({
        tokens: after.tokens,
        accounts: after.accounts,
        outbox: after.outbox,
        scheduled: after.scheduled,
      }).toEqual(before);
      expect(after.globalRows).toHaveLength(1);
      expect(after.globalRows[0]?.key).toBeUndefined();
      expect(after.tokenRows).toEqual([]);

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
        staffId,
      });
      const tokenRows = await t.run(async (ctx) =>
        ctx.db
          .query("rateLimits")
          .withIndex("name", (q) => q.eq("name", "lineLinkRedeem"))
          .collect(),
      );
      expect(tokenRows).toHaveLength(1);
    });
  });

  describe("finalizeLinking", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("有効な tokenDocId なら staffLineAccounts にLINE連携情報が保存され usedAt が記録される", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { token, tokenDocId } = await seedLineLinkToken(t, { staffId, shopId });

      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId,
        tokenDocId,
        lineUserId: "U_abcdef",
        lineFollowing: true,
      });

      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(account?.lineUserId).toBe("U_abcdef");
      expect(account?.following).toBe(true);
      expect(account?.linkedAt).toBeGreaterThan(0);

      const link = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .first(),
      );
      expect(link?.usedAt).toBeGreaterThan(0);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "legal/actions:sendStaffConsentLine" && job.args[0]?.staffId === staffId),
      ).toBe(true);
    });

    it.each(["overLimit", "unknown"] as const)(
      "token検証後に組織の利用状態が%sへ変わった場合は永続化直前に拒否し、LINE連携の副作用を残さない",
      async (state) => {
        const t = convexTest(schema, modules);
        const target = await issueOrganizationLineLinkToken(t, `finalize_after_validate_${state}`);
        await expect(
          t.mutation(internal.line.mutations.validateLinkToken, { state: target.token }),
        ).resolves.toMatchObject({ status: "ok" });
        await blockOrganizationBusinessWritesByUsage(t, {
          organizationId: target.organizationId,
          shopId: target.shopId,
          suffix: `finalize-after-validate-${state}`,
          state,
        });
        const before = await readLineLinkingBusinessState(t, target.tokenDocId);

        await expect(
          t.mutation(internal.line.mutations.finalizeLinking, {
            staffId: target.staffId,
            tokenDocId: target.tokenDocId,
            lineUserId: `U_finalize_after_validate_${state}`,
            lineFollowing: true,
          }),
        ).resolves.toEqual({ status: "expired" });

        expect(await readLineLinkingBusinessState(t, target.tokenDocId)).toEqual(before);
      },
    );

    it("事業者移行中で課金状態が未作成でもactive店舗ならvalidateと連携を継続できる", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, staffId, shopId } = await setupOrganizationShop(t, "line_widen_without_billing");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "widen-without-billing-line-token",
      });
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!billingState) throw new Error("missing billing state");
        await ctx.db.delete(billingState._id);
      });

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
      });
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_widen_without_billing",
          lineFollowing: false,
        }),
      ).resolves.toEqual({ status: "ok" });

      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .unique(),
      );
      expect(account?.lineUserId).toBe("U_widen_without_billing");
    });

    it("使用済み tokenDocId は expired を返し、スタッフを上書きしない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "used-line-link-token",
        usedAt: Date.now() - 1000,
      });
      await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, { staffId, shopId, lineUserId: "U_first", following: true });
      });

      const retry = await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId,
        tokenDocId,
        lineUserId: "U_second",
        lineFollowing: true,
      });

      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(retry.status).toBe("expired");
      expect(account?.lineUserId).toBe("U_first");
    });

    it("tokenの店舗とスタッフ所属店舗が一致しない場合は連携しない", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      const otherShopId = await t.run(async (ctx) => seedShop(ctx, "別店舗"));
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId: otherShopId,
        token: "cross-shop-finalize-token",
      });

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_cross_shop",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });
      await expect(
        t.run(async (ctx) =>
          ctx.db
            .query("staffLineAccounts")
            .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
            .first(),
        ),
      ).resolves.toBeNull();
    });

    it("token検証後に店舗が削除された場合は連携しない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupShop(t);
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "deleted-shop-finalize-token",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { isDeleted: true }));

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_deleted_shop",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });
      await expect(
        t.run(async (ctx) =>
          ctx.db
            .query("staffLineAccounts")
            .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
            .first(),
        ),
      ).resolves.toBeNull();
    });

    it("token検証後に事業者店舗がplanSuspendedになった場合は連携もscheduleも行わない", async () => {
      const t = convexTest(schema, modules);
      const { staffId, shopId } = await setupOrganizationShop(t, "line_finalize_suspended");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "suspended-shop-finalize-token",
      });
      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
      });
      await t.run(async (ctx) => await ctx.db.patch(shopId, { operatingStatus: "planSuspended" }));

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_suspended_shop",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("token検証後に事業者がrestrictedになった場合は連携もscheduleも行わない", async () => {
      const t = convexTest(schema, modules);
      const { organizationId, personId, staffId, shopId } = await setupOrganizationShop(t, "line_finalize_restricted");
      const { token, tokenDocId } = await seedLineLinkToken(t, {
        staffId,
        shopId,
        token: "restricted-organization-finalize-token",
      });
      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: token })).resolves.toMatchObject({
        status: "ok",
      });
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
          .unique();
        if (!billingState) throw new Error("missing billing state");
        const now = Date.now();
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [personId],
            previousActiveShopIds: [shopId],
            restrictedAt: now,
          },
          version: billingState.version + 1,
          updatedAt: now,
        });
      });

      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId,
          tokenDocId,
          lineUserId: "U_restricted_organization",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });

      const state = await t.run(async (ctx) => ({
        link: await ctx.db.get(tokenDocId),
        accounts: await ctx.db.query("staffLineAccounts").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.link?.usedAt).toBeUndefined();
      expect(state.accounts).toEqual([]);
      expect(state.scheduled).toEqual([]);
    });

    it("既に他スタッフに紐づく lineUserId は奪う", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const otherStaffId = await ctx.db.insert("staffs", {
          shopId,
          name: "別人",
          email: "other@example.com",
          isDeleted: false,
        });
        await seedStaffLineAccount(ctx, { staffId: otherStaffId, shopId, lineUserId: "U_dup", following: true });
        return otherStaffId;
      });
      const { tokenDocId } = await seedLineLinkToken(t, { staffId, shopId, token: "relink-token" });

      await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId,
        tokenDocId,
        lineUserId: "U_dup",
        lineFollowing: true,
      });

      const accounts = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_dup").eq("isDeleted", false))
          .collect(),
      );
      expect(accounts).toHaveLength(1);
      expect(accounts[0].staffId).toBe(staffId);
      const oldManager = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", otherStaffId))
          .first(),
      );
      expect(oldManager?.isDeleted).toBe(true);
    });

    it("別店舗で同じ lineUserId を連携しても、既存店舗のアカウントは残る（多店舗連携）", async () => {
      const t = convexTest(schema, modules);
      const { shopId: shopAId, staffId: staffAId } = await setupShop(t);
      // 同一人物が店舗Aで既にLINE連携済み
      await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, { staffId: staffAId, shopId: shopAId, lineUserId: "U_multi", following: true });
      });
      // 店舗Bの別 staff レコード（同一人物）
      const { shopBId, staffBId } = await t.run(async (ctx) => {
        const shopBId = await seedShop(ctx, "店舗B");
        const staffBId = await ctx.db.insert("staffs", {
          shopId: shopBId,
          name: "鈴木太郎",
          email: "suzuki@example.com",
          isDeleted: false,
        });
        return { shopBId, staffBId };
      });
      const { tokenDocId } = await seedLineLinkToken(t, {
        staffId: staffBId,
        shopId: shopBId,
        token: "shopB-token",
      });

      const result = await t.mutation(internal.line.mutations.finalizeLinking, {
        staffId: staffBId,
        tokenDocId,
        lineUserId: "U_multi",
        lineFollowing: true,
      });
      expect(result.status).toBe("ok");

      const accounts = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_multi").eq("isDeleted", false))
          .collect(),
      );
      expect(accounts).toHaveLength(2);
      expect(accounts.map((a) => a.staffId).sort()).toEqual([staffAId, staffBId].sort());
    });
  });

  describe("organization person共通LINE", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("同じorganization personのtokenを店舗間でrotationし、連携を全所属店舗へ共有する", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationPersonTwoShops(t, "canonical_shared");

      const first = await t
        .withIdentity({ subject: "canonical_shared" })
        .mutation(api.line.mutations.generateLinkToken, {
          shopId: target.shopId,
          staffId: target.staffAId,
        });
      const second = await t
        .withIdentity({ subject: "canonical_shared" })
        .mutation(api.line.mutations.generateLinkToken, {
          shopId: target.shopBId,
          staffId: target.staffBId,
        });

      const tokens = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_organizationPersonId_and_expiresAt", (q) => q.eq("organizationPersonId", target.personId))
          .collect(),
      );
      expect(tokens.map((token) => ({ token: token.token, revoked: token.revokedAt !== undefined }))).toEqual([
        { token: first.token, revoked: true },
        { token: second.token, revoked: false },
      ]);
      expect(tokens.every((token) => token.organizationId === target.organizationId)).toBe(true);
      expect(tokens.every((token) => token.lineLinkGenerationAtIssue === 0)).toBe(true);

      const secondToken = tokens.find((token) => token.token === second.token);
      if (!secondToken) throw new Error("second LINE token was not found");
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId: target.staffBId,
          tokenDocId: secondToken._id,
          lineUserId: "U_shared_person",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "ok" });

      const state = await t.run(async (ctx) => ({
        person: await ctx.db.get(target.personId),
        providers: await ctx.db
          .query("lineProviderUsers")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_shared_person").eq("isDeleted", false))
          .collect(),
        links: await ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
            q.eq("organizationPersonId", target.personId).eq("isDeleted", false),
          )
          .collect(),
        accounts: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_shared_person").eq("isDeleted", false))
          .collect(),
      }));
      expect(state.person?.lineLinkGeneration).toBe(1);
      expect(state.providers).toHaveLength(1);
      expect(state.links.map((link) => ({ personId: link.organizationPersonId, generation: link.generation }))).toEqual(
        [{ personId: target.personId, generation: 1 }],
      );
      expect(state.accounts.map((account) => account.staffId).sort()).toEqual(
        [target.staffAId, target.staffBId].sort(),
      );
    });

    it("operatingStatus未定義のWiden前shopでもpublic発行からcanonical確定・readまで継続する", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationShop(t, "widen_shop_status");
      await t.run(async (ctx) => await ctx.db.patch(target.shopId, { operatingStatus: undefined }));

      const { token } = await t
        .withIdentity({ subject: "widen_shop_status" })
        .mutation(api.line.mutations.generateLinkToken, { shopId: target.shopId, staffId: target.staffId });
      const tokenDoc = await t.run(async (ctx) =>
        ctx.db
          .query("lineLinkTokens")
          .withIndex("by_token", (q) => q.eq("token", token))
          .unique(),
      );
      if (!tokenDoc) throw new Error("LINE token was not persisted");
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId: target.staffId,
          tokenDocId: tokenDoc._id,
          lineUserId: "U_widen_shop_status",
          lineFollowing: true,
          lineFriendshipObservedAt: Date.now(),
        }),
      ).resolves.toEqual({ status: "ok", following: true });
      const recipient = await t.run(async (ctx) =>
        resolveStaffLineRecipient(ctx, { staffId: target.staffId, shopId: target.shopId }),
      );
      expect(recipient).toMatchObject({
        authority: "canonical",
        lineUserId: "U_widen_shop_status",
        following: true,
      });
    });

    it("別organizationは同じprovider userを明示連携後だけ共有する", async () => {
      const t = convexTest(schema, modules);
      const first = await setupOrganizationPersonTwoShops(t, "canonical_org_a");
      const second = await setupOrganizationPersonTwoShops(t, "canonical_org_b");

      await finalizeForStaff(t, {
        subject: "canonical_org_a",
        shopId: first.shopId,
        staffId: first.staffAId,
        lineUserId: "U_cross_organization",
      });
      const beforeSecondLink = await t.run(async (ctx) =>
        ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationId_and_isDeleted", (q) =>
            q.eq("organizationId", second.organizationId).eq("isDeleted", false),
          )
          .collect(),
      );
      expect(beforeSecondLink).toEqual([]);

      await finalizeForStaff(t, {
        subject: "canonical_org_b",
        shopId: second.shopId,
        staffId: second.staffAId,
        lineUserId: "U_cross_organization",
      });
      const state = await t.run(async (ctx) => ({
        providers: await ctx.db
          .query("lineProviderUsers")
          .withIndex("by_lineUserId_and_isDeleted", (q) =>
            q.eq("lineUserId", "U_cross_organization").eq("isDeleted", false),
          )
          .collect(),
        links: await ctx.db.query("organizationPersonLineLinks").collect(),
      }));
      expect(state.providers).toHaveLength(1);
      expect(
        state.links
          .filter((link) => !link.isDeleted)
          .map((link) => ({ organizationId: link.organizationId, providerId: link.lineProviderUserId }))
          .sort((a, b) => a.organizationId.localeCompare(b.organizationId)),
      ).toEqual(
        [first.organizationId, second.organizationId]
          .sort()
          .map((organizationId) => ({ organizationId, providerId: state.providers[0]._id })),
      );
    });

    it("OAuthでprovider状態が変わると明示連携済みの他organizationにもfanoutする", async () => {
      const t = convexTest(schema, modules);
      const first = await setupOrganizationPersonTwoShops(t, "oauth_fanout_a");
      const second = await setupOrganizationPersonTwoShops(t, "oauth_fanout_b");
      const seeded = await t.run(async (ctx) => {
        const observedAt = Date.now() - 1;
        const providerId = await ctx.db.insert("lineProviderUsers", {
          lineUserId: "U_oauth_cross_organization",
          following: false,
          stateVersion: 1,
          friendshipObservedAt: observedAt,
          friendshipObservationSource: "webhook",
          lastWebhookAt: observedAt,
          lastWebhookEventId: "prior-unfollow",
          lastWebhookEventTimestamp: observedAt,
          isDeleted: false,
        });
        const links = [];
        for (const target of [first, second]) {
          await ctx.db.patch(target.personId, { lineLinkGeneration: 1, updatedAt: observedAt });
          links.push(
            await ctx.db.insert("organizationPersonLineLinks", {
              organizationId: target.organizationId,
              organizationPersonId: target.personId,
              lineProviderUserId: providerId,
              generation: 1,
              linkedAt: observedAt,
              isDeleted: false,
            }),
          );
        }
        return { providerId, links };
      });

      await finalizeForStaff(t, {
        subject: "oauth_fanout_a",
        shopId: first.shopId,
        staffId: first.staffAId,
        lineUserId: "U_oauth_cross_organization",
        following: true,
      });
      const job = await t.run(async (ctx) =>
        ctx.db
          .query("lineFriendshipFanoutJobs")
          .withIndex("by_lineProviderUserId_and_stateVersion", (q) =>
            q.eq("lineProviderUserId", seeded.providerId).eq("stateVersion", 2),
          )
          .unique(),
      );
      expect(job).toMatchObject({ following: true, status: "queued" });
      if (!job) throw new Error("OAuth state change did not create a fanout job");

      const claim = await claimFriendshipFanoutJob(t, job._id);
      await expect(
        t.mutation(internal.line.mutations.processFriendshipFanoutJob, { jobId: job._id, ...claim }),
      ).resolves.toEqual({ status: "completed" });
      const state = await t.run(async (ctx) => ({
        provider: await ctx.db.get(seeded.providerId),
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.provider).toMatchObject({ following: true, stateVersion: 2 });
      const fanoutAccounts = state.analytics
        .filter((event) => event.eventKey.startsWith(`lineAccountBatch:fanout:${job._id}:2:`))
        .flatMap((event) => (event.payload.kind === "lineAccountBatch" ? event.payload.accounts : []));
      expect(fanoutAccounts.map((account) => account.staffId)).toEqual(
        expect.arrayContaining([first.staffAId, first.staffBId, second.staffAId, second.staffBId]),
      );
      expect(
        state.scheduled.filter(
          (scheduled) =>
            scheduled.name === "legal/actions:sendStaffConsentLine" ||
            scheduled.name === "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
        ),
      ).toHaveLength(8);
    });

    it("Friendship取得後の新Webhookをstale OAuth確定で巻き戻さずeffective状態を返す", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationShop(t, "oauth_webhook_observation_race");
      const observationAt = Date.now();
      const seeded = await t.run(async (ctx) => {
        const providerId = await ctx.db.insert("lineProviderUsers", {
          lineUserId: "U_oauth_webhook_observation_race",
          following: false,
          stateVersion: 1,
          friendshipObservedAt: observationAt - 1,
          friendshipObservationSource: "oauth",
          isDeleted: false,
        });
        await ctx.db.patch(target.personId, { lineLinkGeneration: 1, updatedAt: observationAt - 1 });
        const linkId = await ctx.db.insert("organizationPersonLineLinks", {
          organizationId: target.organizationId,
          organizationPersonId: target.personId,
          lineProviderUserId: providerId,
          generation: 1,
          linkedAt: observationAt - 1,
          isDeleted: false,
        });
        await seedStaffLineAccount(ctx, {
          staffId: target.staffId,
          shopId: target.shopId,
          lineUserId: "U_oauth_webhook_observation_race",
          following: false,
        });
        const tokenId = await ctx.db.insert("lineLinkTokens", {
          staffId: target.staffId,
          shopId: target.shopId,
          organizationId: target.organizationId,
          organizationPersonId: target.personId,
          lineLinkGenerationAtIssue: 1,
          token: "oauth-webhook-observation-race-token",
          expiresAt: observationAt + 60_000,
        });
        return { providerId, linkId, tokenId };
      });

      await t.mutation(internal.line.mutations.dispatchWebhookStateEvent, {
        event: {
          userId: "U_oauth_webhook_observation_race",
          following: true,
          webhookEventId: "follow-after-friendship-fetch",
          timestamp: observationAt + 1,
        },
      });
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId: target.staffId,
          tokenDocId: seeded.tokenId,
          lineUserId: "U_oauth_webhook_observation_race",
          lineFollowing: false,
          lineFriendshipObservedAt: observationAt,
        }),
      ).resolves.toEqual({ status: "ok", following: true });

      const state = await t.run(async (ctx) => ({
        provider: await ctx.db.get(seeded.providerId),
        link: await ctx.db.get(seeded.linkId),
        account: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId_and_isDeleted", (q) => q.eq("staffId", target.staffId).eq("isDeleted", false))
          .unique(),
      }));
      expect(state.provider).toMatchObject({
        following: true,
        stateVersion: 2,
        friendshipObservationSource: "webhook",
        lastWebhookEventId: "follow-after-friendship-fetch",
      });
      expect(state.link).toMatchObject({ generation: 2, isDeleted: false });
      expect(state.account).toMatchObject({ following: true });
    });

    it("canonical link上限未満なら51件のlegacy projectionがあってもOAuthとWebhookを処理する", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationShop(t, "many_legacy_projections");
      await t.run(async (ctx) => {
        for (let index = 0; index < 51; index += 1) {
          const shopId = await ctx.db.insert("shops", {
            name: `legacy projection店舗${index}`,
            submissionPattern: { kind: "time", startTime: "09:00", endTime: "18:00" },
            regularClosedDays: [],
            isDeleted: false,
          });
          const staffId = await ctx.db.insert("staffs", {
            shopId,
            name: `legacy projectionスタッフ${index}`,
            email: `legacy-projection-${index}@example.com`,
            isDeleted: false,
          });
          await seedStaffLineAccount(ctx, {
            staffId,
            shopId,
            lineUserId: "U_many_legacy_projections",
            following: false,
          });
        }
      });

      await expect(
        finalizeForStaff(t, {
          subject: "many_legacy_projections",
          shopId: target.shopId,
          staffId: target.staffId,
          lineUserId: "U_many_legacy_projections",
          following: true,
        }),
      ).resolves.toEqual({ status: "ok" });
      await expect(
        t.mutation(internal.line.mutations.dispatchWebhookStateEvent, {
          event: {
            userId: "U_many_legacy_projections",
            following: false,
            webhookEventId: "many-legacy-unfollow",
            timestamp: Date.now() + 1,
          },
        }),
      ).resolves.toBeNull();
      const state = await t.run(async (ctx) => ({
        links: await ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
            q.eq("organizationPersonId", target.personId).eq("isDeleted", false),
          )
          .collect(),
        accounts: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) =>
            q.eq("lineUserId", "U_many_legacy_projections").eq("isDeleted", false),
          )
          .collect(),
      }));
      expect(state.links).toHaveLength(1);
      expect(state.accounts).toHaveLength(52);
      expect(state.accounts.every((account) => !account.following)).toBe(true);
    });

    it("同じorganizationの別personは既存LINE IDを奪えない", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationPersonTwoShops(t, "canonical_conflict");
      await finalizeForStaff(t, {
        subject: "canonical_conflict",
        shopId: target.shopId,
        staffId: target.staffAId,
        lineUserId: "U_owned_in_organization",
      });
      const other = await t.run(async (ctx) => {
        const now = Date.now();
        const personId = await ctx.db.insert("organizationPeople", {
          organizationId: target.organizationId,
          name: "別人物",
          email: "other-person@example.com",
          emailNormalized: "other-person@example.com",
          status: "active",
          createdAt: now,
          updatedAt: now,
        });
        const staffId = await ctx.db.insert("staffs", {
          shopId: target.shopId,
          organizationId: target.organizationId,
          organizationPersonId: personId,
          name: "別人物",
          email: "other-person@example.com",
          isDeleted: false,
        });
        return { personId, staffId };
      });

      await expect(
        finalizeForStaff(t, {
          subject: "canonical_conflict",
          shopId: target.shopId,
          staffId: other.staffId,
          lineUserId: "U_owned_in_organization",
        }),
      ).rejects.toThrowError("LINE連携を完了できませんでした。");
      const links = await t.run(async (ctx) =>
        ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationId_and_isDeleted", (q) =>
            q.eq("organizationId", target.organizationId).eq("isDeleted", false),
          )
          .collect(),
      );
      expect(links.map((link) => link.organizationPersonId)).toEqual([target.personId]);
    });

    it("unfollowはprovider stateと全legacy projectionを更新し、organization linkを残す", async () => {
      const t = convexTest(schema, modules);
      const first = await setupOrganizationPersonTwoShops(t, "canonical_block_a");
      const second = await setupOrganizationPersonTwoShops(t, "canonical_block_b");
      for (const target of [first, second]) {
        await finalizeForStaff(t, {
          subject: target === first ? "canonical_block_a" : "canonical_block_b",
          shopId: target.shopId,
          staffId: target.staffAId,
          lineUserId: "U_block_shared",
        });
      }

      await t.mutation(internal.line.mutations.dispatchWebhookStateEvent, {
        event: {
          userId: "U_block_shared",
          following: false,
          webhookEventId: "unfollow-canonical-shared",
          timestamp: Date.now() + 1,
        },
      });
      const state = await t.run(async (ctx) => ({
        provider: await ctx.db
          .query("lineProviderUsers")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_block_shared").eq("isDeleted", false))
          .unique(),
        links: await ctx.db.query("organizationPersonLineLinks").collect(),
        accounts: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_block_shared").eq("isDeleted", false))
          .collect(),
      }));
      expect(state.provider).toMatchObject({ following: false, stateVersion: 2 });
      expect(state.links.filter((link) => !link.isDeleted)).toHaveLength(2);
      expect(state.accounts).toHaveLength(4);
      expect(state.accounts.every((account) => !account.following)).toBe(true);
    });

    it("管理者の明示解除は全店舗を未連携にし、監査を一度だけ残す", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationPersonTwoShops(t, "canonical_disconnect");
      await finalizeForStaff(t, {
        subject: "canonical_disconnect",
        shopId: target.shopId,
        staffId: target.staffAId,
        lineUserId: "U_disconnect",
      });
      const request = {
        shopId: target.shopId,
        organizationPersonId: target.personId,
        requestId: "canonical-disconnect-request",
      };

      await expect(
        t
          .withIdentity({ subject: "canonical_disconnect" })
          .mutation(api.line.mutations.disconnectOrganizationPersonLine, request),
      ).resolves.toEqual({ changed: true });
      await expect(
        t
          .withIdentity({ subject: "canonical_disconnect" })
          .mutation(api.line.mutations.disconnectOrganizationPersonLine, request),
      ).resolves.toEqual({ changed: false });

      const state = await t.run(async (ctx) => ({
        person: await ctx.db.get(target.personId),
        provider: await ctx.db
          .query("lineProviderUsers")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_disconnect").eq("isDeleted", false))
          .first(),
        links: await ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
            q.eq("organizationPersonId", target.personId).eq("isDeleted", false),
          )
          .collect(),
        accounts: await ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_disconnect").eq("isDeleted", false))
          .collect(),
        audits: await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", target.organizationId))
          .collect(),
      }));
      expect(state.person?.lineLinkGeneration).toBe(2);
      expect(state.provider).toBeNull();
      expect(state.links).toEqual([]);
      expect(state.accounts).toEqual([]);
      expect(state.audits.filter((audit) => audit.action === "organization.person_line_disconnected")).toHaveLength(1);
    });

    it("archived所属で発行した旧shape tokenも別active所属からの解除で失効する", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationPersonTwoShops(t, "archived_old_token_revoke");
      const oldToken = "archived-old-shape-token";
      const oldTokenId = await t.run(async (ctx) => {
        const tokenId = await ctx.db.insert("lineLinkTokens", {
          staffId: target.staffAId,
          shopId: target.shopId,
          token: oldToken,
          expiresAt: Date.now() + 60_000,
        });
        await ctx.db.patch(target.shopId, { operatingStatus: "archived" });
        return tokenId;
      });
      await finalizeForStaff(t, {
        subject: "archived_old_token_revoke",
        shopId: target.shopBId,
        staffId: target.staffBId,
        lineUserId: "U_archived_old_token_revoke",
      });

      await expect(
        t
          .withIdentity({ subject: "archived_old_token_revoke" })
          .mutation(api.line.mutations.disconnectOrganizationPersonLine, {
            shopId: target.shopBId,
            organizationPersonId: target.personId,
            requestId: "disconnect-archived-old-token",
          }),
      ).resolves.toEqual({ changed: true });
      await t.run(async (ctx) => await ctx.db.patch(target.shopId, { operatingStatus: "active" }));

      await expect(t.mutation(internal.line.mutations.validateLinkToken, { state: oldToken })).resolves.toEqual({
        status: "expired",
      });
      await expect(
        t.mutation(internal.line.mutations.finalizeLinking, {
          staffId: target.staffAId,
          tokenDocId: oldTokenId,
          lineUserId: "U_replay_after_reactivate",
          lineFollowing: true,
        }),
      ).resolves.toEqual({ status: "expired" });
    });

    it("restricted billingでもactive管理者は安全停止として明示解除できる", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationPersonTwoShops(t, "restricted_disconnect");
      await finalizeForStaff(t, {
        subject: "restricted_disconnect",
        shopId: target.shopId,
        staffId: target.staffAId,
        lineUserId: "U_restricted_disconnect",
      });
      await t.run(async (ctx) => {
        const billingState = await ctx.db
          .query("organizationBillingStates")
          .withIndex("by_organizationId", (q) => q.eq("organizationId", target.organizationId))
          .unique();
        if (!billingState) throw new Error("missing billing state");
        const now = Date.now();
        await ctx.db.patch(billingState._id, {
          state: {
            kind: "restricted",
            reason: "paymentGraceExpired",
            previousPlan: "pro",
            recoveryManagerPersonIds: [target.personId],
            previousActiveShopIds: [target.shopId, target.shopBId],
            restrictedAt: now,
          },
          version: billingState.version + 1,
          updatedAt: now,
        });
      });

      await expect(
        t
          .withIdentity({ subject: "restricted_disconnect" })
          .mutation(api.line.mutations.disconnectOrganizationPersonLine, {
            shopId: target.shopId,
            organizationPersonId: target.personId,
            requestId: "restricted-disconnect-request",
          }),
      ).resolves.toEqual({ changed: true });
    });

    it("readOnly管理者と別organizationからの明示解除をIDORとして拒否する", async () => {
      const t = convexTest(schema, modules);
      const target = await setupOrganizationPersonTwoShops(t, "disconnect_target");
      const foreign = await setupOrganizationPersonTwoShops(t, "disconnect_foreign");
      await finalizeForStaff(t, {
        subject: "disconnect_target",
        shopId: target.shopId,
        staffId: target.staffAId,
        lineUserId: "U_disconnect_guard",
      });

      await expect(
        t
          .withIdentity({ subject: "disconnect_foreign" })
          .mutation(api.line.mutations.disconnectOrganizationPersonLine, {
            shopId: foreign.shopId,
            organizationPersonId: target.personId,
            requestId: "foreign-disconnect-request",
          }),
      ).rejects.toThrow("Not found");
      await t.run(async (ctx) => await ctx.db.patch(target.memberId, { status: "readOnly" }));
      await expect(
        t.withIdentity({ subject: "disconnect_target" }).mutation(api.line.mutations.disconnectOrganizationPersonLine, {
          shopId: target.shopId,
          organizationPersonId: target.personId,
          requestId: "readonly-disconnect-request",
        }),
      ).rejects.toThrow("Not found");

      const state = await t.run(async (ctx) => ({
        links: await ctx.db
          .query("organizationPersonLineLinks")
          .withIndex("by_organizationPersonId_and_isDeleted", (q) =>
            q.eq("organizationPersonId", target.personId).eq("isDeleted", false),
          )
          .collect(),
        audits: await ctx.db
          .query("organizationAuditEvents")
          .withIndex("by_organizationId_and_occurredAt", (q) => q.eq("organizationId", target.organizationId))
          .collect(),
      }));
      expect(state.links).toHaveLength(1);
      expect(state.audits.filter((audit) => audit.action === "organization.person_line_disconnected")).toEqual([]);
    });
  });

  describe("friendship fanout job", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("followをcursorで再開し、全active membershipのanalyticsと通知を一度だけ予約する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await seedFriendshipFanoutJob(t, {
        suffix: "follow",
        following: true,
        linkCount: 6,
        firstPersonStaffCount: 2,
      });

      const firstClaim = await claimFriendshipFanoutJob(t, seeded.jobId);
      await expect(
        t.mutation(internal.line.mutations.processFriendshipFanoutJob, {
          jobId: seeded.jobId,
          ...firstClaim,
        }),
      ).resolves.toEqual({ status: "advanced" });
      const afterFirst = await t.run(async (ctx) => ({
        job: await ctx.db.get(seeded.jobId),
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(afterFirst.job).toMatchObject({ status: "queued", attemptCount: 0 });
      expect(afterFirst.job?.cursor).toEqual(expect.any(String));
      expect(afterFirst.analytics).toHaveLength(5);
      const firstNotificationCount = afterFirst.scheduled.filter(
        (job) =>
          job.name === "legal/actions:sendStaffConsentLine" ||
          job.name === "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
      ).length;
      expect(firstNotificationCount).toBe(12);

      // 同じlease/versionの再配送はcursorも副作用も進めない。
      await expect(
        t.mutation(internal.line.mutations.processFriendshipFanoutJob, {
          jobId: seeded.jobId,
          ...firstClaim,
        }),
      ).resolves.toEqual({ status: "ignored" });
      const afterReplay = await t.run(async (ctx) => ({
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(afterReplay.analytics).toHaveLength(5);
      expect(
        afterReplay.scheduled.filter(
          (job) =>
            job.name === "legal/actions:sendStaffConsentLine" ||
            job.name === "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
        ),
      ).toHaveLength(firstNotificationCount);

      const secondClaim = await claimFriendshipFanoutJob(t, seeded.jobId);
      await expect(
        t.mutation(internal.line.mutations.processFriendshipFanoutJob, {
          jobId: seeded.jobId,
          ...secondClaim,
        }),
      ).resolves.toEqual({ status: "completed" });
      const completed = await t.run(async (ctx) => ({
        job: await ctx.db.get(seeded.jobId),
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(completed.job).toMatchObject({ status: "completed", attemptCount: 0 });
      expect(completed.job?.leaseId).toBeUndefined();
      expect(completed.analytics).toHaveLength(6);
      expect(
        completed.analytics.flatMap((event) =>
          event.payload.kind === "lineAccountBatch" ? event.payload.accounts.map((account) => account.staffId) : [],
        ),
      ).toEqual(expect.arrayContaining(seeded.staffIds));
      expect(
        completed.scheduled.filter(
          (job) =>
            job.name === "legal/actions:sendStaffConsentLine" ||
            job.name === "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
        ),
      ).toHaveLength(seeded.staffIds.length * 2);
    });

    it("unfollowも全active membershipへanalyticsを残すが通知は予約しない", async () => {
      const t = convexTest(schema, modules);
      const seeded = await seedFriendshipFanoutJob(t, {
        suffix: "unfollow",
        following: false,
        linkCount: 2,
        firstPersonStaffCount: 2,
      });

      const claim = await claimFriendshipFanoutJob(t, seeded.jobId);
      await expect(
        t.mutation(internal.line.mutations.processFriendshipFanoutJob, { jobId: seeded.jobId, ...claim }),
      ).resolves.toEqual({ status: "completed" });
      const state = await t.run(async (ctx) => ({
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      const accounts = state.analytics.flatMap((event) =>
        event.payload.kind === "lineAccountBatch" ? event.payload.accounts : [],
      );
      expect(accounts.map((account) => account.staffId)).toEqual(expect.arrayContaining(seeded.staffIds));
      expect(accounts.every((account) => account.linked && !account.following)).toBe(true);
      expect(
        state.scheduled.filter(
          (job) =>
            job.name === "legal/actions:sendStaffConsentLine" ||
            job.name === "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
        ),
      ).toEqual([]);
    });

    it("provider stateVersionが進んだ古いjobは副作用前にsupersededへ終端化する", async () => {
      const t = convexTest(schema, modules);
      const seeded = await seedFriendshipFanoutJob(t, { suffix: "superseded", following: true, linkCount: 1 });
      await t.run(async (ctx) => {
        await ctx.db.patch(seeded.providerId, { following: false, stateVersion: 3 });
      });

      const claim = await claimFriendshipFanoutJob(t, seeded.jobId);
      await expect(
        t.mutation(internal.line.mutations.processFriendshipFanoutJob, { jobId: seeded.jobId, ...claim }),
      ).resolves.toEqual({ status: "superseded" });
      const state = await t.run(async (ctx) => ({
        job: await ctx.db.get(seeded.jobId),
        analytics: await ctx.db.query("analyticsSourceEvents").collect(),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      }));
      expect(state.job).toMatchObject({ status: "superseded", completedAt: expect.any(Number) });
      expect(state.analytics).toEqual([]);
      expect(
        state.scheduled.filter(
          (job) =>
            job.name === "legal/actions:sendStaffConsentLine" ||
            job.name === "notification/actions:sendOpenRecruitmentNotificationLinesForStaff",
        ),
      ).toEqual([]);
    });

    it("期限切れleaseを回収し、上限到達をPIIなしactionRequiredへ止めてoperator retryできる", async () => {
      const t = convexTest(schema, modules);
      const seeded = await seedFriendshipFanoutJob(t, { suffix: "recover", following: true, linkCount: 1 });
      await t.run(async (ctx) => {
        await ctx.db.patch(seeded.jobId, {
          status: "processing",
          version: 4,
          attemptCount: 7,
          leaseId: "expired-lease",
          leaseExpiresAt: Date.now() - 1,
        });
      });

      await expect(t.mutation(internal.line.mutations.recoverFriendshipFanoutJobs, {})).resolves.toEqual({
        scheduled: 1,
      });
      await t.mutation(internal.line.mutations.kickFriendshipFanoutJob, { jobId: seeded.jobId });
      const stopped = await t.run(async (ctx) => await ctx.db.get(seeded.jobId));
      expect(stopped).toMatchObject({
        status: "actionRequired",
        version: 5,
        attemptCount: 8,
        lastErrorCode: "line_friendship_fanout_lease_expired",
      });
      expect(stopped?.leaseId).toBeUndefined();
      if (!stopped) throw new Error("fanout job disappeared");
      await expect(
        t.mutation(internal.line.mutations.retryActionRequiredFriendshipFanoutJob, {
          jobId: seeded.jobId,
          expectedVersion: stopped.version - 1,
        }),
      ).rejects.toThrow("状態が更新されています");
      await expect(
        t.mutation(internal.line.mutations.retryActionRequiredFriendshipFanoutJob, {
          jobId: seeded.jobId,
          expectedVersion: stopped.version,
        }),
      ).resolves.toEqual({ status: "scheduled", version: 6 });
      expect(await t.run(async (ctx) => await ctx.db.get(seeded.jobId))).toMatchObject({
        status: "retrying",
        version: 6,
        attemptCount: 0,
      });
    });

    it("retention超過のterminal jobだけを削除しactionRequiredは保持する", async () => {
      const t = convexTest(schema, modules);
      const ids = await t.run(async (ctx) => {
        const providerId = await ctx.db.insert("lineProviderUsers", {
          lineUserId: "U_prune_fanout",
          following: false,
          stateVersion: 1,
          friendshipObservedAt: Date.now(),
          friendshipObservationSource: "webhook",
          isDeleted: false,
        });
        const insertJob = async (status: "completed" | "superseded" | "actionRequired") =>
          await ctx.db.insert("lineFriendshipFanoutJobs", {
            lineProviderUserId: providerId,
            stateVersion: 1,
            following: false,
            status,
            version: 1,
            attemptCount: 0,
            nextRunAt: Date.now(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            expiresAt: Date.now() - 1,
          });
        return {
          completed: await insertJob("completed"),
          superseded: await insertJob("superseded"),
          actionRequired: await insertJob("actionRequired"),
        };
      });

      await expect(t.mutation(internal.line.mutations.pruneFriendshipFanoutJobs, {})).resolves.toEqual({
        deletedCount: 2,
        hasMore: false,
      });
      expect(await t.run(async (ctx) => await ctx.db.get(ids.completed))).toBeNull();
      expect(await t.run(async (ctx) => await ctx.db.get(ids.superseded))).toBeNull();
      expect(await t.run(async (ctx) => await ctx.db.get(ids.actionRequired))).toMatchObject({
        status: "actionRequired",
      });
    });
  });

  describe("dispatchWebhookEvents", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("follow イベントで lineFollowing が true になる", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        if (!staff) throw new Error("missing staff");
        await seedStaffLineAccount(ctx, { staffId, shopId: staff.shopId, lineUserId: "U_abc", following: false });
      });
      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_abc", webhookEventId: "follow-U_abc", timestamp: 100 }],
      });
      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(account?.following).toBe(true);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(
        scheduled.some((job) => job.name === "legal/actions:sendStaffConsentLine" && job.args[0]?.staffId === staffId),
      ).toBe(true);
    });

    it("unfollow イベントで lineFollowing が false になる", async () => {
      const t = convexTest(schema, modules);
      const { staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        const staff = await ctx.db.get(staffId);
        if (!staff) throw new Error("missing staff");
        await seedStaffLineAccount(ctx, { staffId, shopId: staff.shopId, lineUserId: "U_abc", following: true });
      });
      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "unfollow", userId: "U_abc", webhookEventId: "unfollow-U_abc", timestamp: 200 }],
      });
      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .first(),
      );
      expect(account?.following).toBe(false);
    });

    it("同じ lineUserId が複数店舗に紐づく場合、全アカウントの following を更新する", async () => {
      const t = convexTest(schema, modules);
      const { shopId: shopAId, staffId: staffAId } = await setupShop(t);
      const { staffBId } = await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, {
          staffId: staffAId,
          shopId: shopAId,
          lineUserId: "U_multi",
          following: false,
        });
        const shopBId = await seedShop(ctx, "店舗B");
        const staffBId = await ctx.db.insert("staffs", {
          shopId: shopBId,
          name: "鈴木太郎",
          email: "suzuki@example.com",
          isDeleted: false,
        });
        await seedStaffLineAccount(ctx, {
          staffId: staffBId,
          shopId: shopBId,
          lineUserId: "U_multi",
          following: false,
        });
        return { staffBId };
      });

      await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_multi", webhookEventId: "follow-U_multi", timestamp: 300 }],
      });

      const accounts = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_lineUserId_and_isDeleted", (q) => q.eq("lineUserId", "U_multi").eq("isDeleted", false))
          .collect(),
      );
      expect(accounts).toHaveLength(2);
      expect(accounts.every((a) => a.following)).toBe(true);

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      for (const staffId of [staffAId, staffBId]) {
        expect(
          scheduled.some(
            (job) => job.name === "legal/actions:sendStaffConsentLine" && job.args[0]?.staffId === staffId,
          ),
        ).toBe(true);
      }
    });

    it("message イベントの replyToken が返る", async () => {
      const t = convexTest(schema, modules);
      await setupShop(t);
      const r = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "message", replyToken: "reply-1", webhookEventId: "message-1", timestamp: Date.now() }],
      });
      expect(r.replyTokens).toEqual(["reply-1"]);
    });

    it("message予算を使い切っても別userのfollow状態を破棄しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        await seedStaffLineAccount(ctx, {
          staffId,
          shopId,
          lineUserId: "U_state_after_message_flood",
          following: false,
        });
      });

      for (let index = 0; index < LINE_WEBHOOK_MESSAGE_REQUEST_LIMIT; index += 1) {
        const result = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
          events: [
            {
              type: "message",
              replyToken: `reply-${index}`,
              webhookEventId: `message-flood-${index}`,
              timestamp: Date.now(),
            },
          ],
        });
        expect(result.replyTokens).toEqual([`reply-${index}`]);
      }
      await expect(
        t.mutation(internal.line.mutations.dispatchWebhookEvents, {
          events: [
            {
              type: "message",
              replyToken: "reply-over-limit",
              webhookEventId: "message-flood-over-limit",
              timestamp: Date.now(),
            },
          ],
        }),
      ).resolves.toEqual({ replyTokens: [] });

      await expect(
        t.mutation(internal.line.mutations.dispatchWebhookEvents, {
          events: [
            {
              type: "follow",
              userId: "U_state_after_message_flood",
              webhookEventId: "follow-after-message-flood",
              timestamp: Date.now(),
            },
          ],
        }),
      ).resolves.toEqual({ replyTokens: [] });
      const account = await t.run(async (ctx) =>
        ctx.db
          .query("staffLineAccounts")
          .withIndex("by_staffId", (q) => q.eq("staffId", staffId))
          .unique(),
      );
      expect(account?.following).toBe(true);
      expect(account?.lastWebhookEventId).toBe("follow-after-message-flood");
    });

    it("未知のスタッフ userId は黙ってスキップ", async () => {
      const t = convexTest(schema, modules);
      await setupShop(t);
      const r = await t.mutation(internal.line.mutations.dispatchWebhookEvents, {
        events: [{ type: "follow", userId: "U_unknown", webhookEventId: "follow-unknown", timestamp: 500 }],
      });
      expect(r.replyTokens).toEqual([]);
    });
  });

  describe("upsertQuotaStatus", () => {
    it("既存レコードがある場合は replace で1件だけ保たれる", async () => {
      const t = convexTest(schema, modules);
      await t.run(async (ctx) => {
        await ctx.db.insert("lineQuotaStatus", {
          checkedAt: Date.now() - 1000,
          totalQuota: 200,
          consumed: 50,
          remaining: 150,
          status: "normal",
          plan: "communication",
        });
      });

      await t.mutation(internal.line.mutations.upsertQuotaStatus, {
        totalQuota: 200,
        consumed: 250,
        plan: "communication",
      });
      const all = await t.run(async (ctx) => ctx.db.query("lineQuotaStatus").collect());
      expect(all).toHaveLength(1);
      expect(all[0].status).toBe("exceeded");
      expect(all[0].remaining).toBe(0);
    });

    it("remaining > 0 なら normal", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(internal.line.mutations.upsertQuotaStatus, {
        totalQuota: 5000,
        consumed: 1000,
        plan: "light",
      });
      const status = await t.run(async (ctx) => ctx.db.query("lineQuotaStatus").first());
      expect(status?.status).toBe("normal");
      expect(status?.remaining).toBe(4000);
    });

    it("status を指定した場合は remaining 0 でも normal にできる", async () => {
      const t = convexTest(schema, modules);
      await t.mutation(internal.line.mutations.upsertQuotaStatus, {
        totalQuota: 0,
        consumed: 0,
        status: "normal",
        plan: "communication",
      });
      const status = await t.run(async (ctx) => ctx.db.query("lineQuotaStatus").first());
      expect(status?.status).toBe("normal");
      expect(status?.remaining).toBe(0);
    });
  });

  describe("sendInvite (個別)", () => {
    // scheduler.runAfter(0, ...) による "use node" アクションがテスト環境で
    // トランザクション外書き込みエラーを起こすため、タイマーを止めて実行を抑制する
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("自店舗スタッフへの送信が成功する", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { shopId, staffId }),
      ).resolves.not.toThrow();
    });

    it("同じスタッフへの短時間連打では送信予約を増やさない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      const asManager = t.withIdentity({ subject: "user_mgr" });

      await asManager.mutation(api.line.mutations.sendInvite, { shopId, staffId });
      await asManager.mutation(api.line.mutations.sendInvite, { shopId, staffId });

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(1);
    });

    it("1店舗で31人へ連続してLINE招待を予約できる", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await setupShop(t);
      const staffIds = await t.run(async (ctx) => {
        const ids: Id<"staffs">[] = [];
        for (let i = 0; i < 31; i++) {
          ids.push(
            await ctx.db.insert("staffs", {
              shopId,
              name: `スタッフ${i + 1}`,
              email: `staff-${i + 1}@example.com`,
              isDeleted: false,
            }),
          );
        }
        return ids;
      });
      const asManager = t.withIdentity({ subject: "user_mgr" });

      for (const staffId of staffIds) {
        await expect(asManager.mutation(api.line.mutations.sendInvite, { shopId, staffId })).resolves.not.toThrow();
      }

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(31);
    });

    it("他店舗スタッフへの送信は拒否（IDOR）", async () => {
      const t = convexTest(schema, modules);
      const { shopId } = await setupShop(t);
      const otherStaffId = await t.run(async (ctx) => {
        const sid = await seedShop(ctx, "他店舗");
        return await ctx.db.insert("staffs", {
          shopId: sid,
          name: "他店スタッフ",
          email: "other@example.com",
          isDeleted: false,
        });
      });
      await expect(
        t
          .withIdentity({ subject: "user_mgr" })
          .mutation(api.line.mutations.sendInvite, { shopId, staffId: otherStaffId }),
      ).rejects.toThrow("Not found");
      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(0);
    });

    it("削除済みスタッフへの送信を拒否し、メール送信を予約しない", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await t.run(async (ctx) => await ctx.db.patch(staffId, { isDeleted: true }));

      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { shopId, staffId }),
      ).rejects.toThrow("Not found");

      const scheduled = await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect());
      expect(scheduled.filter((job) => job.name === "line/actions:sendInviteEmail")).toHaveLength(0);
    });

    it("メールアドレス未登録なら拒否", async () => {
      const t = convexTest(schema, modules);
      const { shopId, staffId } = await setupShop(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(staffId, { email: "" });
      });
      await expect(
        t.withIdentity({ subject: "user_mgr" }).mutation(api.line.mutations.sendInvite, { shopId, staffId }),
      ).rejects.toThrow("メールアドレスが未登録");
    });
  });
});
