import type { TestConvex } from "convex-test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import { seedStaff } from "../_test/scenarioBuilders";
import { seedManagerShop, seedOrganizationManagerShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import { AI_SHIFT_DRAFT_SHORT_LIMIT, MINUTE_MS } from "../constants";

const MANAGER_SUBJECT = "ai_shift_draft_manager";
const OTHER_MANAGER_SUBJECT = "ai_shift_draft_other_manager";
const DATE = "2026-08-17";
const SECOND_DATE = "2026-08-18";
const NOTE = "通院のため、15時半までしか入れません";
const STAFF_NAME = "提出済みスタッフ";

type Test = TestConvex<typeof schema>;
type Pattern = { kind: "time"; startTime: string; endTime: string } | { kind: "dateOnly" };

/**
 * 月曜のホールに10:00〜16:00の必要人数が1人あり、スタッフ1人が10:00〜18:00を希望している店舗を作る。
 * 決まった手順の下書きは、このスタッフの10:00〜16:00の勤務1件（6時間なので休憩なし）になる。
 */
async function seedAiDraftShop(
  t: Test,
  options?: {
    note?: string | null;
    submissionPattern?: Pattern;
    status?: "open" | "confirmed";
    /** 火曜にも、月曜と同じ必要人数と希望を入れる。日ごとに分けて呼ぶ形を確かめるために使う。 */
    hasSecondDay?: boolean;
  },
) {
  return await t.run(async (ctx) => {
    const actor = await seedManagerShop(ctx, { subject: MANAGER_SUBJECT, shopName: "AI作成の店舗" });
    const other = await seedOrganizationManagerShop(ctx, { subject: OTHER_MANAGER_SUBJECT, shopName: "別組織店舗" });
    const insertPosition = (name: string, sortOrder: number, isDefault = false) =>
      ctx.db.insert("positions", {
        shopId: actor.shopId,
        name,
        color: "#3b82f6",
        sortOrder,
        isDefault,
        isDeleted: false,
      });
    const hallPositionId = await insertPosition("ホール", 0);
    await insertPosition("シフト", 1, true);
    await ctx.db.insert("shiftDayTemplates", {
      shopId: actor.shopId,
      name: "平日",
      weekdays: options?.hasSecondDay ? ["mon", "tue"] : ["mon"],
      sortOrder: 0,
      appliesToHolidays: false,
      requirements: { kind: "time", bars: [{ positionId: hallPositionId, startTime: "10:00", endTime: "16:00" }] },
    });
    const submissionPattern = options?.submissionPattern ?? { kind: "time", startTime: "09:00", endTime: "22:00" };
    const recruitmentId = await ctx.db.insert("recruitments", {
      shopId: actor.shopId,
      periodStart: DATE,
      periodEnd: "2026-08-23",
      deadline: "2026-08-12",
      shopClosedDates: [],
      status: options?.status ?? "open",
      ...(options?.status === "confirmed" ? { confirmedAt: 1_000 } : {}),
      isDeleted: false,
      submissionPattern,
    });
    const staffId = await seedStaff(ctx, {
      shopId: actor.shopId,
      name: STAFF_NAME,
      email: "ai-draft-staff@example.com",
    });
    const submissionId = await ctx.db.insert("shiftSubmissions", {
      recruitmentId,
      staffId,
      firstSubmittedAt: 1_000,
      submittedAt: 1_000,
    });
    if (submissionPattern.kind === "time") {
      for (const date of options?.hasSecondDay ? [DATE, SECOND_DATE] : [DATE]) {
        await ctx.db.insert("shiftSubmissionSlots", {
          submissionId,
          recruitmentId,
          staffId,
          date,
          startTime: "10:00",
          endTime: "18:00",
        });
      }
    }
    const note = options?.note === undefined ? NOTE : options.note;
    if (note !== null) {
      await ctx.db.insert("shiftSubmissionDateNotes", { submissionId, recruitmentId, staffId, date: DATE, note });
    }
    return {
      scope: { shopId: actor.shopId, expectedOrganizationId: actor.organizationId },
      organizationId: actor.organizationId,
      otherShopId: other.shopId,
      recruitmentId,
      staffId,
      hallPositionId,
    };
  });
}

type SeededIds = Awaited<ReturnType<typeof seedAiDraftShop>>;

/** AIが返す勤務。スタッフとポジションは、送ったデータの番号で返る。 */
type AiShift = {
  staff: number;
  date: string;
  segments: Array<{ from: string; to: string; position: number }>;
  breaks: Array<{ from: string; to: string }>;
  change: string;
};

const shortened: AiShift = {
  staff: 0,
  date: DATE,
  segments: [{ from: "10:00", to: "15:30", position: 0 }],
  breaks: [],
  change: "メモに合わせて終わりを15時半にした",
};

/** 外部のAIの応答を差し替える。呼ばれた回数と、送った本文を確かめるために使う。 */
function mockAnthropic(respond: () => Response) {
  const fetchMock = vi.fn<typeof globalThis.fetch>(async () => respond());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** AIの返答を、少しずつ届く形（SSE）で作る。 */
const messageResponse = (shifts: AiShift[], stopReason = "end_turn", thinkingTokens?: number) => {
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 1 },
      },
    },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: JSON.stringify({ shifts }) } },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: {
        output_tokens: 200,
        ...(thinkingTokens === undefined ? {} : { output_tokens_details: { thinking_tokens: thinkingTokens } }),
      },
    },
    { type: "message_stop" },
  ];
  return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
};

