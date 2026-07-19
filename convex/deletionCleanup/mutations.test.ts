import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { modules, schema } from "../_test/setup.test-helper";
import { ensureDeletionCleanupJob } from "./service";
import { deletedLineUserId } from "./tombstone";

const NOW = new Date("2026-07-18T00:00:00.000Z").getTime();

describe("deletionCleanup worker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("最終確認で残存するactive resourceを検出し、修復後にだけcompletedへ進む", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, { name: "削除対象店舗", isDeleted: true });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "残存スタッフ",
        email: "remaining@example.com",
        emailNormalized: "remaining@example.com",
        isDeleted: false,
      });
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId,
        requestId: "verify-before-complete",
        status: "processing",
        phase: "shopVerification",
        version: 3,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "verify-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { shopId, staffId, jobId };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "verify-lease",
      expectedVersion: 3,
    });

    const detected = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      staff: await ctx.db.get(ids.staffId),
    }));
    expect(detected.job).toMatchObject({
      status: "queued",
      phase: "shopVerification",
      resource: "outboxPending",
    });
    expect(detected.job?.completedAt).toBeUndefined();
    expect(detected.staff).toMatchObject({ isDeleted: false, name: "残存スタッフ" });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const completed = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      staff: await ctx.db.get(ids.staffId),
    }));
    expect(completed.job).toMatchObject({
      status: "completed",
      phase: "shopVerification",
      completedAt: expect.any(Number),
    });
    expect(completed.staff).toMatchObject({
      isDeleted: true,
      name: "残存スタッフ",
      email: "remaining@example.com",
      emailNormalized: "remaining@example.com",
    });
  });

  it("100件を超えるpageをboundedに継続し、古いworkerの再実行を無視する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, { name: "削除対象店舗", isDeleted: true });
      const staffIds = [];
      for (let index = 0; index < 101; index += 1) {
        staffIds.push(
          await ctx.db.insert("staffs", {
            shopId,
            name: `スタッフ${index}`,
            email: `staff${index}@example.com`,
            emailNormalized: `staff${index}@example.com`,
            isDeleted: false,
          }),
        );
      }
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId,
        requestId: "bounded-page",
        status: "processing",
        phase: "shopStaffs",
        version: 7,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "page-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { shopId, staffIds, jobId };
    });

    const staleArgs = { jobId: ids.jobId, leaseId: "page-lease", expectedVersion: 7 };
    await t.mutation(internal.deletionCleanup.mutations.process, staleArgs);
    await t.mutation(internal.deletionCleanup.mutations.process, staleArgs);

    const firstPage = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      active: await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ids.shopId).eq("isDeleted", false))
        .collect(),
      all: await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", ids.shopId))
        .collect(),
    }));
    expect(firstPage.job).toMatchObject({ status: "queued", phase: "shopStaffs", version: 8 });
    expect(firstPage.active).toHaveLength(1);
    expect(firstPage.all).toHaveLength(101);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const finalState = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      active: await ctx.db
        .query("staffs")
        .withIndex("by_shopId_isDeleted", (q) => q.eq("shopId", ids.shopId).eq("isDeleted", false))
        .collect(),
      all: await ctx.db
        .query("staffs")
        .withIndex("by_shopId", (q) => q.eq("shopId", ids.shopId))
        .collect(),
    }));
    expect(finalState.job?.status).toBe("completed");
    expect(finalState.active).toEqual([]);
    expect(finalState.all).toHaveLength(101);
    expect(
      finalState.all
        .map(({ _id, name, email, emailNormalized }) => ({ _id, name, email, emailNormalized }))
        .sort((a, b) => a._id.localeCompare(b._id)),
    ).toEqual(
      ids.staffIds
        .map((_id, index) => ({
          _id,
          name: `スタッフ${index}`,
          email: `staff${index}@example.com`,
          emailNormalized: `staff${index}@example.com`,
        }))
        .sort((a, b) => a._id.localeCompare(b._id)),
    );
  });

  it("店舗の通知履歴を1回100件まで削除し、残りを継続してから完了する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, { name: "通知履歴削除店舗", isDeleted: true });
      const staffId = await ctx.db.insert("staffs", {
        shopId,
        name: "通知履歴スタッフ",
        email: "history@example.com",
        isDeleted: true,
      });
      await seedNotificationHistories(ctx, { shopId, staffId, count: 101 });
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId,
        requestId: "notification-history-bounded",
        status: "processing",
        phase: "shopNotificationHistory",
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "notification-history-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { shopId, staffId, jobId };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "notification-history-lease",
      expectedVersion: 1,
    });

    const firstBatch = await t.run(async (ctx) => ({
      histories: await ctx.db
        .query("notificationHistory")
        .withIndex("by_shopId_and_staffId_and_requestedAt", (q) =>
          q.eq("shopId", ids.shopId).eq("staffId", ids.staffId),
        )
        .collect(),
      job: await ctx.db.get(ids.jobId),
    }));
    expect(firstBatch.job).toMatchObject({ status: "queued", phase: "shopNotificationHistory" });
    expect(firstBatch.histories).toHaveLength(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const completed = await t.run(async (ctx) => ({
      histories: await ctx.db
        .query("notificationHistory")
        .withIndex("by_shopId_and_staffId_and_requestedAt", (q) =>
          q.eq("shopId", ids.shopId).eq("staffId", ids.staffId),
        )
        .collect(),
      job: await ctx.db.get(ids.jobId),
    }));
    expect(completed.histories).toEqual([]);
    expect(completed.job).toMatchObject({ status: "completed", phase: "shopVerification" });
  });

  it("組織cleanupの完了検証は残存通知履歴を検出して店舗単位の削除phaseへ戻す", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const organizationId = await seedOrganization(ctx, "通知履歴削除グループ", undefined, true);
      const shopId = await seedShop(ctx, {
        organizationId,
        name: "通知履歴削除店舗",
        isDeleted: true,
      });
      const staffId = await ctx.db.insert("staffs", {
        organizationId,
        shopId,
        name: "通知履歴スタッフ",
        email: "organization-history@example.com",
        isDeleted: true,
      });
      await seedNotificationHistories(ctx, { shopId, staffId, count: 1 });
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "organization",
        organizationId,
        requestId: "organization-notification-history-verification",
        status: "processing",
        phase: "organizationVerification",
        resource: "organizationShopNotificationHistory",
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "organization-notification-history-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { shopId, jobId };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "organization-notification-history-lease",
      expectedVersion: 1,
    });

    await expect(t.run(async (ctx) => ctx.db.get(ids.jobId))).resolves.toMatchObject({
      status: "queued",
      phase: "organizationShopNotificationHistory",
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(
      t.run(async (ctx) =>
        ctx.db
          .query("notificationHistory")
          .withIndex("by_shopId_and_staffId_and_requestedAt", (q) => q.eq("shopId", ids.shopId))
          .collect(),
      ),
    ).resolves.toEqual([]);
    await expect(t.run(async (ctx) => ctx.db.get(ids.jobId))).resolves.toMatchObject({
      status: "completed",
      phase: "organizationVerification",
    });
  });

  it("期限切れleaseを回収し、古いlease/versionでは新しい状態を上書きしない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, { name: "削除対象店舗", isDeleted: true });
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId,
        requestId: "recover-expired-lease",
        status: "processing",
        phase: "shopVerification",
        version: 4,
        attemptCount: 0,
        nextRunAt: NOW - 60_000,
        leaseId: "expired-lease",
        leaseExpiresAt: NOW - 1,
        createdAt: NOW - 60_000,
        updatedAt: NOW - 60_000,
      });
      return { jobId };
    });

    await expect(t.mutation(internal.deletionCleanup.mutations.recover, {})).resolves.toEqual({ scheduled: 1 });
    await t.mutation(internal.deletionCleanup.mutations.kick, { jobId: ids.jobId });

    const reclaimed = await t.run(async (ctx) => ctx.db.get(ids.jobId));
    expect(reclaimed).toMatchObject({ status: "processing", version: 5, attemptCount: 1 });
    expect(reclaimed?.leaseId).not.toBe("expired-lease");

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "expired-lease",
      expectedVersion: 4,
    });
    await expect(t.run(async (ctx) => ctx.db.get(ids.jobId))).resolves.toMatchObject({
      status: "processing",
      version: 5,
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(t.run(async (ctx) => ctx.db.get(ids.jobId))).resolves.toMatchObject({
      status: "completed",
      completedAt: expect.any(Number),
    });
  });

  it("回収上限へ達したleaseと不正なphaseをPIIなしのactionRequiredへ終端化する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, { name: "削除対象店舗", isDeleted: true });
      const exhaustedJobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId,
        requestId: "lease-exhausted",
        status: "processing",
        phase: "shopVerification",
        version: 2,
        attemptCount: 7,
        nextRunAt: NOW - 60_000,
        leaseId: "expired-last-lease",
        leaseExpiresAt: NOW - 1,
        createdAt: NOW - 60_000,
        updatedAt: NOW - 60_000,
      });
      const invalidJobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "shop",
        shopId,
        requestId: "request-with-pii@example.com",
        status: "processing",
        phase: "invalid-phase-with-pii@example.com",
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "invalid-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { exhaustedJobId, invalidJobId };
    });

    await t.mutation(internal.deletionCleanup.mutations.kick, { jobId: ids.exhaustedJobId });
    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.invalidJobId,
      leaseId: "invalid-lease",
      expectedVersion: 1,
    });

    const jobs = await t.run(async (ctx) => ({
      exhausted: await ctx.db.get(ids.exhaustedJobId),
      invalid: await ctx.db.get(ids.invalidJobId),
    }));
    expect(jobs.exhausted).toMatchObject({
      status: "actionRequired",
      attemptCount: 8,
      lastErrorCode: "cleanup_lease_expired",
    });
    expect(jobs.invalid).toMatchObject({
      status: "actionRequired",
      lastErrorCode: "invalid_shop_cleanup_phase",
    });
    expect(
      JSON.stringify({ exhausted: jobs.exhausted?.lastErrorCode, invalid: jobs.invalid?.lastErrorCode }),
    ).not.toContain("@example.com");
  });

  it("組織jobのcurrentShopが別組織を指す不変条件違反では対象外店舗を変更しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const organizationId = await seedOrganization(ctx, "削除対象組織");
      const otherOrganizationId = await seedOrganization(ctx, "対象外組織");
      const otherShopId = await seedShop(ctx, {
        organizationId: otherOrganizationId,
        name: "対象外店舗",
        isDeleted: false,
      });
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "organization",
        organizationId,
        requestId: "wrong-current-shop",
        status: "processing",
        phase: "organizationShopStaffs",
        currentShopId: otherShopId,
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "wrong-shop-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { jobId, otherShopId };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "wrong-shop-lease",
      expectedVersion: 1,
    });

    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      otherShop: await ctx.db.get(ids.otherShopId),
    }));
    expect(state.job).toMatchObject({
      status: "actionRequired",
      lastErrorCode: "invalid_organization_cleanup_shop_target",
    });
    expect(state.otherShop).toMatchObject({ name: "対象外店舗", isDeleted: false });
  });

  it("旧organization user cleanup phaseはglobal userを変更せず、tenant配下だけを利用停止する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|association-unknown",
        name: "確認待ちユーザー",
        email: "association-unknown@example.com",
        emailNormalized: "association-unknown@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await seedOrganization(ctx, "削除対象グループ", userId, true);
      const shopId = await seedShop(ctx, {
        organizationId,
        name: "削除対象店舗",
        isDeleted: true,
      });
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId,
        name: "確認待ちユーザー",
        email: "association-unknown@example.com",
        emailNormalized: "association-unknown@example.com",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      for (let index = 0; index < 21; index += 1) {
        await ctx.db.insert("shopMembers", {
          shopId,
          userId,
          role: "manager",
          isDeleted: false,
        });
      }
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "organization",
        organizationId,
        requestId: "association-scan-limit",
        status: "processing",
        phase: "organizationPeople",
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "association-scan-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { userId, personId, jobId };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "association-scan-lease",
      expectedVersion: 1,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      user: await ctx.db.get(ids.userId),
      person: await ctx.db.get(ids.personId),
    }));
    expect(state.job).toMatchObject({ status: "completed" });
    expect(state.user).toMatchObject({
      isDeleted: false,
      name: "確認待ちユーザー",
      email: "association-unknown@example.com",
    });
    expect(state.person).toMatchObject({
      status: "removed",
      name: "確認待ちユーザー",
      email: "association-unknown@example.com",
      emailNormalized: "association-unknown@example.com",
    });
  });

  it("永続済みの旧user cleanup phase/resourceはglobal userを変更せず次工程へ進む", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|legacy-user-cleanup",
        name: "維持するユーザー",
        email: "legacy-user-cleanup@example.com",
        emailNormalized: "legacy-user-cleanup@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await seedOrganization(ctx, "削除対象グループ", userId, true);
      const shopId = await seedShop(ctx, { organizationId, name: "削除対象店舗", isDeleted: true });
      await ctx.db.insert("shopMembers", { shopId, userId, role: "manager", isDeleted: true });
      const base = {
        scope: "organization" as const,
        organizationId,
        status: "processing" as const,
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      };
      const createdByJobId = await ctx.db.insert("deletionCleanupJobs", {
        ...base,
        requestId: "legacy-created-by-user-phase",
        phase: "organizationCreatedByUser",
        leaseId: "legacy-created-by-lease",
      });
      const memberUsersJobId = await ctx.db.insert("deletionCleanupJobs", {
        ...base,
        requestId: "legacy-member-users-phase",
        phase: "organizationShopMemberUsers",
        currentShopId: shopId,
        leaseId: "legacy-member-users-lease",
      });
      const verificationJobId = await ctx.db.insert("deletionCleanupJobs", {
        ...base,
        requestId: "legacy-member-users-verification",
        phase: "organizationVerification",
        resource: "organizationShopMemberUsers",
        currentShopId: shopId,
        leaseId: "legacy-verification-lease",
      });
      return { userId, createdByJobId, memberUsersJobId, verificationJobId };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.createdByJobId,
      leaseId: "legacy-created-by-lease",
      expectedVersion: 1,
    });
    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.memberUsersJobId,
      leaseId: "legacy-member-users-lease",
      expectedVersion: 1,
    });
    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.verificationJobId,
      leaseId: "legacy-verification-lease",
      expectedVersion: 1,
    });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      createdByJob: await ctx.db.get(ids.createdByJobId),
      memberUsersJob: await ctx.db.get(ids.memberUsersJobId),
      verificationJob: await ctx.db.get(ids.verificationJobId),
    }));
    expect(state.user).toMatchObject({
      isDeleted: false,
      name: "維持するユーザー",
      email: "legacy-user-cleanup@example.com",
    });
    expect(state.createdByJob).toMatchObject({ status: "queued", phase: "organizationVerification" });
    expect(state.memberUsersJob).toMatchObject({ status: "queued", phase: "organizationShopLineAccounts" });
    expect(state.verificationJob).toMatchObject({
      status: "queued",
      phase: "organizationVerification",
      resource: "organizationShopLineAccounts",
    });
  });

  it("組織の最終確認でも残存personだけを修復し、global userを維持して完了する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        authTokenIdentifier: "https://convex.test|organization-owner",
        name: "組織管理者",
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        role: "manager",
        isDeleted: false,
      });
      const organizationId = await seedOrganization(ctx, "削除対象グループ", userId, true);
      const personId = await ctx.db.insert("organizationPeople", {
        organizationId,
        userId,
        name: "組織管理者",
        email: "owner@example.com",
        emailNormalized: "owner@example.com",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("organizationMembers", {
        organizationId,
        personId,
        userId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "organization",
        organizationId,
        requestId: "organization-final-verification",
        status: "processing",
        phase: "organizationVerification",
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "organization-verify-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return { organizationId, personId, userId, jobId };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "organization-verify-lease",
      expectedVersion: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(ids.jobId))).resolves.toMatchObject({
      status: "queued",
      phase: "organizationVerification",
      resource: "organizationOutboxPending",
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const completed = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      person: await ctx.db.get(ids.personId),
      user: await ctx.db.get(ids.userId),
    }));
    expect(completed.job).toMatchObject({ status: "completed", phase: "organizationVerification" });
    expect(completed.person).toMatchObject({
      status: "removed",
      name: "組織管理者",
      email: "owner@example.com",
      emailNormalized: "owner@example.com",
    });
    expect(completed.user).toMatchObject({
      isDeleted: false,
      name: "組織管理者",
      email: "owner@example.com",
      emailNormalized: "owner@example.com",
      authTokenIdentifier: "https://convex.test|organization-owner",
    });
  });

  it("組織配下の各店舗を再走査し、業務識別情報を保持してLINE識別子と未失効tokenを修復する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const organizationId = await seedOrganization(ctx, "削除対象グループ", undefined, true);
      const shopId = await seedShop(ctx, { organizationId, name: "削除対象店舗", isDeleted: true });
      const staffId = await ctx.db.insert("staffs", {
        organizationId,
        shopId,
        name: "置換漏れスタッフ",
        email: "remaining-staff@example.com",
        emailNormalized: "remaining-staff@example.com",
        isDeleted: true,
      });
      const lineAccountId = await ctx.db.insert("staffLineAccounts", {
        staffId,
        shopId,
        lineUserId: "U_REMAINING",
        linkedAt: NOW,
        following: false,
        isDeleted: true,
      });
      const recruitmentId = await ctx.db.insert("recruitments", {
        shopId,
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        deadline: "2026-07-31",
        shopClosedDates: [],
        status: "open",
        isDeleted: false,
        submissionPattern: { kind: "dateOnly" },
      });
      const sessionId = await ctx.db.insert("sessions", {
        sessionToken: "remaining-session",
        staffId,
        shopId,
        recruitmentId,
        expiresAt: NOW + 86_400_000,
      });
      const magicLinkId = await ctx.db.insert("magicLinks", {
        token: "remaining-magic",
        staffId,
        shopId,
        recruitmentId,
        expiresAt: NOW + 86_400_000,
      });
      const lineLinkTokenId = await ctx.db.insert("lineLinkTokens", {
        token: "remaining-line-link",
        staffId,
        shopId,
        expiresAt: NOW + 86_400_000,
      });
      const legalConsentTokenId = await ctx.db.insert("legalConsentTokens", {
        token: "remaining-legal",
        staffId,
        shopId,
        method: "staff_email_link",
        expiresAt: NOW + 86_400_000,
      });
      const registrationLinkId = await ctx.db.insert("shopRegistrationLinks", {
        token: "remaining-registration",
        shopId,
        createdAt: NOW,
      });
      const jobId = await ctx.db.insert("deletionCleanupJobs", {
        scope: "organization",
        organizationId,
        requestId: "organization-shop-verification",
        status: "processing",
        phase: "organizationVerification",
        resource: "organizationShopStaffs",
        version: 1,
        attemptCount: 0,
        nextRunAt: NOW,
        leaseId: "organization-shop-verify-lease",
        leaseExpiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      return {
        organizationId,
        shopId,
        staffId,
        lineAccountId,
        sessionId,
        magicLinkId,
        lineLinkTokenId,
        legalConsentTokenId,
        registrationLinkId,
        jobId,
      };
    });

    await t.mutation(internal.deletionCleanup.mutations.process, {
      jobId: ids.jobId,
      leaseId: "organization-shop-verify-lease",
      expectedVersion: 1,
    });
    await expect(t.run(async (ctx) => ctx.db.get(ids.jobId))).resolves.toMatchObject({
      status: "queued",
      phase: "organizationVerification",
      resource: "organizationShopMembers",
    });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get(ids.jobId),
      staff: await ctx.db.get(ids.staffId),
      lineAccount: await ctx.db.get(ids.lineAccountId),
      session: await ctx.db.get(ids.sessionId),
      magicLink: await ctx.db.get(ids.magicLinkId),
      lineLinkToken: await ctx.db.get(ids.lineLinkTokenId),
      legalConsentToken: await ctx.db.get(ids.legalConsentTokenId),
      registrationLink: await ctx.db.get(ids.registrationLinkId),
    }));
    expect(state.job).toMatchObject({ status: "completed", phase: "organizationVerification" });
    expect(state.staff).toMatchObject({
      isDeleted: true,
      name: "置換漏れスタッフ",
      email: "remaining-staff@example.com",
      emailNormalized: "remaining-staff@example.com",
    });
    expect(state.lineAccount).toMatchObject({
      isDeleted: true,
      following: false,
      lineUserId: deletedLineUserId(ids.lineAccountId),
    });
    for (const token of [
      state.session,
      state.magicLink,
      state.lineLinkToken,
      state.legalConsentToken,
      state.registrationLink,
    ]) {
      expect(token?.revokedAt).toBeTypeOf("number");
    }
  });

  it("対象ごとにjobを一件へ収束させ、親子scopeを同時に作らない", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const organizationId = await seedOrganization(ctx, "組織");
      const shopId = await seedShop(ctx, { organizationId, name: "店舗", isDeleted: true });
      return { organizationId, shopId };
    });

    const firstJob = await t.run((ctx) =>
      ensureDeletionCleanupJob(ctx, {
        scope: "shop",
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        requestId: "shop-request-first",
      }),
    );
    const retriedJob = await t.run((ctx) =>
      ensureDeletionCleanupJob(ctx, {
        scope: "shop",
        shopId: ids.shopId,
        organizationId: ids.organizationId,
        requestId: "shop-request-retry",
      }),
    );
    expect(retriedJob._id).toBe(firstJob._id);
    await expect(
      t.run((ctx) =>
        ensureDeletionCleanupJob(ctx, {
          scope: "organization",
          organizationId: ids.organizationId,
          requestId: "organization-request",
        }),
      ),
    ).rejects.toThrow("店舗の削除処理が進行中です");
    await expect(t.run(async (ctx) => ctx.db.query("deletionCleanupJobs").collect())).resolves.toHaveLength(1);
  });
});

