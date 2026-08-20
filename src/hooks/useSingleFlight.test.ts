// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSingleFlight } from "./useSingleFlight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useSingleFlight", () => {
  it("実行中の連続呼び出しは1回にまとめる", async () => {
    const gate = deferred<string>();
    const handler = vi.fn(async (value: string) => {
      await gate.promise;
      return value;
    });
    const { result } = renderHook(() => useSingleFlight(handler));

    let first!: Promise<string | undefined>;
    let second!: Promise<string | undefined>;
    act(() => {
      first = result.current.run("first");
      second = result.current.run("second");
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("first");
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    await act(async () => {
      gate.resolve("done");
      await expect(first).resolves.toBe("first");
      await expect(second).resolves.toBeUndefined();
    });
    await waitFor(() => expect(result.current.isRunning).toBe(false));
  });

  it("失敗後は次の呼び出しを実行できる", async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce("ok");
    const { result } = renderHook(() => useSingleFlight(handler));

    await act(async () => {
      await expect(result.current.run()).rejects.toThrow("failed");
    });
    await act(async () => {
      await expect(result.current.run()).resolves.toBe("ok");
    });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("再描画後もrunの参照を保ちつつ最新のhandlerを実行する", async () => {
    const firstHandler = vi.fn().mockResolvedValue("first");
    const latestHandler = vi.fn().mockResolvedValue("latest");
    const { rerender, result } = renderHook(
      ({ handler }: { handler: () => Promise<string> }) => useSingleFlight(handler),
      { initialProps: { handler: firstHandler } },
    );
    const initialRun = result.current.run;

    rerender({ handler: latestHandler });

    expect(result.current.run).toBe(initialRun);
    await act(async () => {
      await expect(result.current.run()).resolves.toBe("latest");
    });
    expect(firstHandler).not.toHaveBeenCalled();
    expect(latestHandler).toHaveBeenCalledOnce();
  });

  it("release後に始めた新しい実行を古いPromiseの完了で解除しない", async () => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    const handler = vi.fn(async (value: string) => {
      await (value === "first" ? firstGate.promise : secondGate.promise);
      return value;
    });
    const { result } = renderHook(() => useSingleFlight(handler));

    let first!: Promise<string | undefined>;
    act(() => {
      first = result.current.run("first");
    });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    act(() => result.current.release());
    await waitFor(() => expect(result.current.isRunning).toBe(false));

    let second!: Promise<string | undefined>;
    act(() => {
      second = result.current.run("second");
    });
    await waitFor(() => expect(result.current.isRunning).toBe(true));

    await act(async () => {
      firstGate.resolve();
      await expect(first).resolves.toBe("first");
    });
    expect(result.current.isRunning).toBe(true);

    await act(async () => {
      secondGate.resolve();
      await expect(second).resolves.toBe("second");
    });
    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
