import { type FunctionReference, makeFunctionReference } from "convex/server";
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modules, schema } from "../_test/setup.test-helper";
import { DEVELOPMENT_SEED_CONTRACT_FINGERPRINT } from "./catalog";

type PreflightResult = {
  contractVersion: string;
  contractFingerprint: string;
  deploymentUrl: string;
  today: string;
  scenarioKeys: string[];
  tableCount: number;
};
type CancelResult = {
  auditToken: string;
  continueCursor: string;
  isDone: boolean;
  cancelledCount: number;
  inProgressCount: number;
};
type ClearResult = {
  done: boolean;
  nextTableIndex: number;
  deletedCount: number;
  tableName: string | null;
};

const preflightRef = makeFunctionReference<"mutation", Record<string, never>, PreflightResult>(
  "developmentSeed/mutations:preflight",
) as unknown as FunctionReference<"mutation", "internal", Record<string, never>, PreflightResult>;
const cancelRef = makeFunctionReference<"mutation", { cursor: string | null; auditToken: string | null }, CancelResult>(
  "developmentSeed/mutations:cancelScheduledFunctions",
) as unknown as FunctionReference<
  "mutation",
  "internal",
  { cursor: string | null; auditToken: string | null },
  CancelResult
>;
const clearRef = makeFunctionReference<"mutation", { tableIndex: number; auditToken: string }, ClearResult>(
  "developmentSeed/mutations:clearAllTables",
) as unknown as FunctionReference<"mutation", "internal", { tableIndex: number; auditToken: string }, ClearResult>;
const seedActorsRef = makeFunctionReference<
  "mutation",
  { today: string; auditToken: string },
  { createdCount: number; primaryAuthTokenIdentifier: string }
>("developmentSeed/mutations:seedActors") as unknown as FunctionReference<
  "mutation",
  "internal",
  { today: string; auditToken: string },
  { createdCount: number; primaryAuthTokenIdentifier: string }
>;

function configureDevelopmentSeed() {
  vi.stubEnv("DEVELOPMENT_SEED_ENABLED", "true");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://seed-development.convex.cloud");
  vi.stubEnv("DEVELOPMENT_SEED_DEPLOYMENT_URL", "https://seed-development.convex.cloud/");
  vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "dry-run");
}

async function completeScheduledFunctionAudit(t: TestConvex<typeof schema>): Promise<string> {
  let cursor: string | null = null;
  let auditToken: string | null = null;
  while (true) {
    const result: CancelResult = await t.mutation(cancelRef, { cursor, auditToken });
    auditToken = result.auditToken;
    if (result.isDone) return result.auditToken;
    cursor = result.continueCursor;
  }
}

async function clearTablesBefore(
  t: TestConvex<typeof schema>,
  auditToken: string,
  targetTableIndex: number,
): Promise<void> {
  let tableIndex = 0;
  while (tableIndex < targetTableIndex) {
    const result: ClearResult = await t.mutation(clearRef, { tableIndex, auditToken });
    expect(result.done).toBe(false);
    tableIndex = result.nextTableIndex;
  }
  expect(tableIndex).toBe(targetTableIndex);
}

