import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DEVELOPMENT_SEED_AUDIT_MARKER_NAME = "developmentSeedSchedulerAudit";
const DEVELOPMENT_SEED_AUDIT_CURSOR_MARKER_NAME_PREFIX = "developmentSeedSchedulerAuditCursor:";
export const DEVELOPMENT_SEED_AUDIT_IN_PROGRESS = 0;
export const DEVELOPMENT_SEED_AUDIT_COMPLETE = -1;
export const DEVELOPMENT_SEED_AUDIT_BLOCKED = -2;

const DEVELOPMENT_SEED_CLEAR_PROGRESS_BASE = -100;
const DEVELOPMENT_SEED_ACTORS_READY = -1_000;
const DEVELOPMENT_SEED_SCENARIO_PROGRESS_BASE = -1_100;
const DEVELOPMENT_SEED_READY_TO_VERIFY = -1_200;

export type DevelopmentSeedWorkflowState =
  | { phase: "schedulerAudit"; inProgressCount: number }
  | { phase: "blocked" }
  | { phase: "clearing"; nextTableIndex: number }
  | { phase: "actorsReady" }
  | { phase: "seeding"; nextScenarioIndex: number }
  | { phase: "readyToVerify" };

type ReadCtx = Pick<QueryCtx | MutationCtx, "db">;

export async function getDevelopmentSeedAuditMarker(
  ctx: ReadCtx,
  auditToken: string,
): Promise<Doc<"rateLimits"> | null> {
  if (!auditToken) return null;
  return await ctx.db
    .query("rateLimits")
    .withIndex("name", (q) => q.eq("name", DEVELOPMENT_SEED_AUDIT_MARKER_NAME).eq("key", auditToken))
    .unique();
}

export async function getDevelopmentSeedAuditCursorMarker(
  ctx: ReadCtx,
  auditToken: string,
): Promise<Doc<"rateLimits"> | null> {
  if (!auditToken) return null;
  return await ctx.db
    .query("rateLimits")
    .withIndex("name", (q) => q.eq("name", `${DEVELOPMENT_SEED_AUDIT_CURSOR_MARKER_NAME_PREFIX}${auditToken}`))
    .unique();
}

export function getDevelopmentSeedAuditCursorMarkerName(auditToken: string): string {
  return `${DEVELOPMENT_SEED_AUDIT_CURSOR_MARKER_NAME_PREFIX}${auditToken}`;
}

export function encodeDevelopmentSeedClearingState(nextTableIndex: number, tableCount: number): number {
  if (!Number.isSafeInteger(nextTableIndex) || nextTableIndex < 0 || nextTableIndex >= tableCount) {
    throw new Error("Invalid development seed server clear progress");
  }
  if (nextTableIndex === 0) return DEVELOPMENT_SEED_AUDIT_COMPLETE;
  return DEVELOPMENT_SEED_CLEAR_PROGRESS_BASE - nextTableIndex;
}

export function encodeDevelopmentSeedSeedingState(nextScenarioIndex: number, scenarioCount: number): number {
  if (!Number.isSafeInteger(nextScenarioIndex) || nextScenarioIndex < 0 || nextScenarioIndex >= scenarioCount) {
    throw new Error("Invalid development seed server scenario progress");
  }
  return DEVELOPMENT_SEED_SCENARIO_PROGRESS_BASE - nextScenarioIndex;
}

export const DEVELOPMENT_SEED_WORKFLOW_ACTORS_READY = DEVELOPMENT_SEED_ACTORS_READY;
export const DEVELOPMENT_SEED_WORKFLOW_READY_TO_VERIFY = DEVELOPMENT_SEED_READY_TO_VERIFY;

export function decodeDevelopmentSeedWorkflowState(
  marker: Doc<"rateLimits">,
  tableCount: number,
  scenarioCount: number,
): DevelopmentSeedWorkflowState {
  if (marker.value >= DEVELOPMENT_SEED_AUDIT_IN_PROGRESS) {
    return { phase: "schedulerAudit", inProgressCount: marker.value };
  }
  if (marker.value === DEVELOPMENT_SEED_AUDIT_BLOCKED) return { phase: "blocked" };
  if (marker.value === DEVELOPMENT_SEED_AUDIT_COMPLETE) return { phase: "clearing", nextTableIndex: 0 };

  const clearTableIndex = DEVELOPMENT_SEED_CLEAR_PROGRESS_BASE - marker.value;
  if (clearTableIndex > 0 && clearTableIndex < tableCount) {
    return { phase: "clearing", nextTableIndex: clearTableIndex };
  }
  if (marker.value === DEVELOPMENT_SEED_ACTORS_READY) return { phase: "actorsReady" };

  const scenarioIndex = DEVELOPMENT_SEED_SCENARIO_PROGRESS_BASE - marker.value;
  if (scenarioIndex >= 0 && scenarioIndex < scenarioCount) {
    return { phase: "seeding", nextScenarioIndex: scenarioIndex };
  }
  if (marker.value === DEVELOPMENT_SEED_READY_TO_VERIFY) return { phase: "readyToVerify" };
  throw new Error("Development seed audit marker has an invalid workflow state");
}

/**
 * 完了した全履歴audit、その後に新しいscheduled functionが作られていないこと、
 * serverが所有する現在phaseを同時に証明する。
 */
export async function requireDevelopmentSeedWorkflowState(
  ctx: ReadCtx,
  auditToken: string,
  tableCount: number,
  scenarioCount: number,
) {
  const marker = await getDevelopmentSeedAuditMarker(ctx, auditToken);
  if (!marker) {
    throw new Error("Development seed requires a complete scheduled-function audit");
  }
  const state = decodeDevelopmentSeedWorkflowState(marker, tableCount, scenarioCount);
  if (state.phase === "schedulerAudit" || state.phase === "blocked") {
    throw new Error("Development seed requires a complete scheduled-function audit");
  }
  const latestScheduledFunction = await ctx.db.system.query("_scheduled_functions").order("desc").first();
  if (latestScheduledFunction && latestScheduledFunction._creationTime > marker.ts) {
    throw new Error("Development seed scheduled-function audit is stale");
  }
  return { marker, state };
}