const errorResponse = (status: number, type: string) =>
  new Response(JSON.stringify({ type: "error", error: { type, message: "provider detail" } }), {
    status,
    headers: { "content-type": "application/json" },
  });

const create = (t: Test, ids: SeededIds, subject = MANAGER_SUBJECT) =>
  t.withIdentity({ subject }).action(api.shiftBoard.actions.createAiDraft, {
    ...ids.scope,
    recruitmentId: ids.recruitmentId,
    includesBreaks: true,
  });

/** 回数制限の消費を、名前ごとの件数で読む。 */
const readRateLimitNames = (t: Test) =>
  t.run(async (ctx) => (await ctx.db.query("rateLimits").collect()).map((row) => row.name).sort());

/** AIを呼んだ記録を、保存した順に読む。 */
const readUsages = (t: Test) =>
  t.run(async (ctx) =>
    (await ctx.db.query("aiShiftDraftUsages").collect()).map(({ _id, _creationTime, ...usage }) => usage),
  );

const usage = (ids: SeededIds, outcome: "created" | "declined") => ({
  organizationId: ids.organizationId,
  shopId: ids.scope.shopId,
  recruitmentId: ids.recruitmentId,
  outcome,
  mode: "revise",
  model: "claude-haiku-5-5",
  effort: "low",
  maxTokens: 16000,
  requestCount: 1,
  inputTokens: 1000,
  outputTokens: 200,
});

const shift = (ids: SeededIds, endTime: string, date = DATE) => ({
  staffId: ids.staffId,
  date,
  segments: [{ startTime: "10:00", endTime, positionId: ids.hallPositionId }],
  breaks: [],
});

/** テストで使う、1つの募集で作成できる回数。環境変数で設定する。 */
const RECRUITMENT_LIMIT = 3;

