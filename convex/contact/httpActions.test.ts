import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modules, schema } from "../_test/setup.test-helper";
import { buildContactSlackPayload } from "./actions";
import type { SubmitContactInput } from "./schemas";

const ORIGIN = "https://shiftori.app";
const LOCAL_ORIGIN = "http://localhost:3000";
const SLACK_URL = "https://hooks.slack.test/contact";

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "trouble",
    name: "田中 太郎",
    email: "tanaka@example.com",
    organization: "居酒屋たなか",
    message: "画面の操作中に問題が起きました。",
    acceptedPrivacy: true,
    requestId: "718cf80f-d4fb-4a5d-bf20-ad48044f31eb",
    turnstileToken: "turnstile-token",
    ...overrides,
  };
}

function responseJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("contact/httpActions", () => {
  beforeEach(() => {
    vi.stubEnv("APP_URL", ORIGIN);
    vi.stubEnv("CONTACT_ALLOWED_ORIGINS", ORIGIN);
    vi.stubEnv("CONTACT_RECIPIENT_EMAIL", "contact@example.com");
    vi.stubEnv("SLACK_CONTACT_WEBHOOK_URL", SLACK_URL);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "turnstile-secret");
    vi.stubEnv("NOTIFICATION_DELIVERY_MODE", "mock");
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("Turnstile検証後に問い合わせを受け付けてSlackへ通知する", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("turnstile")) {
        return responseJson({ success: true, action: "contact", hostname: "shiftori.app" });
      }
      if (url === SLACK_URL) return new Response("ok", { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("turnstile"))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === SLACK_URL)).toBe(true);
  });

  it("localhostではCloudflareのalways-passテストキーを検証できる", async () => {
    vi.stubEnv("APP_URL", LOCAL_ORIGIN);
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("turnstile")) {
        return responseJson({ success: true, hostname: "example.com", metadata: { result_with_testing_key: true } });
      }
      if (url === SLACK_URL) return new Response("ok", { status: 200 });
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: LOCAL_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
  });

  it("always-passテストキーでもlocalhost以外ではhostname照合を省略しない", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "1x0000000000000000000000000000000AA");
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      responseJson({ success: true, hostname: "example.com" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === SLACK_URL)).toBe(false);
  });

  it("Turnstile検証に失敗した場合はSlackへ通知しない", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => responseJson({ success: false }));
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(400);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === SLACK_URL)).toBe(false);
  });

  it("メール送信に失敗した場合はSlackへ通知しない", async () => {
    vi.stubEnv("DEBUG_NOTIFY_FAIL", "1");
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      responseJson({ success: true, action: "contact", hostname: "shiftori.app" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(502);
    expect(fetchMock.mock.calls.some(([url]) => String(url) === SLACK_URL)).toBe(false);
  });

  it("Slack通知に失敗してもメール受付成功を維持する", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("turnstile")) {
        return responseJson({ success: true, action: "contact", hostname: "shiftori.app" });
      }
      return new Response("failed", { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
  });

  it("許可していないOriginを拒否する", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const response = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("同じメールアドレスからの短時間連続送信を拒否する", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("turnstile")) {
        return responseJson({ success: true, action: "contact", hostname: "shiftori.app" });
      }
      return new Response("ok", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = convexTest(schema, modules);

    const first = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(validBody()),
    });
    const second = await t.fetch("/contact/submit", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(
        validBody({
          requestId: "557089b5-994f-45ad-b8c3-49d8f11f67b7",
          turnstileToken: "second-token",
        }),
      ),
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("Slackのmrkdwnとして解釈される記号をエスケープする", () => {
    const payload = buildContactSlackPayload(validBody({ name: "<!channel>" }) as SubmitContactInput);
    expect(JSON.stringify(payload)).toContain("&lt;!channel&gt;");
    expect(JSON.stringify(payload)).not.toContain('"text":"*氏名*\\n<!channel>"');
  });
});
