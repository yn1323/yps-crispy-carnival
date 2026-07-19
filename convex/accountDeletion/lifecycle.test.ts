import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  ACCOUNT_DELETION_JOB_LEASE_MS,
  ACCOUNT_DELETION_MAX_ATTEMPTS,
  ACCOUNT_DELETION_PRUNE_BATCH_SIZE,
  ACCOUNT_DELETION_RETENTION_MS,
} from "./constants";

const NOW = new Date("2026-07-19T00:00:00.000Z").getTime();
const ISSUER = "https://convex.test";

function createAccountDeletionTest() {
  return convexTest(schema, modules);
}

type AccountDeletionTest = ReturnType<typeof createAccountDeletionTest>;

describe("accountDeletion job lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
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

  it("lease期限切れをrecoverで再scheduleし、新しいleaseだけが再claimできる", async () => {
    const t = createAccountDeletionTest();
    await accept(t, "lease_recovery");
    const jobId = await onlyJobId(t);
    const first = await t.mutation(internal.accountDeletion.mutations.claim, { jobId });
    expect(first).toMatchObject({ attemptCount: 1 });

    vi.setSystemTime(NOW + ACCOUNT_DELETION_JOB_LEASE_MS + 1);
    await expect(t.mutation(internal.accountDeletion.mutations.recover, {})).resolves.toEqual({ scheduled: 1 });
    const second = await t.mutation(internal.accountDeletion.mutations.claim, { jobId });

    expect(second).toMatchObject({ attemptCount: 2 });
    if (!first || !second) throw new Error("claim not found");
    expect(second.leaseId).not.toBe(first.leaseId);
    expect(second.version).toBeGreaterThan(first.version);
  });

  it("delete phaseに検証evidenceがなければproviderを呼べないactionRequiredへ止める", async () => {
    const t = createAccountDeletionTest();
    await accept(t, "invalid_evidence");
    const jobId = await onlyJobId(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { phase: "deleteProviderUser" });
    });

    await expect(t.mutation(internal.accountDeletion.mutations.claim, { jobId })).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(jobId))).resolves.toMatchObject({
      status: "actionRequired",
      lastErrorCode: "invalid_provider_evidence",
    });
  });

  it("上限attemptのjobは追加claimせずretry_exhaustedへ終端する", async () => {
    const t = createAccountDeletionTest();
    await accept(t, "retry_cap");
    const jobId = await onlyJobId(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(jobId, { attemptCount: ACCOUNT_DELETION_MAX_ATTEMPTS });
    });

    await expect(t.mutation(internal.accountDeletion.mutations.claim, { jobId })).resolves.toBeNull();
    await expect(t.run((ctx) => ctx.db.get(jobId))).resolves.toMatchObject({
      status: "actionRequired",
      lastErrorCode: "retry_exhausted",
    });
  });

  it("operator retryはexpectedVersion一致時だけ再開する", async () => {
    const t = createAccountDeletionTest();
    await accept(t, "operator_retry");
    const jobId = await onlyJobId(t);
    const version = await t.run(async (ctx) => {
      const job = await ctx.db.get(jobId);
      if (!job) throw new Error("job not found");
      const nextVersion = job.version + 1;
      await ctx.db.patch(jobId, {
        status: "actionRequired",
        version: nextVersion,
        lastErrorCode: "provider_network",
      });
      return nextVersion;
    });

    await expect(
      t.mutation(internal.accountDeletion.mutations.retryActionRequired, { jobId, expectedVersion: version - 1 }),
    ).resolves.toEqual({ status: "stale" });
    await expect(
      t.mutation(internal.accountDeletion.mutations.retryActionRequired, { jobId, expectedVersion: version }),
    ).resolves.toMatchObject({ status: "scheduled", version: version + 1 });
    const retried = await t.run((ctx) => ctx.db.get(jobId));
    expect(retried).toMatchObject({ status: "retrying", attemptCount: 0 });
    expect(retried).not.toHaveProperty("lastErrorCode");
  });

  it("90日境界を含むcompleted jobをbatch削除し、backlogだけを再scheduleする", async () => {
    const t = createAccountDeletionTest();
    const userId = await t.run((ctx) => seedUser(ctx, "prune_owner"));
    const cutoff = NOW - ACCOUNT_DELETION_RETENTION_MS;
    await t.run(async (ctx) => {
      for (let index = 0; index < ACCOUNT_DELETION_PRUNE_BATCH_SIZE + 1; index += 1) {
        await ctx.db.insert("accountDeletionJobs", {
          userId,
          requestId: `old-${index}`,
          status: "completed",
          phase: "complete",
          version: 1,
          attemptCount: 1,
          nextRunAt: cutoff,
          providerUserVerifiedAt: cutoff,
          deleteAttemptedAt: cutoff,
          providerDeletedAt: cutoff,
          completedAt: cutoff,
          createdAt: cutoff,
          updatedAt: cutoff,
        });
      }
      await ctx.db.insert("accountDeletionJobs", {
        userId,
        requestId: "newer",
        status: "completed",
        phase: "complete",
        version: 1,
        attemptCount: 1,
        nextRunAt: cutoff + 1,
        providerUserVerifiedAt: cutoff + 1,
        deleteAttemptedAt: cutoff + 1,
        providerDeletedAt: cutoff + 1,
        completedAt: cutoff + 1,
        createdAt: cutoff + 1,
        updatedAt: cutoff + 1,
      });
    });

    await expect(t.mutation(internal.accountDeletion.mutations.pruneCompleted, {})).resolves.toEqual({
      deleted: ACCOUNT_DELETION_PRUNE_BATCH_SIZE,
    });
    const afterFirst = await t.run(async (ctx) => ({
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(afterFirst.jobs).toHaveLength(2);
    expect(
      afterFirst.scheduled.some((scheduled) => scheduled.name === "accountDeletion/mutations:pruneCompleted"),
    ).toBe(true);

    await expect(t.mutation(internal.accountDeletion.mutations.pruneCompleted, {})).resolves.toEqual({ deleted: 1 });
    await expect(t.run((ctx) => ctx.db.query("accountDeletionJobs").collect())).resolves.toMatchObject([
      { requestId: "newer" },
    ]);
  });

  it("不正completed行を隔離し、同じbatchの正常な期限切れjobをstarveさせない", async () => {
    const t = createAccountDeletionTest();
    const userId = await t.run((ctx) => seedUser(ctx, "invalid_prune_owner"));
    const cutoff = NOW - ACCOUNT_DELETION_RETENTION_MS;
    await t.run(async (ctx) => {
      await ctx.db.insert("accountDeletionJobs", {
        userId,
        requestId: "missing-completed-at",
        status: "completed",
        phase: "complete",
        version: 1,
        attemptCount: 1,
        nextRunAt: cutoff - 2,
        createdAt: cutoff - 2,
        updatedAt: cutoff - 2,
      });
      await ctx.db.insert("accountDeletionJobs", {
        userId,
        requestId: "completed-at-not-due",
        status: "completed",
        phase: "complete",
        version: 1,
        attemptCount: 1,
        nextRunAt: cutoff - 1,
        completedAt: cutoff + 1,
        createdAt: cutoff - 1,
        updatedAt: cutoff - 1,
      });
      await ctx.db.insert("accountDeletionJobs", {
        userId,
        requestId: "valid-expired",
        status: "completed",
        phase: "complete",
        version: 1,
        attemptCount: 1,
        nextRunAt: cutoff,
        completedAt: cutoff,
        createdAt: cutoff,
        updatedAt: cutoff,
      });
    });

    await expect(t.mutation(internal.accountDeletion.mutations.pruneCompleted, {})).resolves.toEqual({ deleted: 1 });
    const remaining = await t.run((ctx) => ctx.db.query("accountDeletionJobs").collect());
    expect(remaining).toHaveLength(2);
    expect(remaining).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "missing-completed-at",
          status: "actionRequired",
          lastErrorCode: "invalid_provider_evidence",
        }),
        expect.objectContaining({
          requestId: "completed-at-not-due",
          status: "actionRequired",
          lastErrorCode: "invalid_provider_evidence",
        }),
      ]),
    );
  });

  it("legacy probeをcursorでpaginateし、PIIや内部IDを返さない", async () => {
    const t = createAccountDeletionTest();
    await t.run(async (ctx) => {
      for (let index = 0; index < 25; index += 1) {
        const userId = await seedUser(ctx, `legacy_${index}`, `legacy-${index}@example.com`);
        await ctx.db.patch(userId, { isDeleted: true });
      }
    });

    const first = await t.query(internal.accountDeletion.queries.probeLegacyDeletedUsers, { cursor: null });
    const second = await t.query(internal.accountDeletion.queries.probeLegacyDeletedUsers, {
      cursor: first.continueCursor,
    });

    expect(first).toMatchObject({ scanned: 20, withActiveAssociation: 0, unknownAssociation: 0, isDone: false });
    expect(second).toMatchObject({ scanned: 5, withActiveAssociation: 0, unknownAssociation: 0, isDone: true });
    expect(Object.keys(first).sort()).toEqual(
      ["continueCursor", "isDone", "scanned", "unknownAssociation", "withActiveAssociation"].sort(),
    );
    expect(JSON.stringify([first, second])).not.toContain("legacy_");
    expect(JSON.stringify([first, second])).not.toContain("example.com");
  });

  it("job probeはboundedな集計だけを返し、subjectやrequest IDを露出しない", async () => {
    const t = createAccountDeletionTest();
    await accept(t, "probe_private_subject");
    const jobId = await onlyJobId(t);
    await t.run(async (ctx) => {
      const job = await ctx.db.get(jobId);
      if (!job) throw new Error("job not found");
      await ctx.db.patch(jobId, {
        status: "actionRequired",
        version: job.version + 1,
        lastErrorCode: "provider_network",
      });
    });

    const probe = await t.query(internal.accountDeletion.queries.probeJobs, {});

    expect(probe.statuses.find((status) => status.status === "actionRequired")).toMatchObject({
      observedCount: 1,
      hasMore: false,
      oldestObservedUpdatedAt: NOW,
    });
    expect(probe.errors).toContainEqual({ code: "provider_network", count: 1 });
    expect(JSON.stringify(probe)).not.toContain("probe_private_subject");
    expect(JSON.stringify(probe)).not.toContain("718cf80f");
  });
});

async function accept(t: AccountDeletionTest, subject: string) {
  return await t.mutation(internal.accountDeletion.mutations.accept, {
    issuer: ISSUER,
    clerkUserId: subject,
    requestId: "718cf80f-d4fb-4a5d-bf20-ad48044f31eb",
    rateLimitKey: "d".repeat(64),
  });
}

async function onlyJobId(t: AccountDeletionTest) {
  const jobs = await t.run((ctx) => ctx.db.query("accountDeletionJobs").collect());
  expect(jobs).toHaveLength(1);
  if (!jobs[0]) throw new Error("job not found");
  return jobs[0]._id;
}