describe("development seed internal mutations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T01:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("3条件guardが揃わなければ最初のwrite前に拒否する", async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv("DEVELOPMENT_SEED_ENABLED", "true");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://seed-development.convex.cloud");
    vi.stubEnv("DEVELOPMENT_SEED_DEPLOYMENT_URL", "https://other.convex.cloud");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "dry-run");

    await expect(
      t.mutation(seedActorsRef, { today: "2026-08-20", auditToken: "guard-stops-before-audit" }),
    ).rejects.toThrowError(/deployment does not match/);
    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toEqual([]);
  });

  it("preflightはJST今日・固定scenario・schema table数だけを返す", async () => {
    const t = convexTest(schema, modules);
    configureDevelopmentSeed();

    await expect(t.mutation(preflightRef, {})).resolves.toEqual({
      contractVersion: "development-seed-v2",
      contractFingerprint: DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
      deploymentUrl: "https://seed-development.convex.cloud",
      today: "2026-08-20",
      scenarioKeys: [
        "free-capacity",
        "trial-ending",
        "standard-operations",
        "pro-notifications",
        "standard-scheduled-change",
        "payment-pending",
        "payment-grace",
        "free-over-limit",
        "standard-over-limit",
      ],
      tableCount: 66,
    });
  });

  it("complete scheduler audit前のclearを拒否し、pendingをcancel後だけ進める", async () => {
    const t = convexTest(schema, modules);
    configureDevelopmentSeed();
    await t.run(async (ctx) => {
      await ctx.scheduler.runAfter(60_000, preflightRef, {});
    });

    await expect(t.mutation(clearRef, { tableIndex: 0, auditToken: "missing-audit" })).rejects.toThrowError(
      /scheduled-function audit/,
    );
    const cancelled = await t.mutation(cancelRef, { cursor: null, auditToken: null });
    expect(cancelled).toMatchObject({ isDone: true, cancelledCount: 1, inProgressCount: 0 });
    await expect(t.mutation(clearRef, { tableIndex: 0, auditToken: cancelled.auditToken })).resolves.toMatchObject({
      deletedCount: 0,
      tableName: "rateLimits",
    });
  });

  it("server進捗を飛ばして最終tableをclearできず、既存sentinelを残す", async () => {
    const t = convexTest(schema, modules);
    configureDevelopmentSeed();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        authTokenIdentifier: "seed-clear-order-sentinel",
        name: "[SEED] clear order sentinel",
        email: "clear-order-sentinel@seed.example.test",
        emailNormalized: "clear-order-sentinel@seed.example.test",
        role: "manager",
        isDeleted: false,
      });
    });
    const auditToken = await completeScheduledFunctionAudit(t);
    const finalTableIndex = Object.keys(schema.tables).length - 1;

    await expect(t.mutation(clearRef, { tableIndex: finalTableIndex, auditToken })).rejects.toThrowError(
      /does not match server progress/,
    );
    await expect(
      t.run(async (ctx) => (await ctx.db.query("users").collect()).map((user) => user.authTokenIdentifier)),
    ).resolves.toEqual(["seed-clear-order-sentinel"]);
    await expect(
      t.run(async (ctx) => (await ctx.db.query("rateLimits").collect()).map((marker) => marker.key)),
    ).resolves.toEqual([auditToken]);
  });

  it("clear途中ではactor seedを開始せず、server進捗markerを残す", async () => {
    const t = convexTest(schema, modules);
    configureDevelopmentSeed();
    const auditToken = await completeScheduledFunctionAudit(t);

    await expect(t.mutation(clearRef, { tableIndex: 0, auditToken })).resolves.toMatchObject({
      done: false,
      nextTableIndex: 1,
    });
    await expect(t.mutation(seedActorsRef, { today: "2026-08-20", auditToken })).rejects.toThrowError(
      /not ready to seed actors/,
    );
    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toEqual([]);
    await expect(
      t.run(async (ctx) => (await ctx.db.query("rateLimits").collect()).map((marker) => marker.key)),
    ).resolves.toEqual([auditToken]);
  });

  it("100件を超えるsystem scheduleをcursorで全page監査してpendingだけをcancelする", async () => {
    const t = convexTest(schema, modules);
    configureDevelopmentSeed();
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.scheduler.runAfter(60_000 + index, preflightRef, {});
      }
    });

    const first = await t.mutation(cancelRef, { cursor: null, auditToken: null });
    expect(first).toMatchObject({ isDone: false, cancelledCount: 100, inProgressCount: 0 });
    await expect(t.mutation(clearRef, { tableIndex: 0, auditToken: first.auditToken })).rejects.toThrowError(
      /complete scheduled-function audit/,
    );
    await expect(
      t.mutation(cancelRef, {
        cursor: "caller-controlled-cursor",
        auditToken: first.auditToken,
      }),
    ).rejects.toThrowError(/audit cursor/);
    const second = await t.mutation(cancelRef, {
      cursor: first.continueCursor,
      auditToken: first.auditToken,
    });
    expect(second).toMatchObject({ isDone: true, cancelledCount: 1, inProgressCount: 0 });
    expect(second.auditToken).toBe(first.auditToken);
    const active = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (scheduled) => scheduled.state.kind === "pending" || scheduled.state.kind === "inProgress",
      ),
    );
    expect(active).toEqual([]);
    await expect(
      t.run(async (ctx) => (await ctx.db.query("rateLimits").collect()).map((marker) => marker.key)),
    ).resolves.toEqual([first.auditToken]);
  });

  it("tableを128件ずつ削除し、同じtableの残りを次回へ送る", async () => {
    const t = convexTest(schema, modules);
    configureDevelopmentSeed();
    await t.run(async (ctx) => {
      for (let index = 0; index < 129; index += 1) {
        await ctx.db.insert("users", {
          authTokenIdentifier: `seed-clear-${index}`,
          name: `[SEED] clear ${index}`,
          email: `clear-${index}@seed.example.test`,
          emailNormalized: `clear-${index}@seed.example.test`,
          role: "manager",
          isDeleted: false,
        });
      }
    });
    const userTableIndex = Object.keys(schema.tables).indexOf("users");
    const auditToken = await completeScheduledFunctionAudit(t);
    await clearTablesBefore(t, auditToken, userTableIndex);

    const first = await t.mutation(clearRef, { tableIndex: userTableIndex, auditToken });
    expect(first).toEqual({
      done: false,
      nextTableIndex: userTableIndex,
      deletedCount: 128,
      tableName: "users",
    });
    const second = await t.mutation(clearRef, { tableIndex: userTableIndex, auditToken });
    expect(second).toEqual({
      done: false,
      nextTableIndex: userTableIndex + 1,
      deletedCount: 1,
      tableName: "users",
    });
    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toEqual([]);
  });
});
