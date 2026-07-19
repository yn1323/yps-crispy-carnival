import { getFunctionName } from "convex/server";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { seedUser } from "../_test/seed";
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
});
