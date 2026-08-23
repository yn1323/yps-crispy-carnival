import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatConvexPublicSurface,
  inspectConvexPublicSurface,
  shouldInspectConvexPublicFunctionFile,
} from "./inspectConvexPublicSurface";

const temporaryRoots: string[] = [];

const createFixtureRepository = async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "convex-public-surface-"));
  temporaryRoots.push(rootDir);

  const files: Record<string, string> = {
    "convex/_lib/functions.ts": `
import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { observedMutation as mutation, observedQuery as query } from "./errorObservability";

export const managerQuery = customQuery(query, { args: {}, input: async () => ({ ctx: {}, args: {} }) });
export const staffSessionQuery = customQuery(query, { args: {}, input: async () => ({ ctx: {}, args: {} }) });
export function managerLimitRecoveryMutation(capability: string) {
  return customMutation(mutation, { args: {}, input: async () => ({ ctx: {}, args: { capability } }) });
}
`,
    "convex/_lib/errorObservability.ts": `
export const observedQuery = (definition: unknown) => definition;
export const observedMutation = (definition: unknown) => definition;
export const observedAction = (definition: unknown) => definition;
`,
    "convex/alpha/actions.ts": `
import { observedAction as action } from "../_lib/errorObservability";
export const run = action({
  args: {},
  handler: async () => null,
});
`,
    "convex/recovery/mutations.ts": `
import { managerLimitRecoveryMutation } from "../_lib/functions";
export const resolve = managerLimitRecoveryMutation("resolve")({
  args: {},
  returns: null,
  handler: async () => null,
});
`,
    "convex/zeta/queries.ts": `
import { managerQuery } from "../_lib/functions";
export const list = managerQuery({
  args: { paginationOpts: null },
  returns: null,
  handler: async (ctx, args) => {
    await ctx.db.query("items").filter(() => true).collect();
    await ctx.db.query("items").take(10);
    await ctx.db.query("items").paginate(args.paginationOpts);
    return [];
  },
});
`,
    "convex/testing.ts": `
import { observedQuery as query } from "./_lib/errorObservability";
export const mustBeExcluded = query({ args: {}, returns: null, handler: async () => null });
`,
    "convex/ignored.test.ts": `
import { observedQuery as query } from "./_lib/errorObservability";
export const mustAlsoBeExcluded = query({ args: {}, returns: null, handler: async () => null });
`,
    "convex/_generated/example.ts": `
export const generated = true;
`,
    "convex/zeta/queries.test.ts": `
import { api } from "../_generated/api";
export const directTestReference = api.zeta.queries.list;
`,
    "convex/http.ts": `
import { httpRouter } from "convex/server";
import { options, submit } from "./contact/httpActions";
import { webhookHandler } from "./provider/webhook";
const http = httpRouter();
http.route({ path: "/provider/webhook", method: "POST", handler: webhookHandler });
http.route({ path: "/contact", method: "POST", handler: submit });
http.route({ path: "/contact", method: "OPTIONS", handler: options });
export default http;
`,
    "src/feature.ts": `
import { api } from "../convex/_generated/api";
export const directClientReference = api.zeta.queries.list;
`,
  };

  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }

  return rootDir;
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((rootDir) => rm(rootDir, { recursive: true, force: true })));
});

describe("inspectConvexPublicSurface", () => {
  it("wrapper経由とraw public functionを分類し、参照とhandler内read候補を列挙する", async () => {
    const rootDir = await createFixtureRepository();
    const inventory = await inspectConvexPublicSurface(rootDir);

    expect(inventory.wrappers).toEqual([
      expect.objectContaining({ name: "managerLimitRecoveryMutation", functionKind: "mutation", factory: true }),
      expect.objectContaining({ name: "managerQuery", functionKind: "query", trustBoundary: "manager" }),
      expect.objectContaining({ name: "staffSessionQuery", functionKind: "query", trustBoundary: "staff-session" }),
    ]);
    expect(inventory.functions.map(({ modulePath, functionName }) => `${modulePath}:${functionName}`)).toEqual([
      "convex/alpha/actions.ts:run",
      "convex/recovery/mutations.ts:resolve",
      "convex/zeta/queries.ts:list",
    ]);

    const rawAction = inventory.functions[0];
    expect(rawAction).toMatchObject({
      builder: "observedAction",
      functionKind: "action",
      registration: "raw-public",
      trustBoundary: "public-raw",
      hasArgsValidator: true,
      hasReturnsValidator: false,
      hasSrcApiReference: false,
      hasConvexTestApiReference: false,
    });
    expect(rawAction?.manualReviewCandidates).toEqual([
      "missing-returns-validator",
      "no-convex-test-api-reference",
      "no-src-api-reference",
      "raw-public-boundary",
    ]);

    expect(inventory.functions[1]).toMatchObject({
      builder: "managerLimitRecoveryMutation",
      functionKind: "mutation",
      registration: "common-wrapper",
      trustBoundary: "manager",
    });
    expect(inventory.functions[2]).toMatchObject({
      apiReference: "api.zeta.queries.list",
      hasSrcApiReference: true,
      hasConvexTestApiReference: true,
      readCandidates: { collect: 1, filter: 1, take: 1, paginate: 1 },
      manualReviewCandidates: ["collect-in-handler"],
    });
  });

  it("HTTP routeを安定sortし、providerとanonymousのtrust boundaryを区別する", async () => {
    const rootDir = await createFixtureRepository();
    const inventory = await inspectConvexPublicSurface(rootDir);

    expect(inventory.httpRoutes).toEqual([
      expect.objectContaining({
        path: "/contact",
        method: "OPTIONS",
        handlerModule: "convex/contact/httpActions.ts",
        handlerExport: "options",
        trustBoundary: "anonymous-http",
      }),
      expect.objectContaining({ path: "/contact", method: "POST", handlerExport: "submit" }),
      expect.objectContaining({
        path: "/provider/webhook",
        method: "POST",
        trustBoundary: "provider-service-http",
      }),
    ]);
  });

  it("root指定の結果をJSONとMarkdownへ決定的に出力し、絶対pathを含めない", async () => {
    const rootDir = await createFixtureRepository();
    const inventory = await inspectConvexPublicSurface(rootDir);
    const json = formatConvexPublicSurface(inventory, "json");
    const markdown = formatConvexPublicSurface(inventory, "markdown");

    expect(formatConvexPublicSurface(inventory, "json")).toBe(json);
    expect(json).not.toContain(rootDir);
    expect(JSON.parse(json)).toEqual(inventory);
    expect(markdown).toContain("# Convex public surface inventory");
    expect(markdown).toContain("Manual-review candidates are not vulnerability or performance findings.");
    expect(markdown).toContain("`convex/zeta/queries.ts`");
  });

  it("generated、test、testing、private directoryをpublic function対象から除外する", () => {
    expect(shouldInspectConvexPublicFunctionFile("convex/shop/queries.ts")).toBe(true);
    expect(shouldInspectConvexPublicFunctionFile("convex/_generated/api.ts")).toBe(false);
    expect(shouldInspectConvexPublicFunctionFile("convex/shop/queries.test.ts")).toBe(false);
    expect(shouldInspectConvexPublicFunctionFile("convex/testing.ts")).toBe(false);
    expect(shouldInspectConvexPublicFunctionFile("convex/_lib/functions.ts")).toBe(false);
  });
});
