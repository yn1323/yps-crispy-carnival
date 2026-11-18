import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { resetResendEmailQueueForTest } from "../_lib/resend";
import { seedStaff } from "../_test/scenarioBuilders";
import { getTestOrganizationId, seedManagerShop, seedShop } from "../_test/seed";
import { modules, schema } from "../_test/setup.test-helper";
import {
  STAFF_REGISTRATION_EMAIL_DAILY_LIMIT,
  STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT,
  STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES,
  STAFF_REGISTRATION_IP_SHORT_LIMIT,
  STAFF_REGISTRATION_LINK_SHORT_LIMIT,
  STAFF_REGISTRATION_PENDING_LIMIT,
  STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
  STAFF_REGISTRATION_VERIFICATION_IP_SHORT_LIMIT,
  STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS,
  STAFF_REGISTRATION_VERIFICATION_MAX_SENDS,
  STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
} from "../constants";
import { digestVerificationHandle } from "./verificationCode";

const ORIGIN = "https://shiftori.app";
const START_PATH = "/staff-registration/verification/start";
const CONFIRM_PATH = "/staff-registration/verification/confirm";
const RESEND_PATH = "/staff-registration/verification/resend";
const PATHS = [START_PATH, CONFIRM_PATH, RESEND_PATH] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CODE_UNUSABLE_BODY = {
  error: "この確認コードは使えなくなりました。\n確認コードを再送してください。",
  code: "code_unusable",
};
const CODE_MISMATCH_BODY = {
  error: "確認コードが違います。\nメールに届いた6桁の数字を確認してください。",
  code: "code_mismatch",
};
const RATE_LIMITED_BODY = { error: "申請回数が多くなっています。\n少し時間をおいて、もう一度お試しください。" };
const LINK_UNAVAILABLE_BODY = { error: "登録リンクの有効期限が切れています。" };
const NO_SIDE_EFFECTS = { requests: [], verifications: [], audits: [], outbox: [], scheduled: [] };

type Test = TestConvex<typeof schema>;

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

function validBody(token: string, index = 1, overrides: Record<string, unknown> = {}) {
  return {
    token,
    name: `申請スタッフ${index}`,
    email: `staff-${index}@example.com`,
    acceptedLegal: true,
    requestId: uuid(10_000 + index),
    turnstileToken: `turnstile-token-${index}`,
    ...overrides,
  };
}

