import { afterEach, describe, expect, it, vi } from "vitest";
import { type LineApiError, pushTextMessage } from "./lineClient";

describe("lineClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
});
