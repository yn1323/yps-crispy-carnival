import { v } from "convex/values";
import type { Doc, TableNames } from "../_generated/dataModel";
import { assertDevelopmentSeedEnabled } from "../_lib/config";
import { todayJST } from "../_lib/dateFormat";
import { observedInternalMutation as internalMutation } from "../_lib/errorObservability";
import { generateUUID } from "../_lib/uuid";
import schema from "../schema";
import {
  DEVELOPMENT_SEED_AUDIT_BLOCKED,
  DEVELOPMENT_SEED_AUDIT_COMPLETE,
  DEVELOPMENT_SEED_AUDIT_IN_PROGRESS,
  DEVELOPMENT_SEED_AUDIT_MARKER_NAME,
  DEVELOPMENT_SEED_WORKFLOW_ACTORS_READY,
  DEVELOPMENT_SEED_WORKFLOW_READY_TO_VERIFY,
  encodeDevelopmentSeedClearingState,
  encodeDevelopmentSeedSeedingState,
  getDevelopmentSeedAuditCursorMarker,
  getDevelopmentSeedAuditCursorMarkerName,
  getDevelopmentSeedAuditMarker,
  requireDevelopmentSeedWorkflowState,
} from "./audit";
import { seedDevelopmentActors, seedDevelopmentScenarioGraph } from "./builders";
import {
  assertSeedDate,
  DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
  DEVELOPMENT_SEED_CONTRACT_VERSION,
  DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT,
  DEVELOPMENT_SEED_SCENARIO_KEYS,
} from "./catalog";

const SCHEDULE_AUDIT_PAGE_SIZE = 100;
const CLEAR_BATCH_SIZE = 128;
const DEVELOPMENT_SEED_TABLE_NAMES = Object.keys(schema.tables) as TableNames[];

const scenarioKeyValidator = v.union(
  v.literal("free-capacity"),
  v.literal("trial-ending"),
  v.literal("standard-operations"),
  v.literal("pro-notifications"),
  v.literal("standard-scheduled-change"),
  v.literal("payment-pending"),
  v.literal("payment-failure"),
  v.literal("free-over-limit"),
  v.literal("standard-over-limit"),
);

/** 副作用なしだが、CLI実行時刻を一度だけ固定するためmutationとして提供する。 */
export const preflight = internalMutation({
  args: {},
  returns: v.object({
    contractVersion: v.string(),
    contractFingerprint: v.string(),
    deploymentUrl: v.string(),
    today: v.string(),
    scenarioKeys: v.array(v.string()),
    tableCount: v.number(),
  }),
  handler: async () => {
    const configuration = assertDevelopmentSeedEnabled();
    if (DEVELOPMENT_SEED_TABLE_NAMES.length !== DEVELOPMENT_SEED_EXPECTED_TABLE_COUNT) {
      throw new Error("Development seed table catalog count is stale");
    }
    return {
      contractVersion: DEVELOPMENT_SEED_CONTRACT_VERSION,
      contractFingerprint: DEVELOPMENT_SEED_CONTRACT_FINGERPRINT,
      deploymentUrl: configuration.currentDeploymentUrl,
      today: todayJST(),
      scenarioKeys: [...DEVELOPMENT_SEED_SCENARIO_KEYS],
      tableCount: DEVELOPMENT_SEED_TABLE_NAMES.length,
    };
  },
});

/**
 * system scheduleをcreation-time順にbounded auditする。
 * pendingだけをcancelでき、実行中actionは停止できないため件数をcallerへ返してclearを止める。
 */
