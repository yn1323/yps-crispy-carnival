import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { checkAccountDeletionReadiness } from "./actions";
import { getAccountDeletionConfiguration } from "./config";
import type { AccountDeletionProvider } from "./provider";

const ISSUER = "https://convex.test";
const REQUEST_ID = "718cf80f-d4fb-4a5d-bf20-ad48044f31eb";

describe("accountDeletion acceptance boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T00:00:00.000Z"));
    stubValidConfiguration();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("既存userをtombstone化してjobを一件だけ作る", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => seedUser(ctx, "existing_user", "pii@example.com"));

    await expect(t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("existing_user"))).resolves.toEqual({
      status: "accepted",
    });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
    }));
    expect(state.user).toMatchObject({ isDeleted: true, accountDeletionRequestedAt: Date.now() });
    expect(state.user?.email).not.toBe("pii@example.com");
    expect(state.jobs).toHaveLength(1);
  });

  it("同一auth tokenのuser重複はfail closedで何も変更しない", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await seedUser(ctx, "duplicate_subject", "first@example.com");
      await seedUser(ctx, "duplicate_subject", "second@example.com");
    });

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("duplicate_subject")),
    ).resolves.toEqual({
      status: "conflict",
    });
    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state.users.every((user) => !user.isDeleted)).toBe(true);
    expect(state.jobs).toEqual([]);
    expect(state.scheduled).toEqual([]);
  });

  it("actionRequiredを含む既存jobはkill switchとrequest IDより先に202へ収束する", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("idempotent_subject"));
    await t.run(async (ctx) => {
      const job = await ctx.db.query("accountDeletionJobs").unique();
      if (!job) throw new Error("job not found");
      await ctx.db.patch(job._id, { status: "actionRequired", version: job.version + 1 });
    });
    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "false");

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("idempotent_subject")),
    ).resolves.toEqual({
      status: "accepted",
    });
    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, {
        ...acceptArgs("idempotent_subject"),
        requestId: "8e63ec71-9afb-4530-b28c-4cff8c76d4ef",
      }),
    ).resolves.toEqual({ status: "accepted" });
    await expect(t.run((ctx) => ctx.db.query("accountDeletionJobs").collect())).resolves.toHaveLength(1);
  });

  it.each([
    ["kill switch", "ACCOUNT_DELETION_ENABLED", "false"],
    ["APP_URL", "APP_URL", ""],
    ["provider secret", "CLERK_SECRET_KEY", ""],
  ] as const)("%sが無効な新規受付は利用停止もscheduleもしない", async (_label, key, value) => {
    const t = convexTest(schema, modules);
    vi.stubEnv(key, value);

    await expect(
      t.mutation(internal.accountDeletion.mutations.accept, acceptArgs(`invalid_config_${key}`)),
    ).resolves.toEqual({
      status: "unavailable",
    });
    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
      scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
    }));
    expect(state).toEqual({ users: [], jobs: [], scheduled: [] });
  });

  it("同じ安定hash keyの4件目をrate limitし、4件目のuser/jobは作らない", async () => {
    const t = convexTest(schema, modules);
    const results = [];
    for (const subject of ["rate_1", "rate_2", "rate_3", "rate_4"]) {
      results.push(await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs(subject)));
    }

    expect(results).toEqual([
      { status: "accepted" },
      { status: "accepted" },
      { status: "accepted" },
      { status: "rateLimited" },
    ]);
    const state = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
    }));
    expect(state.users).toHaveLength(3);
    expect(state.jobs).toHaveLength(3);
  });

  it("所属scanが上限を超えるunknownではuserとjobを変更しない", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => seedUser(ctx, "unknown_scan", "untouched@example.com"));
    await t.run(async (ctx) => {
      for (let index = 0; index < 21; index += 1) {
        const shopId = await seedShop(ctx, `店舗${index}`);
        await ctx.db.insert("shopMembers", { shopId, userId, role: "manager", isDeleted: false });
      }
    });

    await expect(t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("unknown_scan"))).resolves.toEqual({
      status: "conflict",
    });
    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
    }));
    expect(state.user).toMatchObject({ email: "untouched@example.com", isDeleted: false });
    expect(state.user).not.toHaveProperty("accountDeletionRequestedAt");
    expect(state.jobs).toEqual([]);
  });

  it("readinessは必須設定不足でClerk user取得・削除を一切行わない", async () => {
    const provider = readinessProvider();
    vi.stubEnv("APP_URL", "");

    await expect(checkAccountDeletionReadiness(provider, getAccountDeletionConfiguration())).resolves.toEqual({
      ready: false,
      code: "provider_configuration_missing",
    });
    expect(provider.assertReady).not.toHaveBeenCalled();
    expect(provider.getUser).not.toHaveBeenCalled();
    expect(provider.deleteUser).not.toHaveBeenCalled();
  });
});

function acceptArgs(subject: string) {
  return {
    issuer: ISSUER,
    clerkUserId: subject,
    requestId: REQUEST_ID,
    rateLimitKey: "c".repeat(64),
  };
}

function stubValidConfiguration() {
  vi.stubEnv("APP_URL", "https://shiftori.example");
  vi.stubEnv("ACCOUNT_DELETION_ENABLED", "true");
  vi.stubEnv("CLERK_SECRET_KEY", "configured-secret");
  vi.stubEnv("CLERK_PUBLISHABLE_KEY", "configured-publishable");
  vi.stubEnv("CLERK_EXPECTED_INSTANCE_ID", "ins_test");
  vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", ISSUER);
}

function readinessProvider() {
  return {
    assertReady: vi.fn(async () => undefined),
    getUser: vi.fn(async () => "found" as const),
    deleteUser: vi.fn(async () => "deleted" as const),
  } satisfies AccountDeletionProvider & {
    assertReady: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    deleteUser: ReturnType<typeof vi.fn>;
  };
}
