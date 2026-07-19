import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { seedManagerShop, seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { runAccountDeletionJob } from "./actions";
import { type AccountDeletionProvider, AccountDeletionProviderError } from "./provider";

const ISSUER = "https://convex.test";
const REQUEST_ID = "718cf80f-d4fb-4a5d-bf20-ad48044f31eb";

function createAccountDeletionTest() {
  return convexTest(schema, modules);
}

type AccountDeletionTest = ReturnType<typeof createAccountDeletionTest>;

describe("accountDeletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T00:00:00.000Z"));
    vi.stubEnv("APP_URL", "https://shiftori.example");
    vi.stubEnv("CLERK_SECRET_KEY", "configured-secret");
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "configured-publishable");
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", ISSUER);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("user行がない主体もPIIを持たない合成userとjobを同一transactionで一件だけ作る", async () => {
    const t = createAccountDeletionTest();
    await expect(t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("new_subject"))).resolves.toEqual({
      status: "accepted",
    });
    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, {
        ...acceptArgs("new_subject"),
        requestId: "fb915a97-a71b-4ca2-837a-7703d3e561db",
      }),
    ).resolves.toEqual({ status: "accepted" });

    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.users).toHaveLength(1);
    expect(state.users[0]).toMatchObject({ isDeleted: true, accountDeletionRequestedAt: Date.now() });
    expect(state.users[0]?.email).toMatch(/example\.invalid$/);
    expect(state.users[0]?.email).not.toContain("new_subject");
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]).toMatchObject({ status: "queued", phase: "verifyProviderUser" });
    expect(state.scheduled).toHaveLength(1);
  });

  it("有効所属またはbounded scanのunknownではローカル状態を変更しない", async () => {
    const t = createAccountDeletionTest();
    const seeded = await t.run((ctx) => seedManagerShop(ctx, { subject: "associated_subject" }));

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("associated_subject")),
    ).resolves.toEqual({
      status: "conflict",
    });
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(seeded.userId),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.user).toMatchObject({ isDeleted: false });
    expect(state.user).not.toHaveProperty("accountDeletionRequestedAt");
    expect(state.jobs).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("provider確認・削除成功後に完了し、provider識別子を同じtransactionでredactする", async () => {
    const t = createAccountDeletionTest();
    const userId = await t.run(async (ctx) => {
      const id = await seedUser(ctx, "worker_success", "worker@example.com");
      await ctx.db.patch(id, { name: "退会前の氏名", emailNormalized: "worker@example.com" });
      return id;
    });
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("worker_success"));
    const jobId = await onlyJobId(t);
    const provider = fakeProvider();

    await runAccountDeletionJob(workerCtx(t), provider, jobId);

    const state = await t.run(async (ctx) => ({
      job: await ctx.db.get(jobId),
      user: await ctx.db.get(userId),
    }));
    expect(state.job).toMatchObject({
      userId,
      status: "completed",
      phase: "complete",
      providerUserVerifiedAt: Date.now(),
      deleteAttemptedAt: Date.now(),
      providerDeletedAt: Date.now(),
      completedAt: Date.now(),
    });
    expect(state.job).not.toHaveProperty("clerkUserId");
    expect(state.job).not.toHaveProperty("expectedIssuer");
    expect(state.user).toMatchObject({
      authTokenIdentifier: `${ISSUER}|worker_success`,
      name: "退会前の氏名",
      email: "worker@example.com",
      emailNormalized: "worker@example.com",
      isDeleted: true,
      accountDeletionRequestedAt: Date.now(),
    });
    expect(provider.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("初回provider 404は成功扱いにせずactionRequiredにする", async () => {
    const t = createAccountDeletionTest();
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("initial_404"));
    const jobId = await onlyJobId(t);
    const provider = fakeProvider({ getUser: "notFound" });

    await runAccountDeletionJob(workerCtx(t), provider, jobId);

    await expect(t.run((ctx) => ctx.db.get(jobId))).resolves.toMatchObject({
      status: "actionRequired",
      lastErrorCode: "provider_user_not_found_before_verification",
    });
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("provider確認済み・削除試行済みの再開時404だけを完了扱いにする", async () => {
    const t = createAccountDeletionTest();
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("retry_404"));
    const jobId = await onlyJobId(t);
    await t.run((ctx) =>
      ctx.db.patch(jobId, {
        phase: "deleteProviderUser",
        providerUserVerifiedAt: Date.now() - 1_000,
        deleteAttemptedAt: Date.now() - 500,
      }),
    );
    const provider = fakeProvider({ getUser: "notFound" });

    await runAccountDeletionJob(workerCtx(t), provider, jobId);

    await expect(t.run((ctx) => ctx.db.get(jobId))).resolves.toMatchObject({ status: "completed" });
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("削除直前に所属が作られた場合はproviderを呼ばずactionRequiredへ止める", async () => {
    const t = createAccountDeletionTest();
    const userId = await t.run((ctx) => seedUser(ctx, "late_association", "late@example.com"));
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("late_association"));
    const jobId = await onlyJobId(t);
    await t.run(async (ctx) => {
      const shopId = await seedShop(ctx, "遅延所属店舗");
      await ctx.db.insert("shopMembers", { shopId, userId, role: "manager", isDeleted: false });
    });
    const provider = fakeProvider();

    await runAccountDeletionJob(workerCtx(t), provider, jobId);

    await expect(t.run((ctx) => ctx.db.get(jobId))).resolves.toMatchObject({
      status: "actionRequired",
      lastErrorCode: "association_found_before_provider_delete",
    });
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("429などretryable provider失敗はsafe codeだけを保存してretryingにする", async () => {
    const t = createAccountDeletionTest();
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("provider_retry"));
    const jobId = await onlyJobId(t);
    const provider = fakeProvider();
    provider.getUser.mockRejectedValue(new AccountDeletionProviderError(true, "provider_rate_limited", 60_000));

    await runAccountDeletionJob(workerCtx(t), provider, jobId);

    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "retrying", lastErrorCode: "provider_rate_limited" });
    expect(job?.nextRunAt).toBe(Date.now() + 60_000);
    expect(JSON.stringify(job)).not.toContain("provider raw body");
  });

  it("Clerk Instance不一致はuser取得・削除前にactionRequiredへ止める", async () => {
    const t = createAccountDeletionTest();
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("wrong_instance"));
    const jobId = await onlyJobId(t);
    const provider = fakeProvider();
    provider.assertReady.mockRejectedValue(new AccountDeletionProviderError(false, "provider_instance_mismatch"));

    await runAccountDeletionJob(workerCtx(t), provider, jobId);

    await expect(t.run((ctx) => ctx.db.get(jobId))).resolves.toMatchObject({
      status: "actionRequired",
      lastErrorCode: "provider_instance_mismatch",
    });
    expect(provider.getUser).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });

  it("stale versionのworkerは完了状態を上書きできない", async () => {
    const t = createAccountDeletionTest();
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("stale_worker"));
    const jobId = await onlyJobId(t);
    const claimed = await t.mutation(internal.accountDeletion.mutations.claim, { jobId });
    expect(claimed).not.toBeNull();
    if (!claimed || typeof claimed !== "object" || !("leaseId" in claimed) || !("version" in claimed)) return;

    await expect(
      t.mutation(internal.accountDeletion.mutations.markCompleted, {
        jobId,
        leaseId: String(claimed.leaseId),
        expectedVersion: Number(claimed.version) - 1,
      }),
    ).resolves.toEqual({ status: "stale" });
    await expect(t.run((ctx) => ctx.db.get(jobId))).resolves.toMatchObject({ status: "processing" });
  });
});

function acceptArgs(subject: string) {
  return {
    issuer: ISSUER,
    clerkUserId: subject,
    requestId: REQUEST_ID,
    rateLimitKey: "a".repeat(64),
  };
}

function fakeProvider(overrides: { getUser?: "found" | "notFound" } = {}) {
  return {
    assertReady: vi.fn(async () => undefined),
    getUser: vi.fn(async () => overrides.getUser ?? "found"),
    deleteUser: vi.fn(async () => "deleted" as const),
  } satisfies AccountDeletionProvider & {
    assertReady: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };
}

function workerCtx(t: AccountDeletionTest) {
  return { runMutation: t.mutation.bind(t) } as unknown as Parameters<typeof runAccountDeletionJob>[0];
}

async function onlyJobId(t: AccountDeletionTest): Promise<Id<"accountDeletionJobs">> {
  const jobs = await t.run((ctx) => ctx.db.query("accountDeletionJobs").collect());
  expect(jobs).toHaveLength(1);
  if (!jobs[0]) throw new Error("account deletion job not found");
  return jobs[0]._id;
}
