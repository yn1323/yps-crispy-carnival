"use node";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ConvexError, type Infer, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import {
  AI_SHIFT_DRAFT_EFFORTS,
  type AiShiftDraftEffort,
  getAiShiftDraftSettings,
  getAnthropicApiKey,
  isDebugModeEnabled,
} from "../_lib/config";
import {
  observedAction as action,
  expectedConvexError,
  observedInternalAction as internalAction,
} from "../_lib/errorObservability";
import {
  AI_DRAFT_FAILURE_KINDS,
  type AiDraftFailureKind,
  classifyAiDraftApiError,
} from "./autoCreate/ai/aiDraftFailure";
import {
  type AiDraftMode,
  type AiDraftSource,
  buildAiDraftData,
  buildAiDraftUserMessage,
  getAiDraftSystemPrompt,
} from "./autoCreate/ai/aiDraftPrompt";
import { aiDraftOutputSchema } from "./autoCreate/ai/aiDraftSchema";
import { type ApplyAiDraftResult, applyAiDraft } from "./autoCreate/ai/applyAiDraft";
import { evaluateDraft } from "./autoCreate/ai/draftMetrics";
import { buildTimeGrid, countWorkedCells, type TimeGrid } from "./autoCreate/ai/timeGrid";
import { buildAutoAssignments } from "./autoCreate/buildAutoAssignments";
import type { AutoCreatedShift } from "./autoCreate/types";
import type { PreparedAiDraftRequest } from "./mutations";

// シフトのAI作成。AIが希望、必要人数、メモから勤務を一から作る。
// 環境変数で、決まった手順で作った下書きをAIが見直す作り方にも切り替えられる。
// どちらの作り方でも、AIが返した勤務は1件ずつ検査し、決まりに合うものだけを使う。
// 作った勤務は返すだけで、保存しない。画面が下書きへ入れ、店長が保存する。
// 外部のAIを呼ぶ処理は内部のactionに置くのが原則だが、店長が結果を待って受け取る操作なので、公開のactionから直接呼ぶ。
// 結果を保存して後から取りに行く形にすると、保存先と状態の管理が増えるためである。

/** 100万トークンあたりの料金（ドル）。送る量が10万トークン以下の場合。料金を知っているモデルだけを持つ。 */
const PRICES_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
};
const STANDARD_PRICE_INPUT_TOKEN_LIMIT = 100_000;
/** 返答の上限が16,000トークンまでの呼び出しを待つ上限。店長が画面で待つため、長く待たせずに失敗として返す。 */
const REQUEST_TIMEOUT_MS = 90_000;
/** 返答の上限を大きくした呼び出しを待つ上限。actionの実行時間の上限（10分）より短くする。 */
const LONG_REQUEST_TIMEOUT_MS = 9 * 60_000;
const STANDARD_MAX_TOKENS = 16_000;
/** 一から作らせた結果を使う下限。決まった手順で作れる勤務時間の、この数で割った量に届かなければ使わない。 */
const SCRATCH_MIN_COVERAGE_DIVISOR = 2;
/** 日ごとに分けて呼ぶときに、同時に呼ぶ数。 */
const DAY_REQUEST_CONCURRENCY = 16;
/** 日ごとに分けて呼ぶときの、1回の返答の上限と、待つ時間の上限。1日分は、考える分を含めて2万トークンほどになる。 */
const DAY_REQUEST_MAX_TOKENS = 32_000;
const DAY_REQUEST_TIMEOUT_MS = 180_000;
/** 開発用の環境で、AIが返した本文をログへ書き出す長さの上限。 */
const DEBUG_OUTPUT_MAX_CHARS = 8_000;
/** 構造化出力のスキーマ。返答は自分で読むため、SDKに自動で読ませる部分は渡さない。途中で切れた返答で例外にしないためである。 */
const AI_DRAFT_OUTPUT_FORMAT = (() => {
  const { type, schema } = zodOutputFormat(aiDraftOutputSchema);
  return { type, schema };
})();

type AiDraftCallResult =
  | { ok: false; failure: "billing" | "busy" | "declined" | "unavailable"; detail: string; call?: AiDraftCallSummary }
  | { ok: true; result: ApplyAiDraftResult; returnedCount: number; call: AiDraftCallSummary };

type AiDraftCallSummary = {
  seconds: number;
  usage: { inputTokens: number; outputTokens: number; thinkingTokens: number | null };
  costUsd: number | null;
  stopReason: string | null;
};

