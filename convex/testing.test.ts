import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import { modules, schema } from "./_test/setup.test-helper";

describe("E2E testing helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects clearAllTables when E2E testing helpers are disabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.testing.clearAllTables, {})).rejects.toThrow("E2E testing helpers are disabled");
  });

  it("allows clearAllTables when E2E testing helpers are enabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "true");
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkId: "owner_test",
        name: "Test Owner",
        email: "owner@example.com",
        role: "manager",
        isDeleted: false,
      });
    });

    await expect(t.mutation(internal.testing.clearAllTables, {})).resolves.toEqual(
      expect.objectContaining({ cleared: expect.arrayContaining(["users"]) }),
    );
    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(users).toEqual([]);
  });

  it("rejects direct seed helpers when E2E testing helpers are disabled", async () => {
    vi.stubEnv("E2E_TESTING_ENABLED", "");
    const t = convexTest(schema, modules);

    await expect(t.mutation(internal.testing.seedSubmitTestData, {})).rejects.toThrow(
      "E2E testing helpers are disabled",
    );
  });
});