describe("shiftBoard/actions createAiDraft（決まった手順の下書きをAIが見直す作り方）", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // 作り方を設定しない環境では、決まった手順の下書きを見直す。
    vi.stubEnv("AI_SHIFT_DRAFT_MODE", "");
    // 1つの募集で作成できる回数は、環境変数で決める。
    vi.stubEnv("AI_SHIFT_DRAFT_RECRUITMENT_LIMIT", String(RECRUITMENT_LIMIT));
    vi.stubEnv("AI_SHIFT_DRAFT_MODEL", "");
    vi.stubEnv("AI_SHIFT_DRAFT_EFFORT", "");
    vi.stubEnv("AI_SHIFT_DRAFT_MAX_TOKENS", "");
    vi.stubEnv("DEBUG_MODE", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("決まった手順の下書きをAIへ送り、AIが変えた勤務を入れた下書きを返して、使った1回を記録する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));
    vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await create(t, ids);

    expect(result).toEqual({ status: "ok", shifts: [shift(ids, "15:30")] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    const body = String(init?.body);
    const request = JSON.parse(body);
    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.output_config.effort).toBe("low");
    // メモと下書きは送る。スタッフの名前、ID、メールアドレスは送らない。
    expect(body).toContain(NOTE);
    // メモ、希望、下書きの勤務は、1人ずつ1つの項目にまとめて送る。
    expect(request.messages[0].content).toContain(
      `"people":[{"s":0,"requests":[{"from":"10:00","to":"18:00"}],"note":"${NOTE}","shift":{"segments":[{"from":"10:00","to":"16:00","p":0}],"breaks":[]}}]`,
    );
    expect(body).not.toContain(STAFF_NAME);
    expect(body).not.toContain(ids.staffId);
    expect(body).not.toContain("ai-draft-staff@example.com");
    expect(await readRateLimitNames(t)).toEqual(["aiShiftDraftShort"]);
    // 組織、店舗、募集、使った量、呼んだときの設定を1件記録する。
    expect(await readUsages(t)).toEqual([usage(ids, "created")]);
  });

  it("AIが考えた分の量を返した場合は、その量も記録する", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    mockAnthropic(() => messageResponse([shortened], "end_turn", 150));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await create(t, ids);

    expect(await readUsages(t)).toEqual([{ ...usage(ids, "created"), thinkingTokens: 150 }]);
  });

  it("環境変数でモデル、考える量、返答の上限を変えた場合は、その回に使った値を記録する", async () => {
    vi.stubEnv("AI_SHIFT_DRAFT_MODEL", "claude-opus-5-5");
    vi.stubEnv("AI_SHIFT_DRAFT_EFFORT", "high");
    vi.stubEnv("AI_SHIFT_DRAFT_MAX_TOKENS", "8000");
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await create(t, ids);

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect([request.model, request.output_config.effort, request.max_tokens]).toEqual([
      "claude-opus-5-5",
      "high",
      8000,
    ]);
    expect(await readUsages(t)).toEqual([
      { ...usage(ids, "created"), model: "claude-opus-5-5", effort: "high", maxTokens: 8000 },
    ]);
  });

  it("開発用の環境でだけ、AIが返した本文をログに書き出す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    mockAnthropic(() => messageResponse([shortened]));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const outputs = () =>
      log.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("ai_shift_draft_output"));

    vi.stubEnv("DEBUG_MODE", "");
    await create(t, ids);
    expect(outputs()).toEqual([]);

    vi.stubEnv("DEBUG_MODE", "true");
    await create(t, ids);
    expect(outputs()).toHaveLength(1);
    expect(JSON.parse(outputs()[0])).toMatchObject({
      event: "ai_shift_draft_output",
      stopReason: "end_turn",
      outputTokens: 200,
      blocks: ["text"],
      output: JSON.stringify({ shifts: [shortened] }),
    });
  });

  it("環境変数の値が範囲の外にある場合は、AIを呼ばずに設定の誤りとして返す", async () => {
    vi.stubEnv("AI_SHIFT_DRAFT_MAX_TOKENS", "1000000");
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "unavailable" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorLog.mock.calls.map((call) => String(call[0])).join("\n")).toContain('"detail":"invalid_settings"');
    expect(await readUsages(t)).toEqual([]);
  });

  it.each([
    ["APIキーのない環境", () => vi.stubEnv("ANTHROPIC_API_KEY", ""), undefined, "notConfigured"],
    ["時間指定でない募集", () => {}, { kind: "dateOnly" as const }, "unsupported"],
  ])("%sで断った場合は、原因の種類をログに残す", async (_label, arrange, submissionPattern, reason) => {
    arrange();
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t, submissionPattern ? { submissionPattern } : undefined);
    const warnLog = vi.spyOn(console, "warn").mockImplementation(() => {});

    await create(t, ids);

    expect(warnLog.mock.calls.map((call) => JSON.parse(String(call[0])))).toEqual([
      { event: "ai_shift_draft_rejected", shopId: ids.scope.shopId, reason },
    ]);
  });

  it("決まりに合わない勤務をAIが返した場合は、その勤務を捨てて、元の下書きを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    // 希望は18:00までなので、19:00までの勤務は希望の外になる。
    mockAnthropic(() => messageResponse([{ ...shortened, segments: [{ from: "10:00", to: "19:00", position: 0 }] }]));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(create(t, ids)).resolves.toEqual({ status: "ok", shifts: [shift(ids, "16:00")] });
  });

  it("メモが1件もない募集は、AIを呼ばずに決まった手順の下書きを返し、回数を数えない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t, { note: null });
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(create(t, ids)).resolves.toEqual({ status: "ok", shifts: [shift(ids, "16:00")] });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readRateLimitNames(t)).toEqual(["aiShiftDraftShort"]);
    expect(await readUsages(t)).toEqual([]);
  });

  it("未認証は拒否し、AIを呼ばず、回数も消費しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(
      t.action(api.shiftBoard.actions.createAiDraft, {
        ...ids.scope,
        recruitmentId: ids.recruitmentId,
        includesBreaks: true,
      }),
    ).rejects.toThrowError("Unauthenticated");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readRateLimitNames(t)).toEqual([]);
    expect(await readUsages(t)).toEqual([]);
  });

  it("別組織の管理者と、別組織の店舗の指定は Not found で拒否し、AIを呼ばず、回数も消費しない", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(create(t, ids, OTHER_MANAGER_SUBJECT)).rejects.toThrowError("Not found");
    await expect(
      t.withIdentity({ subject: MANAGER_SUBJECT }).action(api.shiftBoard.actions.createAiDraft, {
        shopId: ids.otherShopId,
        expectedOrganizationId: ids.organizationId,
        recruitmentId: ids.recruitmentId,
        includesBreaks: true,
      }),
    ).rejects.toThrowError("Not found");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readRateLimitNames(t)).toEqual([]);
    expect(await readUsages(t)).toEqual([]);
  });

  it.each<[string, (t: Test, ids: SeededIds) => Promise<void>]>([
    [
      "確定済みの募集",
      async (t, ids) => t.run(async (ctx) => ctx.db.patch(ids.recruitmentId, { status: "confirmed" })),
    ],
    ["削除済みの募集", async (t, ids) => t.run(async (ctx) => ctx.db.patch(ids.recruitmentId, { isDeleted: true }))],
    ["削除済みの店舗", async (t, ids) => t.run(async (ctx) => ctx.db.patch(ids.scope.shopId, { isDeleted: true }))],
  ])("%sは Not found で拒否し、AIを呼ばない", async (_label, arrange) => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    await arrange(t, ids);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(create(t, ids)).rejects.toThrowError("Not found");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readRateLimitNames(t)).toEqual([]);
    expect(await readUsages(t)).toEqual([]);
  });

  it("APIキーのない環境では、権限を確かめる前に使えないと返し、AIを呼ばない", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "notConfigured" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readRateLimitNames(t)).toEqual([]);
    expect(await readUsages(t)).toEqual([]);
  });

  it("時間指定でない募集は、AIを呼ばずに断る", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t, { submissionPattern: { kind: "dateOnly" } });
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "unsupported" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readRateLimitNames(t)).toEqual([]);
    expect(await readUsages(t)).toEqual([]);
  });

  it.each([
    // AIへ届かずに失敗した回は、使った量がないため記録しない。
    ["残高切れ（402）", () => errorResponse(402, "billing_error"), "billing", false],
    ["キーの誤り（401）", () => errorResponse(401, "authentication_error"), "unavailable", false],
    // AIが応じなかった回と、途中で切れた回は、利用料がかかるため記録する。
    ["AIが応じなかった", () => messageResponse([], "refusal"), "declined", true],
    ["返答が途中で切れた", () => messageResponse([], "max_tokens"), "declined", true],
  ])(
    "%s場合は、種類だけを返し、回数を数えず、応答の本文をログに残さない",
    async (_label, respond, reason, isRecorded) => {
      const t = convexTest(schema, modules);
      const ids = await seedAiDraftShop(t);
      const fetchMock = mockAnthropic(respond);
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await readRateLimitNames(t)).toEqual(["aiShiftDraftShort"]);
      const logged = errorLog.mock.calls.map((call) => String(call[0])).join("\n");
      expect(logged).toContain('"event":"ai_shift_draft_failed"');
      expect(logged).not.toContain("provider detail");
      expect(logged).not.toContain(NOTE);
      expect(await readUsages(t)).toEqual(isRecorded ? [usage(ids, "declined")] : []);
    },
  );

  it("続けて押した分は、上限の回数までAIを呼び、超えた分はAIを呼ばずに断る", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));
    vi.spyOn(console, "log").mockImplementation(() => {});

    const statuses: string[] = [];
    for (let count = 0; count < AI_SHIFT_DRAFT_SHORT_LIMIT + 1; count += 1) {
      const result = await create(t, ids);
      statuses.push(result.status === "ok" ? "ok" : result.reason);
    }

    expect(AI_SHIFT_DRAFT_SHORT_LIMIT).toBe(2);
    expect(statuses).toEqual(["ok", "ok", "rateLimited"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("1つの募集で上限の回数まで作成したあとは、時間をあけても、AIを呼ばずに断る", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));
    vi.spyOn(console, "log").mockImplementation(() => {});

    const statuses: string[] = [];
    for (let count = 0; count < RECRUITMENT_LIMIT + 1; count += 1) {
      // 続けて押した分の制限にかからないよう、1分ずつあける。
      vi.setSystemTime(Date.now() + MINUTE_MS);
      const result = await create(t, ids);
      statuses.push(result.status === "ok" ? "ok" : result.reason);
    }
    // 日をまたいでも戻らない。
    vi.setSystemTime(Date.now() + 3 * 24 * 60 * MINUTE_MS);
    const later = await create(t, ids);

    expect(statuses).toEqual(["ok", "ok", "ok", "limitReached"]);
    expect(later).toEqual({ status: "failed", reason: "limitReached" });
    expect(fetchMock).toHaveBeenCalledTimes(RECRUITMENT_LIMIT);
  });

  it("AIが応じなかった回は、1つの募集で作成できる回数に数えない", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T00:00:00.000Z"));
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    let isRefused = true;
    mockAnthropic(() => (isRefused ? messageResponse([], "refusal") : messageResponse([shortened])));
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    for (let count = 0; count < RECRUITMENT_LIMIT + 1; count += 1) {
      vi.setSystemTime(Date.now() + MINUTE_MS);
      await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "declined" });
    }
    isRefused = false;
    vi.setSystemTime(Date.now() + MINUTE_MS);

    await expect(create(t, ids)).resolves.toEqual({ status: "ok", shifts: [shift(ids, "15:30")] });
  });
});