/**
 * AIを呼び、返ってきた勤務を検査して、下書きへ入れる。
 * 失敗は投げずに、画面で伝え分ける種類にして返す。応答の本文とメモは、結果にもログにも残さない。
 */
async function callAiDraft(args: {
  source: AiDraftSource;
  grid: TimeGrid;
  mode: AiDraftMode;
  draft: readonly AutoCreatedShift[];
  /** 決まった手順で作れる勤務の件数。一から作る場合に、返す量の見当としてAIへ伝える。 */
  expectedShiftCount?: number;
  dates?: ReadonlySet<string>;
  model: string;
  effort: AiShiftDraftEffort;
  maxTokens: number;
  /** 待つ時間の上限。省くと、返答の上限の大きさから決める。 */
  timeoutMs?: number;
}): Promise<AiDraftCallResult> {
  const { source, grid, mode } = args;
  const data = buildAiDraftData({
    input: source.input,
    grid,
    positions: source.positions,
    notes: source.notes,
    draft: mode === "revise" ? args.draft : null,
    ...(args.dates ? { dates: args.dates } : {}),
  });
  // 返答の上限が大きい呼び出しは長くかかるため、待つ時間を延ばし、やり直しをしない。
  const isLong = args.maxTokens > STANDARD_MAX_TOKENS;
  const client = new Anthropic({
    apiKey: getAnthropicApiKey(),
    timeout: args.timeoutMs ?? (isLong ? LONG_REQUEST_TIMEOUT_MS : REQUEST_TIMEOUT_MS),
    maxRetries: args.timeoutMs === undefined && isLong ? 0 : 1,
  });
  const startedAt = Date.now();
  // 返答を少しずつ受け取る。大きな返答を1回で待つと、途中で接続が切れるためである。
  const stream = client.messages.stream({
    model: args.model,
    max_tokens: args.maxTokens,
    system: getAiDraftSystemPrompt(mode),
    messages: [{ role: "user", content: buildAiDraftUserMessage(mode, data, args.expectedShiftCount) }],
    output_config: { effort: args.effort, format: AI_DRAFT_OUTPUT_FORMAT },
  });
  const response = await stream.finalMessage().catch((error: unknown) => {
    if (error instanceof Anthropic.APIError) return { apiError: error };
    throw error;
  });
  if ("apiError" in response) {
    const { apiError } = response;
    return {
      ok: false,
      failure: classifyAiDraftApiError(apiError),
      detail: `${apiError.status ?? "connection"} ${apiError.type ?? ""}`.trim(),
    };
  }

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    thinkingTokens: response.usage.output_tokens_details?.thinking_tokens ?? null,
  };
  const price = PRICES_PER_MILLION_TOKENS[args.model];
  const call: AiDraftCallSummary = {
    seconds: Math.round((Date.now() - startedAt) / 100) / 10,
    usage,
    costUsd:
      price && usage.inputTokens <= STANDARD_PRICE_INPUT_TOKEN_LIMIT
        ? Math.round(((usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000) * 10000) /
          10000
        : null,
    stopReason: response.stop_reason,
  };

  const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
  // 開発用の環境でだけ、AIが返した本文を書き出す。本文にはメモの言い換えが混ざりうるため、本番では残さない。
  if (isDebugModeEnabled()) {
    console.log(
      JSON.stringify({
        event: "ai_shift_draft_output",
        model: args.model,
        // 実際に応答したモデルと、AnthropicのConsoleのログと突き合わせるためのID。
        respondedModel: response.model,
        requestId: stream.request_id ?? null,
        stopReason: response.stop_reason,
        // AIが応じなかった場合の、理由の分類。
        stopCategory: response.stop_details?.category ?? null,
        ...usage,
        // プロンプトキャッシュは使っていない。使っていないことを確かめられるよう、キャッシュの量も出す。
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
        blocks: response.content.map((block) => block.type),
        outputChars: text.length,
        output: text.slice(0, DEBUG_OUTPUT_MAX_CHARS),
      }),
    );
  }

  // 応じなかった場合と、途中で切れた場合は、返答を使わない。
  if (response.stop_reason !== "end_turn") {
    const category = response.stop_details?.category;
    return {
      ok: false,
      failure: "declined",
      detail: category ? `${response.stop_reason}:${category}` : String(response.stop_reason),
      call,
    };
  }
  const parsed = aiDraftOutputSchema.safeParse(parseJson(text));
  if (!parsed.success) return { ok: false, failure: "declined", detail: "invalid_output", call };
  return {
    ok: true,
    result: applyAiDraft({ input: source.input, grid, draft: args.draft, changes: parsed.data.shifts }),
    returnedCount: parsed.data.shifts.length,
    call,
  };
}

