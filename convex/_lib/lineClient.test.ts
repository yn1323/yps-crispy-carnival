import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMessageQuota,
  getMessageQuotaConsumption,
  type LineApiError,
  pushLineMessage,
  pushTextMessage,
  replyTextMessage,
} from "./lineClient";

describe("lineClient", () => {
  beforeEach(() => {
    vi.stubEnv("DEBUG_MODE", "false");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("push送信時にX-Line-Retry-Keyを付与できる", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await pushTextMessage("U_test", "hello", { retryKey: "123e4567-e89b-12d3-a456-426614174000" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({
      "X-Line-Retry-Key": "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      to: "U_test",
      messages: [{ type: "text", text: "hello" }],
    });
  });

  it("pushLineMessageはFlex Messageをそのまま送信bodyに載せる", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const message = {
      type: "flex" as const,
      altText: "提出依頼",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [{ type: "text", text: "📩 提出依頼" }],
        },
      },
    };

    await pushLineMessage("U_test", message);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      to: "U_test",
      messages: [message],
    });
  });

  it("LINEエラーはstatusつきで返す", async () => {
    vi.stubEnv("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN", "line-token");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => new Response("server error", { status: 500 })),
    );

    await expect(pushTextMessage("U_test", "hello")).rejects.toMatchObject({
      name: "LineApiError",
      status: 500,
      body: "server error",
    } satisfies Partial<LineApiError>);
  });

  it("dry-runはLINE PushとReplyをproviderへ送信しない", async () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "dry-run");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await pushTextMessage("U_test", "hello");
    await replyTextMessage("reply-token", "hello");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("force-failureはLINE PushとReplyを同じ模擬失敗にしproviderへ送信しない", async () => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", "force-failure");
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(pushTextMessage("U_test", "hello", { suppressDelivery: true })).rejects.toMatchObject({
      name: "LineApiError",
      status: 400,
      body: expect.stringContaining("force-failure"),
    });
    await expect(replyTextMessage("reply-token", "hello")).rejects.toMatchObject({
      name: "LineApiError",
      status: 400,
      body: expect.stringContaining("force-failure"),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["dry-run", "force-failure"] as const)("%sでは通知用LINE quota APIへ接続しない", async (mode) => {
    vi.stubEnv("DEBUG_MODE", "true");
    vi.stubEnv("DEBUG_NOTIFICATION_DELIVERY_MODE", mode);
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMessageQuota()).resolves.toEqual({ type: "limited", value: 200 });
    await expect(getMessageQuotaConsumption()).resolves.toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
