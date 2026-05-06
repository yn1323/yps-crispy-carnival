// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyTokenMock = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => verifyTokenMock,
}));

vi.mock("@/convex/_generated/api", () => ({
  api: { staffAuth: { mutations: { verifyToken: "verifyToken" } } },
}));

import { useStaffSession } from "./useStaffSession";

beforeEach(() => {
  localStorage.clear();
  verifyTokenMock.mockReset();
});

describe("useStaffSession", () => {
  it("verifyTokenが reject したとき networkError になる（expired ではない）", async () => {
    verifyTokenMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useStaffSession("token-123"));

    await waitFor(() => {
      expect(result.current.status).toBe("networkError");
    });
    if (result.current.status !== "networkError") throw new Error("type guard");
    expect(typeof result.current.retry).toBe("function");
  });

  it("retry() を呼ぶと verifyToken が再度呼ばれて成功すれば authenticated になる", async () => {
    verifyTokenMock
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ status: "ok", sessionToken: "sess-1", recruitmentId: "rec-1" });

    const { result } = renderHook(() => useStaffSession("token-abc"));

    await waitFor(() => {
      expect(result.current.status).toBe("networkError");
    });

    const errorState = result.current;
    if (errorState.status !== "networkError") throw new Error("type guard");
    act(() => {
      errorState.retry();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenCalledTimes(2);
  });

  it("server が status: 'expired' を返したときは networkError にならず expired のまま", async () => {
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-9" });

    const { result } = renderHook(() => useStaffSession("token-xyz"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-9");
  });

  it("server が status: 'rate_limited' を返したとき rateLimited になる", async () => {
    verifyTokenMock.mockResolvedValueOnce({
      status: "rate_limited",
      retryAfter: Date.now() + 60_000,
      recruitmentId: null,
    });

    const { result } = renderHook(() => useStaffSession("token-rl"));

    await waitFor(() => {
      expect(result.current.status).toBe("rateLimited");
    });
  });

  it("token が無く localStorage にもセッションが無いとき expired を返す", () => {
    const { result } = renderHook(() => useStaffSession(undefined));
    expect(result.current.status).toBe("expired");
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBeNull();
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });
});
