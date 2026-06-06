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

import type { StaffAccessKind } from "@/src/utils/staffSession";
import { useStaffSession } from "./useStaffSession";

function writeStoredSession(recruitmentId: string, sessionToken: string): void {
  localStorage.setItem(`yps_session_${recruitmentId}`, JSON.stringify({ sessionToken, recruitmentId }));
}

function writeStoredAccessSession(recruitmentId: string, sessionToken: string, accessKind: StaffAccessKind): void {
  localStorage.setItem(
    `yps_session_${accessKind}_${recruitmentId}`,
    JSON.stringify({ sessionToken, recruitmentId, accessKind }),
  );
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

    const { result } = renderHook(() => useStaffSession("token-new", "submit"));

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "token-new", accessKind: "submit" });
    if (result.current.status !== "authenticated") throw new Error("type guard");
    expect(result.current.session).toEqual({
      sessionToken: "sess-new",
      recruitmentId: "rec-new",
      accessKind: "submit",
    });
    expect(localStorage.getItem("yps_session_submit_rec-new")).toBe(
      JSON.stringify({ sessionToken: "sess-new", recruitmentId: "rec-new", accessKind: "submit" }),
    );
  });

  it("ignores a stale verification result when token changes before the first request resolves", async () => {
    const first = deferred<{ status: "ok"; sessionToken: string; recruitmentId: string }>();
    const second = deferred<{ status: "ok"; sessionToken: string; recruitmentId: string }>();
    verifyTokenMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { rerender, result } = renderHook(
      ({ token, accessKind }: { token: string; accessKind: StaffAccessKind }) => useStaffSession(token, accessKind),
      {
        initialProps: { token: "token-a", accessKind: "submit" },
      },
    );

    rerender({ token: "token-b", accessKind: "submit" });

    first.resolve({ status: "ok", sessionToken: "sess-a", recruitmentId: "rec-a" });
    second.resolve({ status: "ok", sessionToken: "sess-b", recruitmentId: "rec-b" });

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenNthCalledWith(1, { token: "token-a", accessKind: "submit" });
    expect(verifyTokenMock).toHaveBeenNthCalledWith(2, { token: "token-b", accessKind: "submit" });
    if (result.current.status !== "authenticated") throw new Error("type guard");
    expect(result.current.session).toEqual({
      sessionToken: "sess-b",
      recruitmentId: "rec-b",
      accessKind: "submit",
    });
    expect(localStorage.getItem("yps_session_submit_rec-a")).toBeNull();
    expect(localStorage.getItem("yps_session_submit_rec-b")).toBe(
      JSON.stringify({ sessionToken: "sess-b", recruitmentId: "rec-b", accessKind: "submit" }),
    );
  });

  it("re-verifies when accessKind changes while the token stays the same", async () => {
    const submit = deferred<{ status: "expired"; recruitmentId: string }>();
    const view = deferred<{ status: "ok"; sessionToken: string; recruitmentId: string }>();
    verifyTokenMock.mockReturnValueOnce(submit.promise).mockReturnValueOnce(view.promise);

    const { rerender, result } = renderHook(
      ({ token, accessKind }: { token: string; accessKind: StaffAccessKind }) => useStaffSession(token, accessKind),
      {
        initialProps: { token: "shared-token", accessKind: "submit" },
      },
    );

    rerender({ token: "shared-token", accessKind: "view" });

    submit.resolve({ status: "expired", recruitmentId: "rec-submit" });
    view.resolve({ status: "ok", sessionToken: "sess-view", recruitmentId: "rec-view" });

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenNthCalledWith(1, { token: "shared-token", accessKind: "submit" });
    expect(verifyTokenMock).toHaveBeenNthCalledWith(2, { token: "shared-token", accessKind: "view" });
    if (result.current.status !== "authenticated") throw new Error("type guard");
    expect(result.current.session).toEqual({
      sessionToken: "sess-view",
      recruitmentId: "rec-view",
      accessKind: "view",
    });
  });

  it("returns networkError when verifyToken rejects", async () => {
    verifyTokenMock.mockRejectedValueOnce(new Error("network down"));

    const { result } = renderHook(() => useStaffSession("token-123", "submit"));

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

    const { result } = renderHook(() => useStaffSession("token-abc", "submit"));

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

    const { result } = renderHook(() => useStaffSession("token-xyz", "submit"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-9");
    expect(result.current.reason).toBe("invalid_link");
  });

  it("does not authenticate an expired submit token even when the same recruitment session is stored on this device", async () => {
    writeStoredAccessSession("rec-1", "sess-1", "submit");
    writeStoredSession("rec-1", "sess-legacy");
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-1" });

    const { result } = renderHook(() => useStaffSession("used-token", "submit"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "used-token", accessKind: "submit" });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-1");
  });

  it("authenticates an expired view token when the same recruitment view session is stored on this device", async () => {
    writeStoredAccessSession("rec-1", "sess-1", "view");
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-1" });

    const { result } = renderHook(() => useStaffSession("used-token", "view"));

    await waitFor(() => {
      expect(result.current.status).toBe("authenticated");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "used-token", accessKind: "view" });
    if (result.current.status !== "authenticated") throw new Error("type guard");
    expect(result.current.session).toEqual({
      sessionToken: "sess-1",
      recruitmentId: "rec-1",
      accessKind: "view",
    });
  });

  it("does not authenticate an expired view token from a deleted recruitment even when a view session is stored", async () => {
    writeStoredAccessSession("rec-1", "sess-1", "view");
    verifyTokenMock.mockResolvedValueOnce({
      status: "expired",
      recruitmentId: "rec-1",
      reason: "recruitment_deleted",
    });

    const { result } = renderHook(() => useStaffSession("deleted-recruitment-token", "view"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "deleted-recruitment-token", accessKind: "view" });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-1");
    expect(result.current.reason).toBe("recruitment_deleted");
  });

  it("does not use a legacy submit session for view access", async () => {
    writeStoredSession("rec-1", "sess-1");
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-1" });

    const { result } = renderHook(() => useStaffSession("used-token", "view"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "used-token", accessKind: "view" });
  });

  it("does not use a stored session for another recruitment when token verification expires", async () => {
    writeStoredSession("rec-old", "sess-old");
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-new" });

    const { result } = renderHook(() => useStaffSession("used-token", "submit"));

    await waitFor(() => {
      expect(result.current.status).toBe("expired");
    });
    expect(verifyTokenMock).toHaveBeenCalledWith({ token: "used-token", accessKind: "submit" });
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBe("rec-new");
  });

  it("does not use a stored session whose payload recruitmentId mismatches the requested recruitment", async () => {
    localStorage.setItem("yps_session_rec-new", JSON.stringify({ sessionToken: "sess-old", recruitmentId: "rec-old" }));
    verifyTokenMock.mockResolvedValueOnce({ status: "expired", recruitmentId: "rec-new" });

    const { result } = renderHook(() => useStaffSession("used-token", "submit"));

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

    const { result } = renderHook(() => useStaffSession("token-rl", "submit"));

    await waitFor(() => {
      expect(result.current.status).toBe("rateLimited");
    });
  });

  it("returns expired without reading arbitrary stored sessions when token is missing", () => {
    writeStoredSession("rec-1", "sess-1");

    const { result } = renderHook(() => useStaffSession(undefined, "submit"));

    expect(result.current.status).toBe("expired");
    if (result.current.status !== "expired") throw new Error("type guard");
    expect(result.current.recruitmentId).toBeNull();
    expect(result.current.reason).toBe("invalid_link");
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });
});
