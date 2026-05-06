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

function writeStoredSession(recruitmentId: string, sessionToken: string): void {
  localStorage.setItem(`yps_session_${recruitmentId}`, JSON.stringify({ sessionToken, recruitmentId }));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  verifyTokenMock.mockReset();
});

describe("useStaffSession", () => {
  it("prioritizes verifyToken result over a stored session for a different recruitment", async () => {
    writeStoredSession("rec-old", "sess-old");
    verifyTokenMock.mockResolvedValueOnce({ status: "ok", sessionToken: "sess-new", recruitmentId: "rec-new" });

    const { result } = renderHook(() => useStaffSession("token-new"));

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "token-new" });
    if (result.current.status !== "authenticated") throw new Error("type guard");
    expect(result.current.session).toEqual({ sessionToken: "sess-new", recruitmentId: "rec-new" });
    expect(localStorage.getItem("yps_session_rec-new")).toBe(
      JSON.stringify({ sessionToken: "sess-new", recruitmentId: "rec-new" }),
    );
  });

  it("ignores a stale verification result when token changes before the first request resolves", async () => {
    const first = deferred<{ status: "ok"; sessionToken: string; recruitmentId: string }>();
    const second = deferred<{ status: "ok"; sessionToken: string; recruitmentId: string }>();
    verifyTokenMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { rerender, result } = renderHook(({ token }) => useStaffSession(token), {
      initialProps: { token: "token-a" },
    });

    rerender({ token: "token-b" });

    first.resolve({ status: "ok", sessionToken: "sess-a", recruitmentId: "rec-a" });
    second.resolve({ status: "ok", sessionToken: "sess-b", recruitmentId: "rec-b" });

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenNthCalledWith(1, { token: "token-a" });
    expect(verifyTokenMock).toHaveBeenNthCalledWith(2, { token: "token-b" });
    if (result.current.status !== "authenticated") throw new Error("type guard");
    expect(result.current.session).toEqual({ sessionToken: "sess-b", recruitmentId: "rec-b" });
    expect(localStorage.getItem("yps_session_rec-a")).toBeNull();
    expect(localStorage.getItem("yps_session_rec-b")).toBe(
      JSON.stringify({ sessionToken: "sess-b", recruitmentId: "rec-b" }),
    );
  });

  it("returns networkError when verifyToken rejects", async () => {
    verifyTokenMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useStaffSession("token-123"));

    await waitFor(() => {
      expect(result.current.status).toBe("networkError");
    });
    if (result.current.status !== "networkError") throw new Error("type guard");
    expect(typeof result.current.retry).toBe("function");
  });

  it("retry calls verifyToken again and authenticates after success", async () => {
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

  it("returns expired when verifyToken returns expired and no matching stored session exists", async () => {
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-9" });

    const { result } = renderHook(() => useStaffSession("token-xyz"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-9");
  });

  it("authenticates an expired token when the same recruitment session is stored on this device", async () => {
    writeStoredSession("rec-1", "sess-1");
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-1" });

    const { result } = renderHook(() => useStaffSession("used-token"));

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "used-token" });
    if (result.current.status !== "authenticated") throw new Error("type guard");
    expect(result.current.session).toEqual({ sessionToken: "sess-1", recruitmentId: "rec-1" });
  });

  it("does not use a stored session for another recruitment when token verification expires", async () => {
    writeStoredSession("rec-old", "sess-old");
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-new" });

    const { result } = renderHook(() => useStaffSession("used-token"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "used-token" });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-new");
  });

  it("does not use a stored session whose payload recruitmentId mismatches the requested recruitment", async () => {
    localStorage.setItem("yps_session_rec-new", JSON.stringify({ sessionToken: "sess-old", recruitmentId: "rec-old" }));
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-new" });

    const { result } = renderHook(() => useStaffSession("used-token"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-new");
  });

  it("returns rateLimited when verifyToken returns rate_limited", async () => {
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

  it("returns expired without reading arbitrary stored sessions when token is missing", () => {
    writeStoredSession("rec-1", "sess-1");

    const { result } = renderHook(() => useStaffSession(undefined));

    expect(result.current.status).toBe("expired");
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBeNull();
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });
});