function sumWorkedCells(grid: TimeGrid, shifts: readonly AutoCreatedShift[]): number {
  return shifts.reduce((sum, shift) => sum + countWorkedCells(grid, shift), 0);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

type AiDraftRunSettings = {
  mode: AiDraftMode;
  model: string;
  effort: AiShiftDraftEffort;
  maxTokens: number;
  daysPerRequest: number;
};

type AiDraftRunResult = {
  /** 作れた勤務。作れなかった場合はnull。 */
  shifts: AutoCreatedShift[] | null;
  failure: { kind: "billing" | "busy" | "declined" | "unavailable"; detail: string } | null;
  /** AIが使った量の合計。AIへ1回も届かなかった場合はnull。 */
  usage: { requestCount: number; inputTokens: number; outputTokens: number; thinkingTokens: number | null } | null;
  seconds: number;
  returnedCount: number;
  appliedCount: number;
  rejectedReasons: string[];
  /** 日ごとに分けて呼んだうち、AIが作れず、決まった手順の勤務で埋めた日。 */
  fallbackDates: string[];
};

/** 並べて実行する数を抑えながら、順番を保って結果を集める。 */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** 一から作らせた結果が、決まった手順で作れる量の半分に満たないか。 */
function isTooSparse(grid: TimeGrid, created: readonly AutoCreatedShift[], rule: readonly AutoCreatedShift[]): boolean {
  return sumWorkedCells(grid, created) * SCRATCH_MIN_COVERAGE_DIVISOR < sumWorkedCells(grid, rule);
}

/**
 * AIで下書きを作る。
 * 下書きを見直す作り方は、1回の呼び出しで行う。
 * 一から作る作り方は、設定した日数ごとに分けて、並べて呼ぶ。大きな募集を1回で送ると、どのモデルも数件だけ書いて終えたためである。
 * 分けて呼んだうち、AIが作れなかった日は、決まった手順の勤務で埋める。作れなかった日が半分を超えた場合は、全体を作れなかったものとして返す。
 */
async function runAiDraft(args: {
  source: AiDraftSource;
  grid: TimeGrid;
  ruleDraft: readonly AutoCreatedShift[];
  settings: AiDraftRunSettings;
}): Promise<AiDraftRunResult> {
  const { source, grid, ruleDraft, settings } = args;
  const startedAt = Date.now();
  const seconds = () => Math.round((Date.now() - startedAt) / 100) / 10;
  const sumUsage = (calls: readonly AiDraftCallSummary[]): AiDraftRunResult["usage"] => {
    if (calls.length === 0) return null;
    const thinking = calls.flatMap((call) => (call.usage.thinkingTokens === null ? [] : [call.usage.thinkingTokens]));
    return {
      requestCount: calls.length,
      inputTokens: calls.reduce((sum, call) => sum + call.usage.inputTokens, 0),
      outputTokens: calls.reduce((sum, call) => sum + call.usage.outputTokens, 0),
      thinkingTokens: thinking.length > 0 ? thinking.reduce((sum, value) => sum + value, 0) : null,
    };
  };

  // 勤務を作れる日を、設定した日数ごとにまとめる。
  const dates = [...new Set(ruleDraft.map((shift) => shift.date))].sort();
  const chunks: string[][] = [];
  if (settings.mode === "scratch" && settings.daysPerRequest > 0) {
    for (let index = 0; index < dates.length; index += settings.daysPerRequest) {
      chunks.push(dates.slice(index, index + settings.daysPerRequest));
    }
  }

  if (chunks.length <= 1) {
    // 一から作る場合は、決まった手順の下書きを渡さない。AIが返した勤務のうち、検査を通ったものだけが結果になる。
    const outcome = await callAiDraft({
      source,
      grid,
      mode: settings.mode,
      draft: settings.mode === "revise" ? ruleDraft : [],
      model: settings.model,
      effort: settings.effort,
      maxTokens: settings.maxTokens,
      ...(settings.mode === "scratch" ? { expectedShiftCount: ruleDraft.length } : {}),
    });
    const base = {
      usage: sumUsage(outcome.call ? [outcome.call] : []),
      seconds: seconds(),
      fallbackDates: [],
    };
    if (!outcome.ok) {
      return {
        ...base,
        shifts: null,
        failure: { kind: outcome.failure, detail: outcome.detail },
        returnedCount: 0,
        appliedCount: 0,
        rejectedReasons: [],
      };
    }
    // 画面は受け取った勤務で下書きをすべて置き換えるため、ほとんど空の結果を通すと、下書きが消える。
    const isSparse = settings.mode === "scratch" && isTooSparse(grid, outcome.result.shifts, ruleDraft);
    return {
      ...base,
      shifts: isSparse ? null : outcome.result.shifts,
      failure: isSparse ? { kind: "declined", detail: "insufficient_output" } : null,
      returnedCount: outcome.returnedCount,
      appliedCount: outcome.result.applied.length,
      rejectedReasons: outcome.result.rejected.map((item) => item.reason),
    };
  }

  const outcomes = await mapWithConcurrency(chunks, DAY_REQUEST_CONCURRENCY, async (chunk) => {
    const chunkDates = new Set(chunk);
    const chunkRule = ruleDraft.filter((shift) => chunkDates.has(shift.date));
    const outcome = await callAiDraft({
      source,
      grid,
      mode: "scratch",
      draft: [],
      dates: chunkDates,
      expectedShiftCount: chunkRule.length,
      model: settings.model,
      effort: settings.effort,
      maxTokens: Math.min(settings.maxTokens, DAY_REQUEST_MAX_TOKENS),
      timeoutMs: DAY_REQUEST_TIMEOUT_MS,
    });
    // ほかの日の勤務を返してきた場合は、その分を使わない。
    const created = outcome.ok ? outcome.result.shifts.filter((shift) => chunkDates.has(shift.date)) : [];
    const isUsable = outcome.ok && !isTooSparse(grid, created, chunkRule);
    return { chunk, chunkRule, outcome, created, isUsable };
  });

  const calls = outcomes.flatMap((item) => (item.outcome.call ? [item.outcome.call] : []));
  const failed = outcomes.filter((item) => !item.isUsable);
  const base = {
    usage: sumUsage(calls),
    seconds: seconds(),
    returnedCount: outcomes.reduce((sum, item) => sum + (item.outcome.ok ? item.outcome.returnedCount : 0), 0),
    appliedCount: outcomes.reduce((sum, item) => sum + (item.isUsable ? item.created.length : 0), 0),
    rejectedReasons: outcomes.flatMap((item) =>
      item.outcome.ok ? item.outcome.result.rejected.map((entry) => entry.reason) : [],
    ),
    fallbackDates: failed.flatMap((item) => item.chunk),
  };
  // 残高や設定の誤りは、どの日も同じ理由で失敗する。待っても直らないため、その種類のまま返す。
  const blocking = outcomes.flatMap((item) =>
    !item.outcome.ok && (item.outcome.failure === "billing" || item.outcome.failure === "unavailable")
      ? [item.outcome]
      : [],
  )[0];
  if (blocking) {
    return { ...base, shifts: null, failure: { kind: blocking.failure, detail: blocking.detail } };
  }
  if (failed.length * 2 > outcomes.length) {
    const first = failed[0].outcome;
    return {
      ...base,
      shifts: null,
      failure: {
        kind: first.ok ? "declined" : first.failure,
        detail: `too_many_failed_days:${failed.length}/${outcomes.length}`,
      },
    };
  }
  const shifts = outcomes
    .flatMap((item) => (item.isUsable ? item.created : item.chunkRule))
    .sort(
      (a, b) =>
        (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
        (a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0),
    );
  return { ...base, shifts, failure: null };
}

const aiDraftShiftValidator = v.object({
  staffId: v.id("staffs"),
  date: v.string(),
  segments: v.array(v.object({ startTime: v.string(), endTime: v.string(), positionId: v.id("positions") })),
  breaks: v.array(v.object({ startTime: v.string(), endTime: v.string() })),
});
const createAiDraftResultValidator = v.union(
  v.object({ status: v.literal("ok"), shifts: v.array(aiDraftShiftValidator) }),
  v.object({
    status: v.literal("failed"),
    reason: v.union(...AI_DRAFT_FAILURE_KINDS.map((kind) => v.literal(kind))),
  }),
);
type CreateAiDraftResult = Infer<typeof createAiDraftResultValidator>;

const failed = (reason: AiDraftFailureKind): CreateAiDraftResult => ({ status: "failed", reason });

/**
 * 募集期間の勤務の下書きを、AIで作って返す。保存はしない。
 * 希望、必要人数、熟練度、過去の集計、日付メモは、画面から受け取らず、サーバーで読む。
 */
export const createAiDraft = action({
  args: {
    shopId: v.id("shops"),
    expectedOrganizationId: v.id("organizations"),
    recruitmentId: v.id("recruitments"),
    includesBreaks: v.boolean(),
  },
  returns: createAiDraftResultValidator,
  handler: async (ctx, args): Promise<CreateAiDraftResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw expectedConvexError("auth_expired", "Unauthenticated");

    const prepared: PreparedAiDraftRequest = await ctx.runMutation(
      internal.shiftBoard.mutations.prepareAiDraftRequest,
      {
        tokenIdentifier: identity.tokenIdentifier,
        ...args,
      },
    );
    if (prepared.status === "notFound") throw new ConvexError("Not found");
    if (prepared.status !== "ready") {
      // 店長に見せる文は同じでも、原因を見分けられるよう、種類をログに残す。
      console.warn(JSON.stringify({ event: "ai_shift_draft_rejected", shopId: args.shopId, reason: prepared.status }));
      return failed(prepared.status);
    }

    const { source } = prepared;
    const grid = buildTimeGrid(source.input);
    if (!grid) return failed("unsupported");
    const toResult = (shifts: readonly AutoCreatedShift[]): CreateAiDraftResult => ({
      status: "ok",
      shifts: shifts.map((shift) => ({
        staffId: shift.staffId as Id<"staffs">,
        date: shift.date,
        segments: shift.segments.map((segment) => ({
          startTime: segment.startTime,
          endTime: segment.endTime,
          positionId: segment.positionId as Id<"positions">,
        })),
        breaks: shift.breaks,
      })),
    });

    // 決まった手順で作れる勤務が1件もない募集は、希望か必要人数がない。AIを呼ばずに、空で返す。
    const ruleDraft = buildAutoAssignments(source.input).shifts;
    if (ruleDraft.length === 0) return toResult([]);

    const settings = readSettings();
    if (!settings) {
      // 環境変数の値が範囲の外にある。待っても直らないため、設定の誤りとして返す。
      console.error(
        JSON.stringify({
          event: "ai_shift_draft_failed",
          shopId: prepared.shopId,
          failure: "unavailable",
          detail: "invalid_settings",
        }),
      );
      return failed("unavailable");
    }
    // 下書きを見直す作り方で、メモが1件もない募集は、AIが変える所がない。AIを呼ばずに、決まった手順の下書きを返す。
    const hasNotes = source.notes.some((entry) => entry.note.trim().length > 0);
    if (settings.mode === "revise" && !hasNotes) return toResult(ruleDraft);

    const run = await runAiDraft({ source, grid, ruleDraft, settings });
    // AIがトークンを使った回を記録する。AIへ届かずに失敗した回は、使った量がないため記録しない。
    // 日ごとに分けて呼んだ場合も、1回の作成として1件にまとめ、呼んだ回数と量の合計を残す。
    if (run.usage) {
      await ctx.runMutation(internal.shiftBoard.mutations.recordAiDraftUsage, {
        shopId: prepared.shopId,
        recruitmentId: prepared.recruitmentId,
        outcome: run.shifts ? "created" : "declined",
        mode: settings.mode,
        model: settings.model,
        effort: settings.effort,
        maxTokens: settings.maxTokens,
        requestCount: run.usage.requestCount,
        inputTokens: run.usage.inputTokens,
        outputTokens: run.usage.outputTokens,
        ...(run.usage.thinkingTokens === null ? {} : { thinkingTokens: run.usage.thinkingTokens }),
      });
    }
    const summary = {
      shopId: prepared.shopId,
      mode: settings.mode,
      model: settings.model,
      effort: settings.effort,
      seconds: run.seconds,
      usage: run.usage,
      returnedCount: run.returnedCount,
      appliedCount: run.appliedCount,
      rejectedReasons: run.rejectedReasons,
      fallbackDates: run.fallbackDates,
    };
    if (!run.shifts) {
      const failure = run.failure ?? { kind: "declined" as const, detail: "unknown" };
      // 運営側が気づけるよう、失敗の種類だけを残す。応答の本文とメモは残さない。
      console.error(
        JSON.stringify({ event: "ai_shift_draft_failed", failure: failure.kind, detail: failure.detail, ...summary }),
      );
      return failed(failure.kind);
    }

    console.log(JSON.stringify({ event: "ai_shift_draft_created", ...summary }));
    return toResult(run.shifts);
  },
});

/** 設定を読む。環境変数の値が範囲の外にある場合はnullを返す。 */
function readSettings() {
  try {
    return getAiShiftDraftSettings();
  } catch {
    return null;
  }
}

/** 戻り値の型を書いて、生成されるAPIの型との循環を断つ。 */
async function readTrialSource(
  ctx: ActionCtx,
  args: { recruitmentId: Id<"recruitments">; includesBreaks: boolean },
): Promise<AiDraftSource | null> {
  return await ctx.runQuery(internal.shiftBoard.queries.readAutoCreateAiInput, args);
}

/**
 * AI作成を、モデルや考える量を変えて比べるための試し。決まった手順だけの下書きと、AIを通した下書きを、同じ数字で並べる。
 * 画面からは呼べない。開発用の環境で、CLIから実行する。結果は返すだけで、保存しない。
 */
export const runAiDraftTrial = internalAction({
  args: {
    recruitmentId: v.id("recruitments"),
    /** "revise"は決まった手順の下書きをAIが見直す。"scratch"はAIが一から作る。省くと、環境変数の設定を使う。 */
    mode: v.optional(v.union(v.literal("revise"), v.literal("scratch"))),
    /** 休憩も作るか。省くとtrue。 */
    includesBreaks: v.optional(v.boolean()),
    /** 環境変数の設定を、この1回だけ変える。 */
    effort: v.optional(v.union(...AI_SHIFT_DRAFT_EFFORTS.map((effort) => v.literal(effort)))),
    model: v.optional(v.string()),
    /** trueにすると、APIを呼ばずに、送る指示文とデータだけを返す。 */
    dryRun: v.optional(v.boolean()),
    /** 送る日を絞る。日を分けて送るときの量と時間を測るために使う。 */
    dates: v.optional(v.array(v.string())),
    /** 一から作る場合に、1回の呼び出しで作る日数。省くと、環境変数の設定を使う。0なら、まとめて1回で送る。 */
    daysPerRequest: v.optional(v.number()),
    /**
     * 募集のメモの代わりに使うメモ。スタッフは、送るデータと同じ番号（s）で指す。
     * メモの書き方ごとにAIがどう直すかを、募集のデータを変えずに確かめるために使う。
     */
    noteOverrides: v.optional(v.array(v.object({ s: v.number(), date: v.string(), note: v.string() }))),
  },
  handler: async (ctx, args) => {
    // メモを外部へ送り、内容を結果に含めるため、開発用の環境でだけ動かす。
    if (!isDebugModeEnabled()) throw new Error("AI draft trial requires DEBUG_MODE=true");

    const settings = getAiShiftDraftSettings();
    const mode = args.mode ?? settings.mode;
    const model = args.model ?? settings.model;
    const effort = args.effort ?? settings.effort;

    const stored = await readTrialSource(ctx, {
      recruitmentId: args.recruitmentId,
      includesBreaks: args.includesBreaks ?? true,
    });
    if (!stored) throw new Error("Recruitment is not open");
    const source: AiDraftSource = args.noteOverrides
      ? {
          ...stored,
          notes: args.noteOverrides.flatMap((entry) => {
            const staffId = stored.input.staffs[entry.s]?.id;
            return staffId ? [{ staffId, date: entry.date, note: entry.note }] : [];
          }),
        }
      : stored;
    const { input, notes } = source;
    const grid = buildTimeGrid(input);
    if (!grid) throw new Error("The trial supports only time recruitments");

    const ruleShifts = buildAutoAssignments(input).shifts;
    const draft = mode === "revise" ? ruleShifts : [];
    const run = { model, effort, mode };
    if (args.dryRun) {
      const data = buildAiDraftData({
        input,
        grid,
        positions: source.positions,
        notes,
        draft: mode === "revise" ? draft : null,
      });
      return {
        ok: true as const,
        dryRun: true as const,
        run,
        system: getAiDraftSystemPrompt(mode),
        data,
        // 決まった手順の下書きの数字。AIを呼ばずに、公平さの指標などを確かめられる。
        ruleMetrics: evaluateDraft(input, grid, ruleShifts),
        // 決まった手順を手元で動かして比べるための入力。氏名とメモは含まない。
        input,
        staffIds: input.staffs.map((staff) => staff.id),
      };
    }

    // 日を絞らない場合は、画面から呼ぶときと同じ処理で作る。日ごとに分けて呼ぶ形も、ここで確かめられる。
    if (!args.dates) {
      const result = await runAiDraft({
        source,
        grid,
        ruleDraft: ruleShifts,
        settings: {
          mode,
          model,
          effort,
          maxTokens: settings.maxTokens,
          daysPerRequest: args.daysPerRequest ?? settings.daysPerRequest,
        },
      });
      const rejected: Record<string, number> = {};
      for (const reason of result.rejectedReasons) rejected[reason] = (rejected[reason] ?? 0) + 1;
      return {
        ok: result.shifts !== null,
        run,
        failure: result.failure,
        seconds: result.seconds,
        usage: result.usage,
        returnedCount: result.returnedCount,
        appliedCount: result.appliedCount,
        rejected,
        fallbackDates: result.fallbackDates,
        metrics: result.shifts
          ? { rule: evaluateDraft(input, grid, ruleShifts), ai: evaluateDraft(input, grid, result.shifts) }
          : null,
      };
    }

    const outcome = await callAiDraft({
      source,
      grid,
      mode,
      draft,
      model,
      effort,
      maxTokens: settings.maxTokens,
      ...(mode === "scratch"
        ? {
            expectedShiftCount: args.dates
              ? ruleShifts.filter((shift) => args.dates?.includes(shift.date)).length
              : ruleShifts.length,
          }
        : {}),
      ...(args.dates ? { dates: new Set(args.dates) } : {}),
    });
    if (!outcome.ok)
      return { ok: false as const, run, failure: outcome.failure, detail: outcome.detail, call: outcome.call };

    const { result } = outcome;
    const staffIndex = new Map(input.staffs.map((staff, index) => [staff.id, index]));
    const appliedByKey = new Map(result.applied.map((item) => [`${item.date}|${item.staffId}`, item]));
    const describeShift = (shifts: readonly AutoCreatedShift[], staffId: string, date: string) => {
      const shift = shifts.find((item) => item.staffId === staffId && item.date === date);
      if (!shift) return "勤務なし";
      const positionIndex = new Map(grid.positionIds.map((positionId, index) => [positionId, index]));
      const segments = shift.segments
        .map((segment) => `${segment.startTime}-${segment.endTime} p${positionIndex.get(segment.positionId)}`)
        .join(" / ");
      const breaks = shift.breaks.map((item) => ` 休憩 ${item.startTime}-${item.endTime}`).join("");
      return `${segments}${breaks}`;
    };
    return {
      ok: true as const,
      run,
      call: outcome.call,
      metrics: { rule: evaluateDraft(input, grid, ruleShifts), ai: evaluateDraft(input, grid, result.shifts) },
      returnedCount: outcome.returnedCount,
      appliedCount: result.applied.length,
      rejected: result.rejected,
      // メモごとに、その人のその日が変わったかを並べる。メモを正しく読めたかを、人が見て確かめるために使う。
      noteReview: notes
        .filter((entry) => staffIndex.has(entry.staffId) && entry.note.trim().length > 0)
        .map((entry) => ({
          s: staffIndex.get(entry.staffId),
          date: entry.date,
          note: entry.note,
          change: appliedByKey.get(`${entry.date}|${entry.staffId}`)?.change ?? null,
        })),
      // 変えた勤務の前と後。メモに合う直し方かを、人が見て確かめるために使う。
      changes: result.applied.map((item) => ({
        s: staffIndex.get(item.staffId),
        date: item.date,
        before: describeShift(ruleShifts, item.staffId, item.date),
        after: describeShift(result.shifts, item.staffId, item.date),
        change: item.change,
      })),
      // メモのない人と日への変更。あいた時間を埋めた勤務と、頼んでいない変更がここに出る。
      otherChanges: result.applied
        .filter((item) => !notes.some((entry) => entry.staffId === item.staffId && entry.date === item.date))
        .map((item) => ({ s: staffIndex.get(item.staffId), date: item.date, change: item.change })),
    };
  },
});
