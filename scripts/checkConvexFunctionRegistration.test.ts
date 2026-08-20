import { describe, expect, it } from "vitest";
import {
  findRawConvexBuilderImportsInSource,
  shouldCheckConvexFunctionRegistrationFile,
} from "./checkConvexFunctionRegistration";

describe("checkConvexFunctionRegistration", () => {
  it("generated serverからruntime builderを直接importする実装を検出する", () => {
    const source = `
import { query, internalMutation as write, type MutationCtx } from "../_generated/server";
import { action as runAction } from "../_generated/server";
`;

    expect(findRawConvexBuilderImportsInSource(source, "convex/example/queries.ts")).toEqual([
      expect.objectContaining({ importedBuilder: "query", line: 2 }),
      expect.objectContaining({ importedBuilder: "internalMutation", line: 2 }),
      expect.objectContaining({ importedBuilder: "action", line: 3 }),
    ]);
  });

  it("typeとhttpActionとobserved builderは許可する", () => {
    const source = `
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { httpAction, type ActionCtx } from "../_generated/server";
import { observedMutation as mutation } from "../_lib/errorObservability";
`;

    expect(findRawConvexBuilderImportsInSource(source, "convex/example/mutations.ts")).toEqual([]);
  });

  it("namespace importとraw builderのre-exportを検出する", () => {
    const namespaceIssues = findRawConvexBuilderImportsInSource(
      'import * as server from "../_generated/server";',
      "convex/example/namespace.ts",
    );
    const exportIssues = findRawConvexBuilderImportsInSource(
      'export { mutation, type MutationCtx } from "../_generated/server";',
      "convex/example/export.ts",
    );

    expect(namespaceIssues).toEqual([expect.objectContaining({ importedBuilder: "*" })]);
    expect(exportIssues).toEqual([expect.objectContaining({ importedBuilder: "mutation" })]);
  });

  it("wrapper本体とgenerated fileは検査対象外にする", () => {
    expect(shouldCheckConvexFunctionRegistrationFile("convex/recruitment/mutations.ts")).toBe(true);
    expect(shouldCheckConvexFunctionRegistrationFile("convex/_lib/errorObservability.ts")).toBe(false);
    expect(shouldCheckConvexFunctionRegistrationFile("convex/_generated/server.d.ts")).toBe(false);
    expect(shouldCheckConvexFunctionRegistrationFile("src/example.ts")).toBe(false);
  });
});