describe("shiftBoard/actions createAiDraft（AIが一から作る作り方）", () => {
  beforeEach(() => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    // 一から作る形は、環境変数で選ぶ。日数を設定しなければ、1日ごとに分けて呼ぶ。
    vi.stubEnv("AI_SHIFT_DRAFT_MODE", "scratch");
    vi.stubEnv("AI_SHIFT_DRAFT_RECRUITMENT_LIMIT", "");
    vi.stubEnv("AI_SHIFT_DRAFT_DAYS_PER_REQUEST", "");
    vi.stubEnv("AI_SHIFT_DRAFT_MODEL", "");
    vi.stubEnv("AI_SHIFT_DRAFT_EFFORT", "");
    vi.stubEnv("AI_SHIFT_DRAFT_MAX_TOKENS", "");
    vi.stubEnv("DEBUG_MODE", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("決まった手順の下書きを送らずにAIを呼び、AIが返した勤務のうち検査を通ったものだけを返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    // 2件目は希望の時間の外なので捨てる。同じ人の同じ日なので、1件目だけが残る。
    const fetchMock = mockAnthropic(() =>
      messageResponse([shortened, { ...shortened, segments: [{ from: "10:00", to: "19:00", position: 0 }] }]),
    );

    await expect(create(t, ids)).resolves.toEqual({ status: "ok", shifts: [shift(ids, "15:30")] });

    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.system).toContain("シフト表の下書きを作る係");
    // 一から作らせるため、下書きの勤務と、足りない時間帯は送らない。
    expect(request.messages[0].content).toContain(
      `"people":[{"s":0,"requests":[{"from":"10:00","to":"18:00"}],"note":"${NOTE}","dayTargetHours":6}]`,
    );
    expect(request.messages[0].content).not.toContain('"shift"');
    expect(request.messages[0].content).not.toContain('"shortage"');
    expect(await readUsages(t)).toEqual([{ ...usage(ids, "created"), mode: "scratch" }]);
  });

  it("メモが1件もない募集でも、AIを呼んで作る", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t, { note: null });
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(create(t, ids)).resolves.toEqual({ status: "ok", shifts: [shift(ids, "15:30")] });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["勤務を1件も返さなかった", [] as AiShift[]],
    // 決まった手順では6時間の勤務を作れる。2時間は、その半分に満たない。
    ["返した勤務が少なすぎる", [{ ...shortened, segments: [{ from: "10:00", to: "12:00", position: 0 }] }]],
  ])("AIが%s場合は、下書きを空にせず、作れなかったものとして返し、回数に数えない", async (_label, shifts) => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    mockAnthropic(() => messageResponse(shifts));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "declined" });

    expect(errorLog.mock.calls.map((call) => String(call[0])).join("\n")).toContain('"detail":"insufficient_output"');
    expect(await readUsages(t)).toEqual([{ ...usage(ids, "declined"), mode: "scratch" }]);
  });

  it("希望も必要人数もなく、作れる勤務がない募集は、AIを呼ばずに空で返す", async () => {
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    await t.run(async (ctx) => {
      for (const template of await ctx.db.query("shiftDayTemplates").collect()) await ctx.db.delete(template._id);
    });
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));

    await expect(create(t, ids)).resolves.toEqual({ status: "ok", shifts: [] });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await readUsages(t)).toEqual([]);
  });

  it("作り方の設定が想定しない値の場合は、AIを呼ばずに設定の誤りとして返す", async () => {
    vi.stubEnv("AI_SHIFT_DRAFT_MODE", "auto");
    const t = convexTest(schema, modules);
    const ids = await seedAiDraftShop(t);
    const fetchMock = mockAnthropic(() => messageResponse([shortened]));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "unavailable" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("日ごとに分けて呼ぶ", () => {
    /** 送ってきた日に合わせて、その日の勤務を返す。 */
    const respondPerDay = (shiftsByDate: Record<string, AiShift[]>) => {
      const fetchMock = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        const content: string = JSON.parse(String(init?.body)).messages[0].content;
        const date = Object.keys(shiftsByDate).find((key) => content.includes(`"date":"${key}"`));
        return messageResponse(date ? shiftsByDate[date] : []);
      });
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };
    const sentDates = (fetchMock: ReturnType<typeof respondPerDay>) =>
      fetchMock.mock.calls
        .map((call) => {
          const content: string = JSON.parse(String(call[1]?.body)).messages[0].content;
          return [DATE, SECOND_DATE].filter((date) => content.includes(`"date":"${date}"`)).join(",");
        })
        .sort();
    const secondDay: AiShift = {
      ...shortened,
      date: SECOND_DATE,
      segments: [{ from: "10:00", to: "16:00", position: 0 }],
    };

    it("勤務を作れる日ごとに1回ずつ呼び、結果をまとめて返す。記録は1件にまとめ、呼んだ回数と量の合計を残す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedAiDraftShop(t, { hasSecondDay: true });
      const fetchMock = respondPerDay({ [DATE]: [shortened], [SECOND_DATE]: [secondDay] });

      await expect(create(t, ids)).resolves.toEqual({
        status: "ok",
        shifts: [shift(ids, "15:30"), shift(ids, "16:00", SECOND_DATE)],
      });

      // 1回の呼び出しには、その日のデータだけを送る。
      expect(sentDates(fetchMock)).toEqual([DATE, SECOND_DATE]);
      expect(await readUsages(t)).toEqual([
        { ...usage(ids, "created"), mode: "scratch", requestCount: 2, inputTokens: 2000, outputTokens: 400 },
      ]);
    });

    it("AIが作れなかった日は、決まった手順の勤務で埋める", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedAiDraftShop(t, { hasSecondDay: true });
      // 火曜は勤務を1件も返さない。
      respondPerDay({ [DATE]: [shortened], [SECOND_DATE]: [] });

      await expect(create(t, ids)).resolves.toEqual({
        status: "ok",
        shifts: [shift(ids, "15:30"), shift(ids, "16:00", SECOND_DATE)],
      });
    });

    it("AIが別の日の勤務を返した場合は、その勤務を使わない", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedAiDraftShop(t, { hasSecondDay: true });
      // 月曜の呼び出しに、火曜の勤務を混ぜて返す。火曜の呼び出しには、10:00〜14:00を返す。
      respondPerDay({
        [DATE]: [shortened, secondDay],
        [SECOND_DATE]: [{ ...secondDay, segments: [{ from: "10:00", to: "14:00", position: 0 }] }],
      });

      await expect(create(t, ids)).resolves.toEqual({
        status: "ok",
        shifts: [shift(ids, "15:30"), shift(ids, "14:00", SECOND_DATE)],
      });
    });

    it("作れなかった日が半分を超えた場合は、下書きを変えずに、作れなかったものとして返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedAiDraftShop(t, { hasSecondDay: true });
      respondPerDay({});
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "declined" });

      expect(errorLog.mock.calls.map((call) => String(call[0])).join("\n")).toContain("too_many_failed_days:2/2");
      expect(await readUsages(t)).toEqual([
        { ...usage(ids, "declined"), mode: "scratch", requestCount: 2, inputTokens: 2000, outputTokens: 400 },
      ]);
    });

    it("利用料の残高がない場合は、その種類のまま返す", async () => {
      const t = convexTest(schema, modules);
      const ids = await seedAiDraftShop(t, { hasSecondDay: true });
      mockAnthropic(() => errorResponse(402, "billing_error"));
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(create(t, ids)).resolves.toEqual({ status: "failed", reason: "billing" });

      expect(await readUsages(t)).toEqual([]);
    });

    it("分けない設定では、募集期間をまとめて1回で送る", async () => {
      vi.stubEnv("AI_SHIFT_DRAFT_DAYS_PER_REQUEST", "0");
      const t = convexTest(schema, modules);
      const ids = await seedAiDraftShop(t, { hasSecondDay: true });
      const fetchMock = mockAnthropic(() => messageResponse([shortened, secondDay]));

      await expect(create(t, ids)).resolves.toEqual({
        status: "ok",
        shifts: [shift(ids, "15:30"), shift(ids, "16:00", SECOND_DATE)],
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
