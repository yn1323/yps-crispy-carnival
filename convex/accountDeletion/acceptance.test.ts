import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedOrganizationManagerShop, seedUser } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { checkAccountDeletionReadiness } from "./actions";
import { getAccountDeletionConfiguration } from "./config";
import { type AccountDeletionProvider, AccountDeletionProviderError } from "./provider";

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

  it("既存userの業務識別情報を保持したまま利用停止し、jobを一件だけ作る", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) => {
      const id = await seedUser(ctx, "existing_user", "pii@example.com");
      await ctx.db.patch(id, { name: "退会前ユーザー", emailNormalized: "pii@example.com" });
      return id;
    });

    await expect(t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("existing_user"))).resolves.toEqual({
      status: "accepted",
    });

    const state = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      jobs: await ctx.db.query("accountDeletionJobs").collect(),
    }));
    expect(state.user).toMatchObject({
      authTokenIdentifier: `${ISSUER}|existing_user`,
      name: "退会前ユーザー",
      email: "pii@example.com",
      emailNormalized: "pii@example.com",
      isDeleted: true,
      accountDeletionRequestedAt: Date.now(),
    });
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

  it("actionRequiredを含む既存jobは設定検証とrequest IDより先に202へ収束する", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.accountDeletion.mutations.accept, acceptArgs("idempotent_subject"));
    await t.run(async (ctx) => {
      const job = await ctx.db.query("accountDeletionJobs").unique();
      if (!job) throw new Error("job not found");
      await ctx.db.patch(job._id, { status: "actionRequired", version: job.version + 1 });
    });
    vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "");

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
    ["APP_URL", "APP_URL", ""],
    ["provider secret", "CLERK_SECRET_KEY", ""],
    ["publishable key", "VITE_CLERK_PUBLISHABLE_KEY", ""],
    ["issuer", "CLERK_JWT_ISSUER_DOMAIN", ""],
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
        const organization = await seedOrganizationManagerShop(ctx, {
          subject: `unknown_scan_source_${index}`,
          shopName: `店舗${index}`,
        });
        await ctx.db.patch(organization.personId, { userId, updatedAt: Date.now() });
        await ctx.db.patch(organization.memberId, { userId, updatedAt: Date.now() });
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

  it("readinessはClerk Instance不一致を安全なcodeで返し、user取得・削除へ進まない", async () => {
    const provider = readinessProvider();
    provider.assertReady.mockRejectedValue(new AccountDeletionProviderError(false, "provider_instance_mismatch"));

    await expect(checkAccountDeletionReadiness(provider, getAccountDeletionConfiguration())).resolves.toEqual({
      ready: false,
      code: "provider_instance_mismatch",
    });
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
  vi.stubEnv("CLERK_SECRET_KEY", "configured-secret");
  vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "configured-publishable");
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