describe("deletionCleanup operational status", () => {
  it("各statusを51件以下で観測し、PIIを返さずterminal到達を確認できる", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    try {
      const ids = await t.run(async (ctx) => {
        const shopId = await seedShop(ctx, { name: "削除対象店舗", isDeleted: true });
        const jobIds = [];
        for (const [index, status] of ["queued", "processing", "retrying", "actionRequired", "completed"].entries()) {
          jobIds.push(
            await ctx.db.insert("deletionCleanupJobs", {
              scope: "shop",
              shopId,
              requestId: `private-person-${index}@example.com`,
              status: status as "queued" | "processing" | "retrying" | "actionRequired" | "completed",
              phase: status === "actionRequired" ? "private-person@example.com" : "shopVerification",
              version: 1,
              attemptCount: index,
              nextRunAt: NOW + index,
              ...(status === "processing" ? { leaseId: "active-lease", leaseExpiresAt: NOW + 60_000 } : {}),
              ...(status === "actionRequired" ? { lastErrorCode: "private-person@example.com" } : {}),
              createdAt: NOW + index,
              updatedAt: NOW + index,
              ...(status === "completed" ? { completedAt: NOW + index } : {}),
            }),
          );
        }
        for (let index = 0; index < 50; index += 1) {
          jobIds.push(
            await ctx.db.insert("deletionCleanupJobs", {
              scope: "shop",
              shopId,
              requestId: `queued-private-${index}@example.com`,
              status: "queued",
              phase: "shopVerification",
              version: 1,
              attemptCount: 0,
              nextRunAt: NOW + 100 + index,
              createdAt: NOW + 100 + index,
              updatedAt: NOW + 100 + index,
            }),
          );
        }
        return { jobIds };
      });

      const active = await t.query(internal.deletionCleanup.queries.getStatus, {});
      expect(active.hasUnfinished).toBe(true);
      expect(active.statuses.map(({ status, observedCount, hasMore }) => ({ status, observedCount, hasMore }))).toEqual(
        [
          { status: "queued", observedCount: 50, hasMore: true },
          { status: "processing", observedCount: 1, hasMore: false },
          { status: "retrying", observedCount: 1, hasMore: false },
          { status: "actionRequired", observedCount: 1, hasMore: false },
          { status: "completed", observedCount: 1, hasMore: false },
        ],
      );
      const statusJson = JSON.stringify(active);
      expect(statusJson).not.toContain("private-person");
      expect(statusJson).not.toContain("@example.com");
      expect(statusJson).not.toContain("private-person-0@example.com");
      expect(active.statuses.find(({ status }) => status === "actionRequired")?.jobs[0]).toMatchObject({
        phase: "invalidPhase",
        lastErrorCode: "unsafe_error_code_redacted",
      });

      await t.run(async (ctx) => {
        for (const jobId of ids.jobIds) {
          await ctx.db.patch(jobId, {
            status: "completed",
            phase: "shopVerification",
            leaseId: undefined,
            leaseExpiresAt: undefined,
            lastErrorCode: undefined,
            completedAt: NOW + 100,
            updatedAt: NOW + 100,
          });
        }
      });
      const terminal = await t.query(internal.deletionCleanup.queries.getStatus, {});
      expect(terminal.hasUnfinished).toBe(false);
      expect(terminal.statuses.map(({ status, observedCount }) => ({ status, observedCount }))).toEqual([
        { status: "queued", observedCount: 0 },
        { status: "processing", observedCount: 0 },
        { status: "retrying", observedCount: 0 },
        { status: "actionRequired", observedCount: 0 },
        { status: "completed", observedCount: 50 },
      ]);
      expect(terminal.statuses.find(({ status }) => status === "completed")?.hasMore).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

async function seedShop(
  ctx: MutationCtx,
  args: {
    organizationId?: Id<"organizations">;
    name: string;
    isDeleted: boolean;
  },
) {
  return await ctx.db.insert("shops", {
    ...(args.organizationId ? { organizationId: args.organizationId, operatingStatus: "active" as const } : {}),
    name: args.name,
    submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
    regularClosedDays: [],
    isDeleted: args.isDeleted,
  });
}

async function seedOrganization(ctx: MutationCtx, name: string, createdByUserId?: Id<"users">, deleted = false) {
  const organizationId = await ctx.db.insert("organizations", {
    ...(createdByUserId ? { createdByUserId } : {}),
    name,
    billingEmail: "billing@example.com",
    billingEmailNormalized: "billing@example.com",
    isDeleted: deleted,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return organizationId;
}

async function seedNotificationHistories(
  ctx: MutationCtx,
  args: { shopId: Id<"shops">; staffId: Id<"staffs">; count: number },
) {
  for (let index = 0; index < args.count; index += 1) {
    const requestedAt = NOW + index;
    const outboxId = await ctx.db.insert("notificationOutbox", {
      channel: "email",
      status: "sent",
      dedupeKey: `email:cleanup-history:${args.staffId}:${index}`,
      shopId: args.shopId,
      staffId: args.staffId,
      payload: {
        kind: "email",
        from: "シフトリ <noreply@example.com>",
        to: "history@example.com",
        subject: `通知履歴${index}`,
        html: "<p>cleanup history</p>",
        context: "test.notificationHistoryCleanup",
        suppressDelivery: true,
      },
      attemptCount: 1,
      nextRunAt: requestedAt,
      sentAt: requestedAt,
      createdAt: requestedAt,
      updatedAt: requestedAt,
    });
    await ctx.db.insert("notificationHistory", {
      outboxId,
      shopId: args.shopId,
      staffId: args.staffId,
      channel: "email",
      notificationKind: "test.cleanup",
      displayTitle: `通知履歴${index}`,
      sendStatus: "sent",
      deliveryStatus: "unknown",
      requestedAt,
      sentAt: requestedAt,
      updatedAt: requestedAt,
    });
  }
}
