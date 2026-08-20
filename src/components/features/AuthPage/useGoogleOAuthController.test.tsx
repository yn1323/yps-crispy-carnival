// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { useGoogleOAuthController } from "./useGoogleOAuthController";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useGoogleOAuthController", () => {
  it("Google認証の開始前にBFCacheから復帰してもsingle-flightを解除しない", () => {
    const releaseAuthAction = vi.fn();
    const signIn = { reset: vi.fn().mockResolvedValue({ error: null }) };
    const signUp = { reset: vi.fn().mockResolvedValue({ error: null }) };
    const authenticateWithRedirect = vi.fn().mockResolvedValue({ error: null });
    const runAuthAction = vi.fn(async (action: () => Promise<void>) => action());
    renderHook(() =>
      useGoogleOAuthController({
        authenticateWithRedirect,
        isResourceLoaded: true,
        releaseAuthAction,
        runAuthAction,
        signIn,
        signUp,
        onErrorMessage: vi.fn(),
      }),
    );

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(releaseAuthAction).not.toHaveBeenCalled();
    expect(signIn.reset).not.toHaveBeenCalled();
    expect(signUp.reset).not.toHaveBeenCalled();
    expect(authenticateWithRedirect).not.toHaveBeenCalled();
    expect(runAuthAction).not.toHaveBeenCalled();
  });

  it("Google認証中にBFCacheから復帰した時だけsingle-flightを解除する", async () => {
    const redirectGate = deferred<{ error: null }>();
    const releaseAuthAction = vi.fn();
    const signIn = { reset: vi.fn().mockResolvedValue({ error: null }) };
    const signUp = { reset: vi.fn().mockResolvedValue({ error: null }) };
    const authenticateWithRedirect = vi.fn(() => redirectGate.promise);
    const runAuthAction = vi.fn(async (action: () => Promise<void>) => action());
    const { result } = renderHook(() =>
      useGoogleOAuthController({
        authenticateWithRedirect,
        isResourceLoaded: true,
        releaseAuthAction,
        runAuthAction,
        signIn,
        signUp,
        onErrorMessage: vi.fn(),
      }),
    );

    let googleAction!: Promise<unknown>;
    await act(async () => {
      googleAction = result.current.handleGoogle();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(authenticateWithRedirect).toHaveBeenCalledOnce();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    expect(releaseAuthAction).toHaveBeenCalledOnce();
    expect(signIn.reset).toHaveBeenCalledOnce();
    expect(signUp.reset).toHaveBeenCalledOnce();

    await act(async () => {
      redirectGate.resolve({ error: null });
      await googleAction;
    });
  });

  it.each(["resolve", "reject"] as const)(
    "BFCache復帰後の再試行を旧Google認証の%sで解除せず、旧エラーも表示しない",
    async (oldOutcome) => {
      const firstRedirectGate = deferred<{ error: null }>();
      const secondRedirectGate = deferred<{ error: null }>();
      const signIn = { reset: vi.fn().mockResolvedValue({ error: null }) };
      const signUp = { reset: vi.fn().mockResolvedValue({ error: null }) };
      const authenticateWithRedirect = vi
        .fn()
        .mockImplementationOnce(() => firstRedirectGate.promise)
        .mockImplementationOnce(() => secondRedirectGate.promise);
      const onErrorMessage = vi.fn();
      const { result } = renderHook(() => {
        const authAction = useSingleFlight(async (action: () => Promise<void>) => {
          await action();
        });
        const googleOAuth = useGoogleOAuthController({
          authenticateWithRedirect,
          isResourceLoaded: true,
          releaseAuthAction: authAction.release,
          runAuthAction: authAction.run,
          signIn,
          signUp,
          onErrorMessage,
        });

        return { ...googleOAuth, isRunning: authAction.isRunning };
      });

      let firstGoogleAction!: Promise<unknown>;
      act(() => {
        firstGoogleAction = result.current.handleGoogle();
      });
      await waitFor(() => expect(authenticateWithRedirect).toHaveBeenCalledOnce());
      await waitFor(() => expect(result.current.isRunning).toBe(true));

      act(() => {
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
      });
      await waitFor(() => expect(result.current.isRunning).toBe(false));

      let secondGoogleAction!: Promise<unknown>;
      act(() => {
        secondGoogleAction = result.current.handleGoogle();
      });
      await waitFor(() => expect(authenticateWithRedirect).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(result.current.isRunning).toBe(true));

      await act(async () => {
        if (oldOutcome === "resolve") {
          firstRedirectGate.resolve({ error: null });
        } else {
          firstRedirectGate.reject({ code: "form_password_incorrect" });
        }
        await firstGoogleAction;
      });

      expect(result.current.isRunning).toBe(true);
      expect(onErrorMessage.mock.calls.filter(([message]) => message !== undefined)).toEqual([]);

      await act(async () => {
        secondRedirectGate.reject({ code: "too_many_requests" });
        await secondGoogleAction;
      });
      await waitFor(() => expect(result.current.isRunning).toBe(false));
      expect(onErrorMessage.mock.calls.filter(([message]) => message !== undefined)).toEqual([
        ["試行回数が多すぎます。\n時間をおいて、もう一度お試しください。"],
      ]);
      expect(signIn.reset).toHaveBeenCalledTimes(2);
      expect(signUp.reset).toHaveBeenCalledTimes(2);
    },
  );
});