export const cancelScheduledFunctions = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    auditToken: v.union(v.string(), v.null()),
  },
  returns: v.object({
    auditToken: v.string(),
    continueCursor: v.string(),
    isDone: v.boolean(),
    cancelledCount: v.number(),
    inProgressCount: v.number(),
  }),
  handler: async (ctx, { cursor, auditToken }) => {
    assertDevelopmentSeedEnabled();
    let marker: Doc<"rateLimits"> | null = null;
    let cursorMarker: Doc<"rateLimits"> | null = null;
    let resolvedAuditToken = auditToken;
    if (cursor === null && auditToken === null) {
      resolvedAuditToken = generateUUID();
      const markerId = await ctx.db.insert("rateLimits", {
        name: DEVELOPMENT_SEED_AUDIT_MARKER_NAME,
        key: resolvedAuditToken,
        value: DEVELOPMENT_SEED_AUDIT_IN_PROGRESS,
        ts: Date.now(),
      });
      marker = await ctx.db.get(markerId);
    } else if (cursor !== null && auditToken) {
      marker = await getDevelopmentSeedAuditMarker(ctx, auditToken);
      cursorMarker = await getDevelopmentSeedAuditCursorMarker(ctx, auditToken);
      if (!cursorMarker || cursorMarker.key !== cursor) {
        throw new Error("Invalid development seed scheduled-function audit cursor");
      }
    }
    if (!resolvedAuditToken || !marker || marker.value < DEVELOPMENT_SEED_AUDIT_IN_PROGRESS) {
      throw new Error("Invalid development seed scheduled-function audit continuation");
    }
    const result = await ctx.db.system.query("_scheduled_functions").paginate({
      cursor,
      numItems: SCHEDULE_AUDIT_PAGE_SIZE,
      maximumRowsRead: SCHEDULE_AUDIT_PAGE_SIZE,
    });
    let cancelledCount = 0;
    let inProgressCount = 0;
    for (const scheduledFunction of result.page) {
      if (scheduledFunction.state.kind === "pending") {
        await ctx.scheduler.cancel(scheduledFunction._id);
        cancelledCount += 1;
      } else if (scheduledFunction.state.kind === "inProgress") {
        inProgressCount += 1;
      }
    }
    const totalInProgressCount = marker.value + inProgressCount;
    if (result.isDone) {
      await ctx.db.patch(marker._id, {
        value: totalInProgressCount === 0 ? DEVELOPMENT_SEED_AUDIT_COMPLETE : DEVELOPMENT_SEED_AUDIT_BLOCKED,
        ts: Date.now(),
      });
      if (cursorMarker) await ctx.db.delete(cursorMarker._id);
    } else if (inProgressCount > 0) {
      await ctx.db.patch(marker._id, { value: totalInProgressCount });
    }
    if (!result.isDone) {
      if (cursorMarker) {
        await ctx.db.patch(cursorMarker._id, { key: result.continueCursor, ts: Date.now() });
      } else {
        await ctx.db.insert("rateLimits", {
          name: getDevelopmentSeedAuditCursorMarkerName(resolvedAuditToken),
          key: result.continueCursor,
          value: 0,
          ts: Date.now(),
        });
      }
    }
    return {
      auditToken: resolvedAuditToken,
      continueCursor: result.continueCursor,
      isDone: result.isDone,
      cancelledCount,
      inProgressCount,
    };
  },
});

/**
 * internal専用でもtableIndexを安全証明とは扱わない。
 * 各batchでguardとlive schedule不在を再確認し、auditを飛ばした破壊実行をfail closedにする。
 */
