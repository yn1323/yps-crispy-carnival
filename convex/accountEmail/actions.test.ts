import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../_generated/api";
import { modules, schema } from "../_test/setup.test-helper";

describe("retired account email action", () => {
  it("旧clientから呼ばれても同期を再試行させない", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.action(api.accountEmail.actions.syncMyPrimaryEmail, { requestId: "legacy-account-email-request" }),
    ).resolves.toEqual({ status: "unavailable", retryable: false });
  });
});
