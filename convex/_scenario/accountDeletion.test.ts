import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { runAccountDeletionJob } from "../accountDeletion/actions";
import { ACCOUNT_DELETION_JOB_LEASE_MS } from "../accountDeletion/constants";
import { type AccountDeletionProvider, AccountDeletionProviderError } from "../accountDeletion/provider";

const NOW = new Date("2026-07-19T00:00:00.000Z").getTime();

describe("アカウント削除シナリオ", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("APP_URL", "https://shiftori.example");
    vi.stubEnv("CLERK_SECRET_KEY", "configured-secret");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "configured-publishable");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://convex.test");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("旧subjectを停止してClerk削除へ収束し、新しいsubjectは別アカウントとして初期設定できる", async () => {
    const t = convexTest(schema, modules);
    const deletedUserId = await t.run(async (ctx) => {
      const userId = await seedUser(ctx, "deleted_subject", "deleted-before@example.com");
      await ctx.db.patch(userId, {
        name: "退会前ユーザー",
        emailNormalized: "deleted-before@example.com",
      });
      return userId;
    });
    await t.mutation(internal.accountDeletion.mutations.accept, {
      issuer: "https://convex.test",
      clerkUserId: "deleted_subject",
      requestId: "718cf80f-d4fb-4a5d-bf20-ad48044f31eb",
      rateLimitKey: "b".repeat(64),
    });
    const jobs = await t.run((ctx) => ctx.db.query("accountDeletionJobs").collect());
    if (!jobs[0]) throw new Error("account deletion job not found");

    const provider: AccountDeletionProvider = {
      assertReady: vi.fn(async () => undefined),
      getUser: vi.fn(async () => "found" as const),
      deleteUser: vi.fn(async () => "deleted" as const),
    };
    await runAccountDeletionJob(
      { runMutation: t.mutation.bind(t) } as unknown as Parameters<typeof runAccountDeletionJob>[0],
      provider,
      jobs[0]._id,
    );

    const deletedState = await t
      .withIdentity({ subject: "deleted_subject", name: "Clerk氏名", email: "clerk@example.com" })
      .query(api.dashboard.queries.getCurrentUser, {});
    expect(deletedState).toMatchObject({ accountDeleted: true });
    await expect(
      t.withIdentity({ subject: "deleted_subject" }).mutation(api.setup.mutations.setupShopAndManager, {
        shopName: "旧subjectでは作れない店舗",
        submissionPattern: { kind: "dateOnly" },
        managerName: "削除済み 管理者",
        managerEmail: "deleted-again@example.com",
        acceptedLegal: true,
      }),
    ).rejects.toThrow();

    const shopId = await t
      .withIdentity({ subject: "reregistered_subject" })
      .mutation(api.setup.mutations.setupShopAndManager, {
        shopName: "再登録店舗",
        submissionPattern: { kind: "dateOnly" },
        managerName: "再登録 管理者",
        managerEmail: "reregistered@example.com",
        acceptedLegal: true,
      });
    const state = await t.run(async (ctx) => ({
      shop: await ctx.db.get(shopId),
      deletedUser: await ctx.db.get(deletedUserId),
      users: await ctx.db.query("users").collect(),
      job: await ctx.db.get(jobs[0]._id),
    }));
    expect(state.shop).toMatchObject({ name: "再登録店舗", isDeleted: false });
    expect(state.deletedUser).toMatchObject({
      authTokenIdentifier: "https://convex.test|deleted_subject",
      name: "退会前ユーザー",
      email: "deleted-before@example.com",
      emailNormalized: "deleted-before@example.com",
      isDeleted: true,
      accountDeletionRequestedAt: NOW,
    });
    expect(state.users).toHaveLength(2);
    expect(state.users.filter((user) => user.isDeleted)).toHaveLength(1);
    expect(state.users.filter((user) => !user.isDeleted)).toHaveLength(1);
    expect(state.job).toMatchObject({ status: "completed" });
  }, 10_000);

  it("管理者権限を外したpersonOnly本人も、共有組織を残してClerk削除まで完了する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const target = await seedOrganizationManagerShop(ctx, {
        subject: "former_manager_scenario",
        email: "former-manager-scenario@example.com",
        shopName: "元管理者共有店舗",
        complimentary: true,
      });
      const successorUserId = await seedUser(
        ctx,
        "former_manager_scenario_successor",
        "former-manager-scenario-successor@example.com",
      );
      const successorPersonId = await ctx.db.insert("organizationPeople", {
        organizationId: target.organizationId,
        userId: successorUserId,
        name: "後任管理者",
        email: "former-manager-scenario-successor@example.com",
        emailNormalized: "former-manager-scenario-successor@example.com",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      const successorMemberId = await ctx.db.insert("organizationMembers", {
        organizationId: target.organizationId,
        personId: successorPersonId,
        userId: successorUserId,
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.patch(target.organizationId, {
        billingEmail: "former-manager-scenario-successor@example.com",
        billingEmailNormalized: "former-manager-scenario-successor@example.com",
      });
      await ctx.db.patch(target.memberId, { status: "removed", updatedAt: NOW + 1 });
      return { ...target, successorPersonId, successorMemberId };
    });
    const actor = t.withIdentity({ subject: "former_manager_scenario" });
    const preview = await actor.query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: "2026-07-19" });
    expect(preview).toMatchObject({ status: "ready", action: "leaveOrganization" });
    if (preview.status !== "ready") throw new Error("former-manager preview was not ready");

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, {
        issuer: "https://convex.test",
        clerkUserId: "former_manager_scenario",
        requestId: "7edaf97a-bca6-4a9d-abbd-5eb285dd718e",
        scope: "accountAndAssociations",
        previewFingerprint: preview.previewFingerprint,
        rateLimitKey: "c".repeat(64),
      }),
    ).resolves.toEqual({ status: "accepted" });
    const job = await t.run((ctx) => ctx.db.query("accountDeletionJobs").unique());
    if (!job) throw new Error("account deletion job not found");
    const provider: AccountDeletionProvider = {
      assertReady: vi.fn(async () => undefined),
      getUser: vi.fn(async () => "found" as const),
      deleteUser: vi.fn(async () => "deleted" as const),
    };

    await runAccountDeletionJob(
      { runMutation: t.mutation.bind(t) } as unknown as Parameters<typeof runAccountDeletionJob>[0],
      provider,
      job._id,
    );

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(ids.userId),
      organization: await ctx.db.get(ids.organizationId),
      shop: await ctx.db.get(ids.shopId),
      person: await ctx.db.get(ids.personId),
      member: await ctx.db.get(ids.memberId),
      successorPerson: await ctx.db.get(ids.successorPersonId),
      successorMember: await ctx.db.get(ids.successorMemberId),
      job: await ctx.db.get(job._id),
    }));
    expect(state.user).toMatchObject({ isDeleted: true, accountDeletionRequestedAt: NOW });
    expect(state.organization).toMatchObject({ isDeleted: false });
    expect(state.shop).toMatchObject({ isDeleted: false });
    expect(state.person).toMatchObject({ status: "removed" });
    expect(state.member).toMatchObject({ status: "removed" });
    expect(state.successorPerson).toMatchObject({ status: "active" });
    expect(state.successorMember).toMatchObject({ status: "active" });
    expect(state.job).toMatchObject({ status: "completed", phase: "complete" });
    expect(provider.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("Clerk削除後のmark失敗をlease回復し、確認済み削除試行の404だけで完了する", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.accountDeletion.mutations.accept, {
      issuer: "https://convex.test",
      clerkUserId: "recover_after_delete",
      requestId: "8e63ec71-9afb-4530-b28c-4cff8c76d4ef",
      rateLimitKey: "e".repeat(64),
    });
    const jobs = await t.run((ctx) => ctx.db.query("accountDeletionJobs").collect());
    if (!jobs[0]) throw new Error("account deletion job not found");

    const firstProvider: AccountDeletionProvider = {
      assertReady: vi.fn(async () => undefined),
      getUser: vi.fn(async () => "found" as const),
      deleteUser: vi.fn(async () => "deleted" as const),
    };
    let rejectCompletion = true;
    const callMutation = t.mutation.bind(t) as unknown as (ref: unknown, args: unknown) => Promise<unknown>;
    const flakyRunMutation = vi.fn(async (ref: unknown, args: unknown) => {
      if (
        typeof ref === "object" &&
        ref !== null &&
        getFunctionName(ref as Parameters<typeof getFunctionName>[0]) === "accountDeletion/mutations:markCompleted" &&
        rejectCompletion
      ) {
        rejectCompletion = false;
        throw new Error("simulated mark failure");
      }
      return await callMutation(ref, args);
    });

    await expect(
      runAccountDeletionJob(
        { runMutation: flakyRunMutation } as unknown as Parameters<typeof runAccountDeletionJob>[0],
        firstProvider,
        jobs[0]._id,
      ),
    ).rejects.toThrow("simulated mark failure");
    await expect(t.run((ctx) => ctx.db.get(jobs[0]._id))).resolves.toMatchObject({
      status: "processing",
      phase: "deleteProviderUser",
      providerUserVerifiedAt: NOW,
      deleteAttemptedAt: NOW,
    });

    vi.setSystemTime(NOW + ACCOUNT_DELETION_JOB_LEASE_MS + 1);
    await expect(t.mutation(internal.accountDeletion.mutations.recover, {})).resolves.toEqual({ scheduled: 1 });
    const recoveryProvider: AccountDeletionProvider = {
      assertReady: vi.fn(async () => undefined),
      getUser: vi.fn(async () => "notFound" as const),
      deleteUser: vi.fn(async () => "deleted" as const),
    };
    await runAccountDeletionJob(
      { runMutation: t.mutation.bind(t) } as unknown as Parameters<typeof runAccountDeletionJob>[0],
      recoveryProvider,
      jobs[0]._id,
    );

    await expect(t.run((ctx) => ctx.db.get(jobs[0]._id))).resolves.toMatchObject({
      status: "completed",
      phase: "complete",
    });
    expect(recoveryProvider.deleteUser).not.toHaveBeenCalled();
  });

  it("lease回復時もClerk Instanceを再照合し、不一致ならprovider userへ触れない", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.accountDeletion.mutations.accept, {
      issuer: "https://convex.test",
      clerkUserId: "recover_wrong_instance",
      requestId: "d376832c-cfe7-4f72-aa55-502509856ee0",
      rateLimitKey: "f".repeat(64),
    });
    const jobs = await t.run((ctx) => ctx.db.query("accountDeletionJobs").collect());
    if (!jobs[0]) throw new Error("account deletion job not found");
    const firstClaim = await t.mutation(internal.accountDeletion.mutations.claim, { jobId: jobs[0]._id });
    if (!firstClaim) throw new Error("account deletion job was not claimed");

    vi.setSystemTime(NOW + ACCOUNT_DELETION_JOB_LEASE_MS + 1);
    await expect(t.mutation(internal.accountDeletion.mutations.recover, {})).resolves.toEqual({ scheduled: 1 });
    const recoveryProvider: AccountDeletionProvider = {
      assertReady: vi.fn(async () => {
        throw new AccountDeletionProviderError(false, "provider_instance_mismatch");
      }),
      getUser: vi.fn(async () => "found" as const),
      deleteUser: vi.fn(async () => "deleted" as const),
    };

    await runAccountDeletionJob(
      { runMutation: t.mutation.bind(t) } as unknown as Parameters<typeof runAccountDeletionJob>[0],
      recoveryProvider,
      jobs[0]._id,
    );

    await expect(t.run((ctx) => ctx.db.get(jobs[0]._id))).resolves.toMatchObject({
      status: "actionRequired",
      lastErrorCode: "provider_instance_mismatch",
    });
    expect(recoveryProvider.assertReady).toHaveBeenCalledTimes(1);
    expect(recoveryProvider.getUser).not.toHaveBeenCalled();
    expect(recoveryProvider.deleteUser).not.toHaveBeenCalled();
  });

  it("単独管理者の組織cleanupが要対応になっても、対象とversionを確認した運用retryから完了へ収束する", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run((ctx) =>
      seedOrganizationManagerShop(ctx, {
        subject: "sole_admin_cleanup_retry",
        email: "sole-admin-cleanup-retry@example.com",
        shopName: "再開対象店舗",
        complimentary: true,
      }),
    );
    const preview = await t
      .withIdentity({ subject: "sole_admin_cleanup_retry" })
      .query(api.accountDeletion.queries.getDeletionPreview, { asOfDate: "2026-07-19" });
    if (preview.status !== "ready" || preview.action !== "deleteOrganization") {
      throw new Error("deleteOrganization preview was not ready");
    }

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, {
        issuer: "https://convex.test",
        clerkUserId: "sole_admin_cleanup_retry",
        requestId: "cf01d609-dd2d-48cb-9280-a3fef60ec313",
        scope: "accountAndAssociations",
        previewFingerprint: preview.previewFingerprint,
        rateLimitKey: "a".repeat(64),
      }),
    ).resolves.toEqual({ status: "accepted" });

    const jobs = await t.run(async (ctx) => ({
      account: await ctx.db.query("accountDeletionJobs").unique(),
      cleanup: await ctx.db.query("deletionCleanupJobs").unique(),
    }));
    if (!jobs.account || !jobs.cleanup) throw new Error("deletion jobs were not created");
    const accountJob = jobs.account;
    const cleanupJob = jobs.cleanup;
    await t.run(async (ctx) => {
      await ctx.db.patch(cleanupJob._id, {
        status: "actionRequired",
        version: cleanupJob.version + 1,
        lastErrorCode: "cleanup_lease_expired",
      });
    });

    const provider: AccountDeletionProvider = {
      assertReady: vi.fn(async () => undefined),
      getUser: vi.fn(async () => "found" as const),
      deleteUser: vi.fn(async () => "deleted" as const),
    };
    const workerCtx = {
      runMutation: t.mutation.bind(t),
    } as unknown as Parameters<typeof runAccountDeletionJob>[0];
    await runAccountDeletionJob(workerCtx, provider, accountJob._id);

    const stopped = await t.run(async (ctx) => ({
      account: await ctx.db.get(accountJob._id),
      cleanup: await ctx.db.get(cleanupJob._id),
    }));
    expect(stopped.account).toMatchObject({
      status: "actionRequired",
      phase: "waitForOrganizationCleanup",
      lastErrorCode: "organization_cleanup_action_required",
    });
    expect(stopped.cleanup).toMatchObject({ status: "actionRequired" });
    expect(provider.assertReady).not.toHaveBeenCalled();
    if (!stopped.account) throw new Error("account deletion job disappeared");

    const beforeStaleRetry = await t.run(async (ctx) => ({
      cleanup: await ctx.db.get(cleanupJob._id),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    await expect(
      t.mutation(internal.accountDeletion.mutations.retryActionRequired, {
        jobId: stopped.account._id,
        expectedVersion: stopped.account.version - 1,
      }),
    ).resolves.toEqual({ status: "stale" });
    await expect(
      t.run(async (ctx) => ({
        cleanup: await ctx.db.get(cleanupJob._id),
        scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
      })),
    ).resolves.toEqual(beforeStaleRetry);

    await expect(
      t.mutation(internal.accountDeletion.mutations.retryActionRequired, {
        jobId: stopped.account._id,
        expectedVersion: stopped.account.version,
      }),
    ).resolves.toMatchObject({ status: "scheduled", version: stopped.account.version + 1 });
    await expect(t.run((ctx) => ctx.db.get(cleanupJob._id))).resolves.toMatchObject({
      status: "retrying",
      attemptCount: 0,
    });

    await finishDeletionCleanup(t, cleanupJob._id);
    await runAccountDeletionJob(workerCtx, provider, accountJob._id);

    const completed = await t.run(async (ctx) => ({
      account: await ctx.db.get(accountJob._id),
      cleanup: await ctx.db.get(cleanupJob._id),
      organization: await ctx.db.get(ids.organizationId),
      shop: await ctx.db.get(ids.shopId),
    }));
    expect(completed.account).toMatchObject({ status: "completed", phase: "complete" });
    expect(completed.cleanup).toMatchObject({ status: "completed" });
    expect(completed.organization).toMatchObject({ isDeleted: true });
    expect(completed.shop).toMatchObject({ isDeleted: true });
    expect(provider.assertReady).toHaveBeenCalledTimes(1);
    expect(provider.getUser).toHaveBeenCalledTimes(1);
    expect(provider.deleteUser).toHaveBeenCalledTimes(1);
  });
});

async function finishDeletionCleanup(t: ReturnType<typeof convexTest>, jobId: Id<"deletionCleanupJobs">) {
  for (let iteration = 0; iteration < 200; iteration += 1) {
    let job = await t.run((ctx) => ctx.db.get(jobId));
    if (!job) throw new Error("deletion cleanup job disappeared");
    if (job.status === "completed") return;
    if (job.status === "actionRequired") throw new Error(`deletion cleanup stopped: ${job.lastErrorCode ?? "unknown"}`);
    if (job.status === "queued" || job.status === "retrying") {
      await t.mutation(internal.deletionCleanup.mutations.kick, { jobId });
      job = await t.run((ctx) => ctx.db.get(jobId));
      if (!job) throw new Error("deletion cleanup job disappeared after claim");
    }
    if (job.status === "processing" && job.leaseId) {
      await t.mutation(internal.deletionCleanup.mutations.process, {
        jobId,
        leaseId: job.leaseId,
        expectedVersion: job.version,
      });
    }
  }
  throw new Error("deletion cleanup job did not complete");
}