function turnstileSuccess() {
  return new Response(JSON.stringify({ success: true, action: "staff_registration", hostname: "shiftori.app" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type SentEmail = { to: string; subject: string; html: string; idempotencyKey: string | null };

/** メールproviderへ送られた確認コードのメール。各テストの前に空にする。 */
let sentEmails: SentEmail[] = [];

function isEmailProviderRequest(input: string | URL | Request): boolean {
  return (input instanceof Request ? input.url : String(input)).includes("api.resend.com");
}

function recordSentEmail(init: RequestInit | undefined) {
  const payload = JSON.parse(String(init?.body)) as { to: string | string[]; subject: string; html: string };
  sentEmails.push({
    to: Array.isArray(payload.to) ? (payload.to[0] ?? "") : payload.to,
    subject: payload.subject,
    html: payload.html,
    idempotencyKey: new Headers(init?.headers).get("Idempotency-Key"),
  });
}

/** Turnstileの検証を通し、メールproviderへの送信を記録するfetchを差し込む。 */
function stubTurnstileSuccess() {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    if (!isEmailProviderRequest(input)) return turnstileSuccess();
    recordSentEmail(init);
    return new Response(JSON.stringify({ id: `email_${sentEmails.length}` }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function turnstileCalls(fetchMock: ReturnType<typeof stubTurnstileSuccess>) {
  return fetchMock.mock.calls.filter(([input]) => !isEmailProviderRequest(input));
}

async function createRegistrationLink(
  t: Test,
  suffix: string,
): Promise<{ linkId: Id<"shopRegistrationLinks">; shopId: Id<"shops">; subject: string; token: string }> {
  const subject = `staff_registration_http_${suffix}`;
  const shopId = await t.run(async (ctx) => {
    const seeded = await seedManagerShop(ctx, { subject, email: `${suffix}@example.com` });
    return seeded.shopId;
  });
  const link = await t.withIdentity({ subject }).mutation(api.staffRegistration.mutations.ensureShopRegistrationLink, {
    expectedOrganizationId: await getTestOrganizationId(t, shopId),
    shopId,
  });
  return { linkId: link.linkId, shopId, subject, token: link.token };
}

async function businessSideEffects(t: Test) {
  return await t.run(async (ctx) => ({
    requests: await ctx.db.query("staffRegistrationRequests").collect(),
    verifications: await ctx.db.query("staffRegistrationEmailVerifications").collect(),
    audits: await ctx.db.query("organizationAuditEvents").collect(),
    outbox: await ctx.db.query("notificationOutbox").collect(),
    scheduled: await ctx.db.system.query("_scheduled_functions").collect(),
  }));
}

async function post(t: Test, path: string, body: unknown, headers: Record<string, string> = {}) {
  // 連続して送るテストが、メールproviderの送信間隔の待ちで止まらないようにする。
  resetResendEmailQueueForTest();
  return await t.fetch(path, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** 確認コードを送り、ブラウザが受け取る引換tokenを返す。 */
async function startVerification(t: Test, token: string, index = 1, overrides: Record<string, unknown> = {}) {
  const response = await post(t, START_PATH, validBody(token, index, overrides));
  const body = (await response.json()) as { verificationToken?: string };
  if (response.status !== 200 || !body.verificationToken) throw new Error("verification was not started");
  return body.verificationToken;
}

/** 申請者に届いたメールの件名から、宛先ごとの確認コードを送信順に読む。 */
function readSentCodes(to: string): string[] {
  return sentEmails
    .filter((email) => email.to === to)
    .map((email) => {
      const code = /確認コード (\d{6})$/.exec(email.subject)?.[1];
      if (!code) throw new Error("verification code was not found in the email subject");
      return code;
    });
}

function readLatestCode(to: string): string {
  const code = readSentCodes(to).at(-1);
  if (!code) throw new Error("verification code email was not sent");
  return code;
}

function wrongCodeFor(code: string): string {
  return code === "000000" ? "000001" : "000000";
}

/** 再送間隔を過ぎるまで時計を進める。 */
async function passResendInterval() {
  await vi.advanceTimersByTimeAsync(STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS);
}

describe("staffRegistration/httpActions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-21T12:00:00+09:00"));
    vi.stubEnv("APP_URL", ORIGIN);
    vi.stubEnv("STAFF_REGISTRATION_ALLOWED_ORIGINS", "");
    vi.stubEnv("STAFF_REGISTRATION_TRUSTED_IP_HEADER", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
    // 手元の.envに左右されないよう、メールは本番と同じ経路でproviderのmockへ送る。
    vi.stubEnv("DEBUG_MODE", "false");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "");
    vi.stubEnv("RESEND_API_KEY", "resend-token");
    sentEmails = [];
    resetResendEmailQueueForTest();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("確認コードの送信", () => {
    it("Turnstile検証後に確認待ちを作り、確認コードのメールを1通だけ登録して直後の配送を予約する", async () => {
      const fetchMock = stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { shopId, token } = await createRegistrationLink(t, "success");
      const now = Date.now();

      const response = await post(t, START_PATH, validBody(token));

      expect(response.status).toBe(200);
      const body = (await response.json()) as { verificationToken: string };
      expect(body).toEqual({
        status: "code_sent",
        verificationToken: expect.stringMatching(UUID_PATTERN),
        resendAfterMs: STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
        codeTtlMs: STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
      });
      expect(turnstileCalls(fetchMock)).toHaveLength(1);
      const turnstileRequest = turnstileCalls(fetchMock)[0]?.[1] as RequestInit;
      expect((turnstileRequest.body as FormData).get("response")).toBe("turnstile-token-1");
      expect((turnstileRequest.body as FormData).get("idempotency_key")).toBeNull();

      const state = await businessSideEffects(t);
      // 申請はコードの照合後に作る。通知Outboxと予約済み処理は使わず、その場で送る。
      expect({ requests: state.requests, outbox: state.outbox, scheduled: state.scheduled }).toEqual({
        requests: [],
        outbox: [],
        scheduled: [],
      });
      expect(state.verifications).toHaveLength(1);
      const verification = state.verifications[0];
      expect(verification).toMatchObject({
        shopId,
        name: "申請スタッフ1",
        email: "staff-1@example.com",
        emailNormalized: "staff-1@example.com",
        handleDigest: await digestVerificationHandle(body.verificationToken),
        codeExpiresAt: now + STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
        failedAttemptCount: 0,
        sendCount: 1,
        lastSentAt: now,
      });

      const code = readLatestCode("staff-1@example.com");
      expect(
        sentEmails.map((email) => ({
          to: email.to,
          subject: email.subject,
          idempotencyKey: email.idempotencyKey,
          htmlHasCode: email.html.includes(code),
          // 申請者が入力した名前は本文へ載せない。
          htmlHasName: email.html.includes("申請スタッフ1"),
        })),
      ).toEqual([
        {
          to: "staff-1@example.com",
          subject: expect.stringMatching(/^【シフトリ：.+】確認コード \d{6}$/),
          idempotencyKey: `staff-registration-verification-${verification._id}-1`,
          htmlHasCode: true,
          htmlHasName: false,
        },
      ]);
      // 引換tokenと確認コードは、digestだけを保存する。
      expect(JSON.stringify(verification)).not.toContain(body.verificationToken);
      expect(JSON.stringify(verification)).not.toContain(code);
    });

    it("メールを送れなかったら確認待ちを残さず、すぐに送り直せる", async () => {
      const fetchMock = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
        isEmailProviderRequest(input)
          ? new Response(JSON.stringify({ name: "validation_error", message: "rejected", statusCode: 422 }), {
              status: 422,
            })
          : turnstileSuccess(),
      );
      vi.stubGlobal("fetch", fetchMock);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "send_failed");

      const failed = await post(t, START_PATH, validBody(token));

      expect(failed.status).toBe(503);
      await expect(failed.json()).resolves.toEqual({
        error: "確認コードを送れませんでした。\n少し時間をおいて、もう一度お試しください。",
      });
      await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
      // 失敗の記録に、宛先と確認コードを出さない。
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("staff-1@example.com");

      // 届いていないコードのために、60秒の送信間隔を待たせない。
      stubTurnstileSuccess();
      const retried = await post(t, START_PATH, validBody(token, 1, { requestId: uuid(11_000) }));
      expect(retried.status).toBe(200);
      expect(readSentCodes("staff-1@example.com")).toHaveLength(1);
    });

    it("配信停止に登録されたメールアドレスには送らず、応答は送れた場合と同じにする", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "suppressed");
      await t.run(async (ctx) => {
        await ctx.db.insert("emailSuppressions", { emailNormalized: "staff-1@example.com" });
      });

      const response = await post(t, START_PATH, validBody(token));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        status: "code_sent",
        verificationToken: expect.stringMatching(UUID_PATTERN),
        resendAfterMs: STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
        codeTtlMs: STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
      });
      expect(sentEmails).toEqual([]);
    });

    it("再発行前の登録tokenは即時に期限切れとして扱い、確認コードを送らない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { linkId, shopId, subject, token } = await createRegistrationLink(t, "rotated_link");
      await t.withIdentity({ subject }).mutation(api.staffRegistration.mutations.rotateShopRegistrationLink, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        expectedLinkId: linkId,
      });
      const before = await businessSideEffects(t);

      const response = await post(t, START_PATH, validBody(token));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(LINK_UNAVAILABLE_BODY);
      await expect(businessSideEffects(t)).resolves.toEqual(before);
    });

    it.each([
      ["失敗", { success: false }],
      ["別action", { success: true, action: "contact", hostname: "shiftori.app" }],
      ["別hostname", { success: true, action: "staff_registration", hostname: "evil.example" }],
      ["action欠落", { success: true, hostname: "shiftori.app" }],
    ] as const)("Turnstileの%sは業務mutationを呼ばず安全に拒否する", async (_label, result) => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify(result), { status: 200, headers: { "content-type": "application/json" } }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, `turnstile_${_label}`);
      const before = await businessSideEffects(t);

      const response = await post(t, START_PATH, validBody(token));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "セキュリティ確認をやり直してください。" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await expect(businessSideEffects(t)).resolves.toEqual(before);
    });

    it("Turnstile失敗を固定global budgetで止め、上限後はSiteverifyを呼ばない", async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ success: false }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "turnstile_flood");
      const statuses: number[] = [];

      for (let index = 0; index <= STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT; index += 1) {
        statuses.push((await post(t, START_PATH, validBody(token, index + 1))).status);
      }

      expect(statuses.slice(0, STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT)).toEqual(
        Array.from({ length: STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT }, () => 400),
      );
      expect(statuses.at(-1)).toBe(429);
      expect(fetchMock).toHaveBeenCalledTimes(STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT);
      const rateLimitRows = await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
      expect(rateLimitRows).toMatchObject([{ name: "staffRegistrationGlobalShort", key: "global" }]);
      expect(rateLimitRows).toHaveLength(1);
      await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
    });

    it("new・申請済み・登録済み・承認待ち上限のどれでも同じ形の応答で確認コードを送り、申請は増やさない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { shopId, token } = await createRegistrationLink(t, "generic");
      await t.run(async (ctx) => {
        await seedStaff(ctx, { shopId, name: "登録済みスタッフ", email: "existing@example.com" });
        for (let index = 0; index < STAFF_REGISTRATION_PENDING_LIMIT; index += 1) {
          const email = `seeded-${index}@example.com`;
          await ctx.db.insert("staffRegistrationRequests", {
            shopId,
            name: `既存申請${index}`,
            email,
            emailNormalized: email,
            status: "pending",
            termsConsentVersion: "2026-01-01",
            privacyConsentVersion: "2026-01-01",
            termsDocumentVersion: "2026-01-01",
            privacyDocumentVersion: "2026-01-01",
            consentedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
      });
      const emails = ["new@example.com", "seeded-0@example.com", "existing@example.com"];

      const responses = [];
      for (const [index, email] of emails.entries()) {
        responses.push(await post(t, START_PATH, validBody(token, index + 1, { email })));
      }

      expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
      const bodies = await Promise.all(responses.map(async (response) => (await response.json()) as object));
      expect(bodies).toEqual(
        emails.map(() => ({
          status: "code_sent",
          verificationToken: expect.stringMatching(UUID_PATTERN),
          resendAfterMs: STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
          codeTtlMs: STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
        })),
      );
      const state = await businessSideEffects(t);
      expect(state.requests).toHaveLength(STAFF_REGISTRATION_PENDING_LIMIT);
      expect(state.verifications.map((verification) => verification.emailNormalized).sort()).toEqual(
        [...emails].sort(),
      );
      expect(sentEmails.map((email) => email.to).sort()).toEqual([...emails].sort());
      expect(state.outbox).toEqual([]);
      expect(state.audits).toEqual([]);
    });

    it("同じ店舗の同じメールアドレスへは、表記を変えても60秒以内に2通目を送らない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "email_cooldown");

      const first = await post(t, START_PATH, validBody(token, 1, { email: " Same@Example.com " }));
      await vi.advanceTimersByTimeAsync(STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS - 1_000);
      const tooEarly = await post(t, START_PATH, validBody(token, 2, { email: "same@example.com" }));

      expect(first.status).toBe(200);
      expect(tooEarly.status).toBe(429);
      await expect(tooEarly.json()).resolves.toEqual({
        error: "確認コードは1分に1回まで送れます。\n少し時間をおいて、もう一度お試しください。",
        code: "cooldown",
        resendAfterMs: 1_000,
      });
      expect(readSentCodes("same@example.com")).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1_000);
      const afterInterval = await post(t, START_PATH, validBody(token, 3, { email: "same@example.com" }));

      expect(afterInterval.status).toBe(200);
      expect(readSentCodes("same@example.com")).toHaveLength(2);
    });

    it("同じメールアドレスでも登録linkが異なれば、別店舗の確認コードはすぐに送る", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const first = await createRegistrationLink(t, "email_scope_first");
      const second = await createRegistrationLink(t, "email_scope_second");

      const statuses = [];
      for (const [index, token] of [first.token, second.token].entries()) {
        statuses.push(
          (await post(t, START_PATH, validBody(token, index + 1, { email: "same-person@example.com" }))).status,
        );
      }

      expect(statuses).toEqual([200, 200]);
      const verifications = await t.run(
        async (ctx) => await ctx.db.query("staffRegistrationEmailVerifications").collect(),
      );
      expect(verifications.map((verification) => verification.shopId).sort()).toEqual(
        [first.shopId, second.shopId].sort(),
      );
    });

    it("同じ登録linkへメールを替える攻撃をlink budgetで止める", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "link_budget");
      const statuses: number[] = [];

      for (let index = 0; index <= STAFF_REGISTRATION_LINK_SHORT_LIMIT; index += 1) {
        statuses.push((await post(t, START_PATH, validBody(token, index + 1))).status);
      }

      expect(statuses).toEqual([...Array.from({ length: STAFF_REGISTRATION_LINK_SHORT_LIMIT }, () => 200), 429]);
      const state = await businessSideEffects(t);
      expect(state.verifications).toHaveLength(STAFF_REGISTRATION_LINK_SHORT_LIMIT);
      expect(sentEmails).toHaveLength(STAFF_REGISTRATION_LINK_SHORT_LIMIT);
    });

    it("重複tokenはlink・email固有のrate rowを作らず一般化したエラーで止める", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const duplicateToken = uuid(25_000);
      await t.run(async (ctx) => {
        for (const index of [1, 2]) {
          const shopId = await seedShop(ctx, `重複HTTP token店舗${index}`);
          await ctx.db.insert("shopRegistrationLinks", { shopId, token: duplicateToken, createdAt: Date.now() });
        }
      });

      const response = await post(t, START_PATH, validBody(duplicateToken));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(LINK_UNAVAILABLE_BODY);
      await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
      const rateLimitRows = await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
      expect(rateLimitRows).toMatchObject([{ name: "staffRegistrationGlobalShort", key: "global" }]);
      expect(rateLimitRows).toHaveLength(1);
    });

    it("Turnstile後に店舗が削除済みなら安全なlink errorへ変換し、確認コードを送らない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { shopId, token } = await createRegistrationLink(t, "deleted_after_verification");
      await t.run(async (ctx) => await ctx.db.patch(shopId, { isDeleted: true }));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const before = await businessSideEffects(t);

      const response = await post(t, START_PATH, validBody(token));

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(LINK_UNAVAILABLE_BODY);
      expect(errorSpy).not.toHaveBeenCalled();
      await expect(businessSideEffects(t)).resolves.toEqual(before);
    });

    it("信頼する設定の送信元IPはlinkとメールを替えても共通budgetへ集約する", async () => {
      vi.stubEnv("STAFF_REGISTRATION_TRUSTED_IP_HEADER", "cf-connecting-ip");
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const tokens = await t.run(async (ctx) => {
        const values: string[] = [];
        for (let index = 0; index <= STAFF_REGISTRATION_IP_SHORT_LIMIT; index += 1) {
          const { shopId } = await seedManagerShop(ctx, {
            subject: `ip_budget_manager_${index}`,
            email: `ip-budget-manager-${index}@example.com`,
            shopName: `IP budget店舗${index}`,
          });
          const token = uuid(20_000 + index);
          await ctx.db.insert("shopRegistrationLinks", { shopId, token, createdAt: Date.now() });
          values.push(token);
        }
        return values;
      });
      const statuses: number[] = [];

      for (let index = 0; index < tokens.length; index += 1) {
        statuses.push(
          (
            await post(t, START_PATH, validBody(tokens[index] ?? "", index + 1), {
              "cf-connecting-ip": "203.0.113.10",
              "x-forwarded-for": `198.51.100.${index + 1}`,
            })
          ).status,
        );
      }

      expect(statuses).toEqual([...Array.from({ length: STAFF_REGISTRATION_IP_SHORT_LIMIT }, () => 200), 429]);
      const verifications = await t.run(
        async (ctx) => await ctx.db.query("staffRegistrationEmailVerifications").collect(),
      );
      expect(verifications).toHaveLength(STAFF_REGISTRATION_IP_SHORT_LIMIT);
    });

    it("無効tokenを替える攻撃もglobal budgetで止め、token固有の業務状態を作らない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const statuses: number[] = [];

      for (let index = 0; index <= STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT; index += 1) {
        const response = await post(t, START_PATH, validBody(uuid(30_000 + index), index + 1));
        statuses.push(response.status);
      }

      expect(statuses.slice(0, STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT)).toEqual(
        Array.from({ length: STAFF_REGISTRATION_GLOBAL_SHORT_LIMIT }, () => 400),
      );
      expect(statuses.at(-1)).toBe(429);
      await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
      const rateLimitRows = await t.run(async (ctx) => await ctx.db.query("rateLimits").collect());
      expect(rateLimitRows).toMatchObject([{ name: "staffRegistrationGlobalShort", key: "global" }]);
      expect(rateLimitRows).toHaveLength(1);
    });
  });

  describe("3つの入口に共通するHTTP境界", () => {
    it.each(PATHS.flatMap((path) => ["GET", "PUT", "PATCH", "DELETE"].map((method) => [path, method] as const)))(
      "%s は%sでrouteを公開せず副作用を作らない",
      async (path, method) => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const t = convexTest(schema, modules);

        const response = await t.fetch(path, { method, headers: { origin: ORIGIN } });

        expect(response.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
        await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
      },
    );

    it("受付だけだった旧routeは公開しない", async () => {
      const t = convexTest(schema, modules);

      const response = await post(t, "/staff-registration/submit", validBody(uuid(1)));

      expect(response.status).toBe(404);
      await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
    });

    it.each(PATHS)("%s は許可Originだけへ最小限のCORSを返す", async (path) => {
      const t = convexTest(schema, modules);
      const allowed = await t.fetch(path, { method: "OPTIONS", headers: { origin: ORIGIN } });
      const denied = await t.fetch(path, { method: "OPTIONS", headers: { origin: "https://evil.example" } });

      expect(allowed.status).toBe(204);
      expect(allowed.headers.get("access-control-allow-origin")).toBe(ORIGIN);
      expect(allowed.headers.get("access-control-allow-methods")).toBe("POST, OPTIONS");
      expect(allowed.headers.get("access-control-allow-headers")).toBe("content-type");
      expect(denied.status).toBe(403);
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    });

    it.each(PATHS.flatMap((path) => [null, "https://evil.example"].map((origin) => [path, origin] as const)))(
      "%s は不許可Origin %s をbody読取と状態参照の前に拒否する",
      async (path, origin) => {
        const fetchMock = stubTurnstileSuccess();
        const t = convexTest(schema, modules);
        const { token } = await createRegistrationLink(
          t,
          `origin_${PATHS.indexOf(path)}_${origin ? "evil" : "missing"}`,
        );
        const verificationToken = await startVerification(t, token);
        const code = readLatestCode("staff-1@example.com");
        fetchMock.mockClear();
        const headers: Record<string, string> = { "content-type": "application/json" };
        if (origin) headers.origin = origin;
        const body = path === START_PATH ? validBody(token, 2) : { token, verificationToken, code };
        const before = await businessSideEffects(t);

        const response = await t.fetch(path, { method: "POST", headers, body: JSON.stringify(body) });

        expect(response.status).toBe(403);
        expect(fetchMock).not.toHaveBeenCalled();
        await expect(businessSideEffects(t)).resolves.toEqual(before);
      },
    );

    it.each(
      PATHS.flatMap((path) =>
        (
          [
            ["content-typeなし", {}, JSON.stringify(validBody(uuid(1))), 415],
            ["JSON以外", { "content-type": "text/plain" }, JSON.stringify(validBody(uuid(1))), 415],
            ["不正JSON", { "content-type": "application/json" }, "{", 400],
            [
              "Content-Length上限超過",
              {
                "content-type": "application/json",
                "content-length": String(STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES + 1),
              },
              JSON.stringify(validBody(uuid(1))),
              413,
            ],
            [
              "body上限超過",
              { "content-type": "application/json" },
              JSON.stringify({ padding: "x".repeat(STAFF_REGISTRATION_HTTP_BODY_MAX_BYTES) }),
              413,
            ],
            [
              "schema外field",
              { "content-type": "application/json" },
              JSON.stringify({
                ...validBody(uuid(1)),
                verificationToken: uuid(2),
                code: "123456",
                privilege: "manager",
              }),
              400,
            ],
          ] as const
        ).map(([label, extraHeaders, body, status]) => [path, label, extraHeaders, body, status] as const),
      ),
    )("%s は%sをTurnstileとDBの前に拒否する", async (path, _label, extraHeaders, body, status) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const t = convexTest(schema, modules);

      const response = await t.fetch(path, {
        method: "POST",
        headers: { origin: ORIGIN, ...extraHeaders },
        body,
      });

      expect(response.status).toBe(status);
      expect(fetchMock).not.toHaveBeenCalled();
      await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
      await expect(t.run(async (ctx) => await ctx.db.query("rateLimits").collect())).resolves.toEqual([]);
    });
  });

  describe("確認コードの照合", () => {
    it("全角や空白まじりでも正しいコードなら、メール確認済みの申請を1件作って確認待ちを消す", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { shopId, token } = await createRegistrationLink(t, "confirm_success");
      const verificationToken = await startVerification(t, token);
      const code = readLatestCode("staff-1@example.com");
      const fullWidthSpaced = `${code.slice(0, 3).replace(/\d/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0xfee0))}　${code.slice(3, 5)}-${code.slice(5)} `;
      await vi.advanceTimersByTimeAsync(30_000);
      const confirmedAt = Date.now();

      const response = await post(t, CONFIRM_PATH, { token, verificationToken, code: fullWidthSpaced });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: "accepted" });
      const state = await businessSideEffects(t);
      expect(state.verifications).toEqual([]);
      expect(state.requests.map(({ _id, _creationTime, ...request }) => request)).toEqual([
        {
          shopId,
          name: "申請スタッフ1",
          email: "staff-1@example.com",
          emailNormalized: "staff-1@example.com",
          status: "pending",
          termsConsentVersion: expect.any(String),
          privacyConsentVersion: expect.any(String),
          termsDocumentVersion: expect.any(String),
          privacyDocumentVersion: expect.any(String),
          consentedAt: confirmedAt,
          emailVerifiedAt: confirmedAt,
          createdAt: confirmedAt,
        },
      ]);

      // 使い終わった引換tokenでは、同じコードをもう一度照合できない。
      const replay = await post(t, CONFIRM_PATH, { token, verificationToken, code });
      expect(replay.status).toBe(400);
      await expect(replay.json()).resolves.toEqual(CODE_UNUSABLE_BODY);
      await expect(
        t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect()),
      ).resolves.toHaveLength(1);
    });

    it("違うコードは失敗回数を数え、上限に達したコードは正しく入力しても使えない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "confirm_attempts");
      const verificationToken = await startVerification(t, token);
      const code = readLatestCode("staff-1@example.com");
      const wrongCode = wrongCodeFor(code);
      const results: { status: number; body: unknown }[] = [];

      for (let attempt = 0; attempt < STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS; attempt += 1) {
        const response = await post(t, CONFIRM_PATH, { token, verificationToken, code: wrongCode });
        results.push({ status: response.status, body: await response.json() });
      }
      const afterLimit = await post(t, CONFIRM_PATH, { token, verificationToken, code });

      expect(results).toEqual([
        ...Array.from({ length: STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS - 1 }, () => ({
          status: 400,
          body: CODE_MISMATCH_BODY,
        })),
        { status: 400, body: CODE_UNUSABLE_BODY },
      ]);
      expect(afterLimit.status).toBe(400);
      await expect(afterLimit.json()).resolves.toEqual(CODE_UNUSABLE_BODY);
      const state = await businessSideEffects(t);
      expect(state.requests).toEqual([]);
      expect(state.verifications.map((verification) => verification.failedAttemptCount)).toEqual([
        STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS,
      ]);
    });

    it.each([
      ["桁数不足", "12345", "6桁の数字を入力してください"],
      ["数字以外", "12345a", "6桁の数字を入力してください"],
      ["空", "  ", "確認コードを入力してください"],
    ])("形式が違う入力（%s）は照合せず、失敗回数を消費しない", async (_label, code, error) => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "confirm_format");
      const verificationToken = await startVerification(t, token);
      const before = await businessSideEffects(t);

      const response = await post(t, CONFIRM_PATH, { token, verificationToken, code });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error });
      await expect(businessSideEffects(t)).resolves.toEqual(before);
    });

    it("期限の直前までは照合でき、期限ちょうどからは正しいコードでも使えない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const beforeExpiry = await createRegistrationLink(t, "confirm_before_expiry");
      const atExpiry = await createRegistrationLink(t, "confirm_at_expiry");
      const tokens = {
        beforeExpiry: await startVerification(t, beforeExpiry.token, 1),
        atExpiry: await startVerification(t, atExpiry.token, 2),
      };
      const codes = {
        beforeExpiry: readLatestCode("staff-1@example.com"),
        atExpiry: readLatestCode("staff-2@example.com"),
      };

      await vi.advanceTimersByTimeAsync(STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS - 1);
      const accepted = await post(t, CONFIRM_PATH, {
        token: beforeExpiry.token,
        verificationToken: tokens.beforeExpiry,
        code: codes.beforeExpiry,
      });
      await vi.advanceTimersByTimeAsync(1);
      const expired = await post(t, CONFIRM_PATH, {
        token: atExpiry.token,
        verificationToken: tokens.atExpiry,
        code: codes.atExpiry,
      });

      expect(accepted.status).toBe(200);
      expect(expired.status).toBe(400);
      await expect(expired.json()).resolves.toEqual(CODE_UNUSABLE_BODY);
      const requests = await t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect());
      expect(requests.map((request) => request.shopId)).toEqual([beforeExpiry.shopId]);
    });

    it("別店舗の登録linkと組み合わせた引換tokenは使えず、元の確認待ちの失敗回数も増やさない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const owner = await createRegistrationLink(t, "confirm_owner_shop");
      const other = await createRegistrationLink(t, "confirm_other_shop");
      const verificationToken = await startVerification(t, owner.token);
      const code = readLatestCode("staff-1@example.com");
      const before = await businessSideEffects(t);

      const confirm = await post(t, CONFIRM_PATH, { token: other.token, verificationToken, code });
      const resend = await post(t, RESEND_PATH, { token: other.token, verificationToken });

      expect(confirm.status).toBe(400);
      await expect(confirm.json()).resolves.toEqual(CODE_UNUSABLE_BODY);
      expect(resend.status).toBe(400);
      await expect(resend.json()).resolves.toEqual({
        error: "確認コードを再送できなくなりました。\n入力からやり直してください。",
        code: "verification_unusable",
      });
      await expect(businessSideEffects(t)).resolves.toEqual(before);
    });

    it("照合の前に登録linkが再発行されたら、正しいコードでも申請を作らない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { linkId, shopId, subject, token } = await createRegistrationLink(t, "confirm_rotated");
      const verificationToken = await startVerification(t, token);
      const code = readLatestCode("staff-1@example.com");
      await t.withIdentity({ subject }).mutation(api.staffRegistration.mutations.rotateShopRegistrationLink, {
        expectedOrganizationId: await getTestOrganizationId(t, shopId),
        shopId,
        expectedLinkId: linkId,
      });

      const response = await post(t, CONFIRM_PATH, { token, verificationToken, code });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(LINK_UNAVAILABLE_BODY);
      await expect(t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect())).resolves.toEqual(
        [],
      );
    });

    it("登録済み・申請済み・承認待ち上限のメールアドレスは、照合に成功しても同じ応答で申請を増やさない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { shopId, token } = await createRegistrationLink(t, "confirm_generic");
      await t.run(async (ctx) => {
        await seedStaff(ctx, { shopId, name: "登録済みスタッフ", email: "existing@example.com" });
      });
      // 1通目のメールアドレスで申請済みにしてから、同じメールアドレスと登録済みのメールアドレスを照合する。
      const firstToken = await startVerification(t, token, 1, { email: "applicant@example.com" });
      await post(t, CONFIRM_PATH, {
        token,
        verificationToken: firstToken,
        code: readLatestCode("applicant@example.com"),
      });
      await passResendInterval();
      const pendingToken = await startVerification(t, token, 2, { email: "applicant@example.com" });
      const existingToken = await startVerification(t, token, 3, { email: "existing@example.com" });

      const responses = [
        await post(t, CONFIRM_PATH, {
          token,
          verificationToken: pendingToken,
          code: readLatestCode("applicant@example.com"),
        }),
        await post(t, CONFIRM_PATH, {
          token,
          verificationToken: existingToken,
          code: readLatestCode("existing@example.com"),
        }),
      ];

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      await expect(Promise.all(responses.map(async (response) => await response.json()))).resolves.toEqual([
        { status: "accepted" },
        { status: "accepted" },
      ]);
      const state = await businessSideEffects(t);
      expect(state.requests.map((request) => request.emailNormalized)).toEqual(["applicant@example.com"]);
      expect(state.verifications).toEqual([]);
    });

    it("信頼する設定の送信元IPごとに、照合と再送の入口を共通budgetで止める", async () => {
      vi.stubEnv("STAFF_REGISTRATION_TRUSTED_IP_HEADER", "cf-connecting-ip");
      const t = convexTest(schema, modules);
      const headers = { "cf-connecting-ip": "203.0.113.20" };
      const statuses: number[] = [];

      for (let index = 0; index < STAFF_REGISTRATION_VERIFICATION_IP_SHORT_LIMIT; index += 1) {
        const response = await post(
          t,
          CONFIRM_PATH,
          { token: uuid(40_000 + index), verificationToken: uuid(50_000 + index), code: "123456" },
          headers,
        );
        statuses.push(response.status);
      }
      const confirm = await post(
        t,
        CONFIRM_PATH,
        { token: uuid(41_000), verificationToken: uuid(51_000), code: "123456" },
        headers,
      );
      const resend = await post(t, RESEND_PATH, { token: uuid(41_001), verificationToken: uuid(51_001) }, headers);
      const otherIp = await post(
        t,
        RESEND_PATH,
        { token: uuid(41_002), verificationToken: uuid(51_002) },
        { "cf-connecting-ip": "203.0.113.21" },
      );

      expect(statuses).toEqual(Array.from({ length: STAFF_REGISTRATION_VERIFICATION_IP_SHORT_LIMIT }, () => 400));
      expect(confirm.status).toBe(429);
      await expect(confirm.json()).resolves.toEqual(RATE_LIMITED_BODY);
      expect(resend.status).toBe(429);
      expect(otherIp.status).toBe(400);
      await expect(businessSideEffects(t)).resolves.toEqual(NO_SIDE_EFFECTS);
    });
  });

  describe("確認コードの再送", () => {
    it("60秒以内は再送せず、60秒後に送り直すと古いコードは使えず新しいコードだけが通る", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "resend_success");
      const verificationToken = await startVerification(t, token);
      const firstCode = readLatestCode("staff-1@example.com");

      await vi.advanceTimersByTimeAsync(STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS - 1);
      const tooEarly = await post(t, RESEND_PATH, { token, verificationToken });

      expect(tooEarly.status).toBe(429);
      await expect(tooEarly.json()).resolves.toEqual({
        error: "確認コードは1分に1回まで送れます。\n少し時間をおいて、もう一度お試しください。",
        code: "cooldown",
        resendAfterMs: 1,
      });
      expect(readSentCodes("staff-1@example.com")).toEqual([firstCode]);

      await vi.advanceTimersByTimeAsync(1);
      const resentAt = Date.now();
      const resent = await post(t, RESEND_PATH, { token, verificationToken });

      expect(resent.status).toBe(200);
      await expect(resent.json()).resolves.toEqual({
        status: "code_sent",
        resendAfterMs: STAFF_REGISTRATION_VERIFICATION_RESEND_INTERVAL_MS,
        codeTtlMs: STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
      });
      const codes = readSentCodes("staff-1@example.com");
      expect(codes).toHaveLength(2);
      const verifications = await t.run(
        async (ctx) => await ctx.db.query("staffRegistrationEmailVerifications").collect(),
      );
      expect(
        verifications.map(({ sendCount, lastSentAt, codeExpiresAt, failedAttemptCount }) => ({
          sendCount,
          lastSentAt,
          codeExpiresAt,
          failedAttemptCount,
        })),
      ).toEqual([
        {
          sendCount: 2,
          lastSentAt: resentAt,
          codeExpiresAt: resentAt + STAFF_REGISTRATION_VERIFICATION_CODE_TTL_MS,
          failedAttemptCount: 0,
        },
      ]);

      const newCode = codes[1] ?? "";
      // 乱数が同じ値を引いた場合は古いコードの拒否を確かめられないため、新しいコードの成功だけを見る。
      if (firstCode !== newCode) {
        const oldCodeResponse = await post(t, CONFIRM_PATH, { token, verificationToken, code: firstCode });
        expect(oldCodeResponse.status).toBe(400);
        await expect(oldCodeResponse.json()).resolves.toEqual(CODE_MISMATCH_BODY);
      }
      const newCodeResponse = await post(t, CONFIRM_PATH, { token, verificationToken, code: newCode });
      expect(newCodeResponse.status).toBe(200);
      await expect(
        t.run(async (ctx) => await ctx.db.query("staffRegistrationRequests").collect()),
      ).resolves.toHaveLength(1);
    });

    it("失敗回数の上限に達したコードも、再送すれば新しいコードで申請できる", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "resend_after_lock");
      const verificationToken = await startVerification(t, token);
      const wrongCode = wrongCodeFor(readLatestCode("staff-1@example.com"));
      for (let attempt = 0; attempt < STAFF_REGISTRATION_VERIFICATION_MAX_FAILED_ATTEMPTS; attempt += 1) {
        await post(t, CONFIRM_PATH, { token, verificationToken, code: wrongCode });
      }
      await passResendInterval();

      const resent = await post(t, RESEND_PATH, { token, verificationToken });
      const confirmed = await post(t, CONFIRM_PATH, {
        token,
        verificationToken,
        code: readLatestCode("staff-1@example.com"),
      });

      expect(resent.status).toBe(200);
      expect(confirmed.status).toBe(200);
      await expect(confirmed.json()).resolves.toEqual({ status: "accepted" });
    });

    it("1回の申請で送れる確認コードの上限を超えると、再送を止めてメールを増やさない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "resend_send_limit");
      const verificationToken = await startVerification(t, token);
      const statuses: number[] = [];

      for (let send = 1; send < STAFF_REGISTRATION_VERIFICATION_MAX_SENDS; send += 1) {
        await passResendInterval();
        statuses.push((await post(t, RESEND_PATH, { token, verificationToken })).status);
      }
      await passResendInterval();
      const overLimit = await post(t, RESEND_PATH, { token, verificationToken });

      expect(statuses).toEqual(Array.from({ length: STAFF_REGISTRATION_VERIFICATION_MAX_SENDS - 1 }, () => 200));
      expect(overLimit.status).toBe(429);
      await expect(overLimit.json()).resolves.toEqual({
        error: "確認コードを送れる回数の上限に達しました。\n入力からやり直してください。",
        code: "send_limit",
      });
      expect(readSentCodes("staff-1@example.com")).toHaveLength(STAFF_REGISTRATION_VERIFICATION_MAX_SENDS);
    });

    it("再送も、受付と同じメールアドレス別の1日の上限を消費する", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "resend_daily_budget");
      let verificationToken = "";
      // 受付だけで、1日の上限の1通手前まで使う。
      for (let send = 1; send < STAFF_REGISTRATION_EMAIL_DAILY_LIMIT; send += 1) {
        verificationToken = await startVerification(t, token, 1, { requestId: uuid(60_000 + send) });
        await passResendInterval();
      }

      const lastAllowed = await post(t, RESEND_PATH, { token, verificationToken });
      await passResendInterval();
      const overDailyLimit = await post(t, RESEND_PATH, { token, verificationToken });

      expect(lastAllowed.status).toBe(200);
      expect(overDailyLimit.status).toBe(429);
      await expect(overDailyLimit.json()).resolves.toEqual({
        error: "確認コードを送れる回数の上限に達しました。\n入力からやり直してください。",
        code: "send_limit",
      });
      expect(readSentCodes("staff-1@example.com")).toHaveLength(STAFF_REGISTRATION_EMAIL_DAILY_LIMIT);
    });

    it("存在しない引換tokenでは再送せず、状態を変えない", async () => {
      stubTurnstileSuccess();
      const t = convexTest(schema, modules);
      const { token } = await createRegistrationLink(t, "resend_unknown");
      await startVerification(t, token);
      const before = await businessSideEffects(t);

      const response = await post(t, RESEND_PATH, { token, verificationToken: uuid(70_000) });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "確認コードを再送できなくなりました。\n入力からやり直してください。",
        code: "verification_unusable",
      });
      await expect(businessSideEffects(t)).resolves.toEqual(before);
    });
  });
});
