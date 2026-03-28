import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { modules, schema } from "./setup.test-helper";

describe("convex-test setup", () => {
  it("convexTest インスタンスが生成できる", async () => {
    const t = convexTest(schema, modules);
    expect(t).toBeDefined();
    expect(t.run).toBeTypeOf("function");
    expect(t.mutation).toBeTypeOf("function");
    expect(t.query).toBeTypeOf("function");
  });
});