export const clearAllTables = internalMutation({
  args: { tableIndex: v.number(), auditToken: v.string() },
  returns: v.object({
    done: v.boolean(),
    nextTableIndex: v.number(),
    deletedCount: v.number(),
    tableName: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { tableIndex, auditToken }) => {
    assertDevelopmentSeedEnabled();
    if (!Number.isSafeInteger(tableIndex) || tableIndex < 0 || tableIndex > DEVELOPMENT_SEED_TABLE_NAMES.length) {
      throw new Error("Invalid development seed table index");
    }
    const { marker: auditMarker, state } = await requireDevelopmentSeedWorkflowState(
      ctx,
      auditToken,
      DEVELOPMENT_SEED_TABLE_NAMES.length,
      DEVELOPMENT_SEED_SCENARIO_KEYS.length,
    );
    if (state.phase !== "clearing") {
      throw new Error("Development seed workflow is not clearing tables");
    }
    if (tableIndex !== state.nextTableIndex) {
      throw new Error("Development seed clear table index does not match server progress");
    }

    const tableName = DEVELOPMENT_SEED_TABLE_NAMES[tableIndex];
    const documents = await ctx.db.query(tableName).take(CLEAR_BATCH_SIZE);
    const documentsToDelete =
      tableName === "rateLimits" ? documents.filter((document) => document._id !== auditMarker._id) : documents;
    for (const document of documentsToDelete) await ctx.db.delete(tableName, document._id);
    const nextTableIndex = documents.length === CLEAR_BATCH_SIZE ? tableIndex : tableIndex + 1;
    await ctx.db.patch(auditMarker._id, {
      value:
        nextTableIndex === DEVELOPMENT_SEED_TABLE_NAMES.length
          ? DEVELOPMENT_SEED_WORKFLOW_ACTORS_READY
          : encodeDevelopmentSeedClearingState(nextTableIndex, DEVELOPMENT_SEED_TABLE_NAMES.length),
    });
    return {
      done: nextTableIndex === DEVELOPMENT_SEED_TABLE_NAMES.length,
      nextTableIndex,
      deletedCount: documentsToDelete.length,
      tableName,
    };
  },
});

export const seedActors = internalMutation({
  args: { today: v.string(), auditToken: v.string() },
  returns: v.object({ createdCount: v.number() }),
  handler: async (ctx, { today, auditToken }) => {
    const configuration = assertDevelopmentSeedEnabled();
    const { marker, state } = await requireDevelopmentSeedWorkflowState(
      ctx,
      auditToken,
      DEVELOPMENT_SEED_TABLE_NAMES.length,
      DEVELOPMENT_SEED_SCENARIO_KEYS.length,
    );
    if (state.phase !== "actorsReady") {
      throw new Error("Development seed workflow is not ready to seed actors");
    }
    assertSeedDate(today);
    const result = await seedDevelopmentActors(ctx, configuration.primaryAuthTokenIdentifier);
    await ctx.db.patch(marker._id, {
      value: encodeDevelopmentSeedSeedingState(0, DEVELOPMENT_SEED_SCENARIO_KEYS.length),
    });
    return result;
  },
});

export const seedScenario = internalMutation({
  args: { scenarioKey: scenarioKeyValidator, today: v.string(), auditToken: v.string() },
  returns: v.object({ scenarioKey: v.string(), insertedCount: v.number() }),
  handler: async (ctx, { scenarioKey, today, auditToken }) => {
    const configuration = assertDevelopmentSeedEnabled();
    const { marker, state } = await requireDevelopmentSeedWorkflowState(
      ctx,
      auditToken,
      DEVELOPMENT_SEED_TABLE_NAMES.length,
      DEVELOPMENT_SEED_SCENARIO_KEYS.length,
    );
    if (state.phase !== "seeding") {
      throw new Error("Development seed workflow is not ready to seed a scenario");
    }
    if (scenarioKey !== DEVELOPMENT_SEED_SCENARIO_KEYS[state.nextScenarioIndex]) {
      throw new Error("Development seed scenario does not match server progress");
    }
    assertSeedDate(today);
    const result = await seedDevelopmentScenarioGraph(
      ctx,
      scenarioKey,
      today,
      configuration.primaryAuthTokenIdentifier,
    );
    const nextScenarioIndex = state.nextScenarioIndex + 1;
    await ctx.db.patch(marker._id, {
      value:
        nextScenarioIndex === DEVELOPMENT_SEED_SCENARIO_KEYS.length
          ? DEVELOPMENT_SEED_WORKFLOW_READY_TO_VERIFY
          : encodeDevelopmentSeedSeedingState(nextScenarioIndex, DEVELOPMENT_SEED_SCENARIO_KEYS.length),
    });
    return { scenarioKey, insertedCount: result.insertedCount };
  },
});
