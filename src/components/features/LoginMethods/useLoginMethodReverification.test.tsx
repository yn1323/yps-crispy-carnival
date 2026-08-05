// @vitest-environment jsdom

import type {
  SessionVerificationLevel,
  SessionVerificationResource,
  SignedInSessionResource,
} from "@clerk/react/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as SignedInSessionResource | null,
}));

vi.mock("@clerk/react", () => ({
  useSession: () => ({
    isLoaded: true,
    isSignedIn: mocks.session !== null,
    session: mocks.session,
  }),
}));

import { useLoginMethodReverification } from "./useLoginMethodReverification";

beforeEach(() => {
  window.sessionStorage.clear();
  mocks.session = sessionResource();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useLoginMethodReverification", () => {
  it("メールコード優先の本人確認は方式選択を表示せずコード入力へ進む", async () => {
    const session = sessionResource();
    mocks.session = session;
    const awaiting = verificationResource({
      status: "needs_first_factor",
      firstFactors: [{ strategy: "email_code", emailAddressId: "email_1", safeIdentifier: "account@example.com" }],
    });
    session.startVerification.mockResolvedValue(awaiting);
    session.prepareFirstFactorVerification.mockResolvedValue(awaiting);
    const operation = deferred<void>();
    const { result } = renderReverification();

    const operationPromise = result.current.runOperation(() => operation.promise, {
      preferredFirstFactorStrategy: "email_code",
    });
    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel: vi.fn() }));

    await waitFor(() => expect(result.current.state.status).toBe("awaiting_input"));
    expect(result.current.state.selectedFactor?.strategy).toBe("email_code");
    expect(session.prepareFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "email_code",
      emailAddressId: "email_1",
    });
    expect(result.current.state.status).not.toBe("selecting_factor");

    await act(async () => {
      operation.resolve();
      await operationPromise;
    });
  });

  it("メールコード優先時に利用できなければ別方式へフォールバックせず中止する", async () => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification.mockResolvedValue(
      verificationResource({ status: "needs_first_factor", firstFactors: [{ strategy: "password" }] }),
    );
    const cancel = vi.fn();
    const { result } = renderReverification();

    const operation = deferred<void>();
    const operationPromise = result.current.runOperation(() => operation.promise, {
      preferredFirstFactorStrategy: "email_code",
    });
    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel }));

    await waitFor(() => expect(result.current.state.status).toBe("error"));
    expect(cancel).toHaveBeenCalledOnce();
    expect(session.prepareFirstFactorVerification).not.toHaveBeenCalled();
    operation.resolve();
    await operationPromise;
  });

  it("要求されたlevelで開始し、password完了後だけ元要求をcompleteする", async () => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification.mockResolvedValue(
      verificationResource({ status: "needs_first_factor", firstFactors: [{ strategy: "password" }] }),
    );
    session.attemptFirstFactorVerification.mockResolvedValue(verificationResource({ status: "complete" }));
    const complete = vi.fn();
    const cancel = vi.fn();
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete, cancel }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    expect(session.startVerification).toHaveBeenCalledWith({ level: "first_factor" });

    await act(async () => result.current.selectFactor("first-0"));
    expect(result.current.state.status).toBe("awaiting_input");
    await act(async () => result.current.submit(" current-password "));

    expect(session.attemptFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "password",
      password: " current-password ",
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(cancel).not.toHaveBeenCalled();
  });

  it("levelが省略された場合はfirst factorで本人確認を開始する", async () => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification.mockResolvedValue(
      verificationResource({ status: "needs_first_factor", firstFactors: [{ strategy: "password" }] }),
    );
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: undefined, complete: vi.fn(), cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));

    expect(session.startVerification).toHaveBeenCalledWith({ level: "first_factor" });
    expect(result.current.state.level).toBe("first_factor");
  });

  it("email codeのinitial prepare直後は再送せず、30秒後に再送・attemptする", async () => {
    let currentTime = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    const session = sessionResource();
    mocks.session = session;
    const awaiting = verificationResource({
      status: "needs_first_factor",
      firstFactors: [{ strategy: "email_code", emailAddressId: "email_1", safeIdentifier: "account@example.com" }],
    });
    session.startVerification.mockResolvedValue(awaiting);
    session.prepareFirstFactorVerification.mockResolvedValue(awaiting);
    session.attemptFirstFactorVerification.mockResolvedValue(verificationResource({ status: "complete" }));
    const complete = vi.fn();
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete, cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    expect(result.current.state.factors[0]?.safeIdentifier).toBe("ac***@example.com");

    await act(async () => result.current.selectFactor("first-0"));
    expect(session.prepareFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "email_code",
      emailAddressId: "email_1",
    });
    await act(async () => result.current.resend());
    expect(session.prepareFirstFactorVerification).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({
      status: "awaiting_input",
      message: "確認コードを送信した直後です。あと30秒ほど待ってから再送してください。",
    });

    currentTime += 30_000;
    await act(async () => result.current.resend());
    expect(session.prepareFirstFactorVerification).toHaveBeenCalledTimes(2);
    await act(async () => result.current.submit(" 123456 "));
    expect(session.attemptFirstFactorVerification).toHaveBeenCalledWith({ strategy: "email_code", code: "123456" });
    expect(complete).toHaveBeenCalledOnce();
  });

  it("code送信後に本人確認を開き直した場合は選択画面を挟まずコード入力へ進む", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_500_000);
    const session = sessionResource();
    mocks.session = session;
    const awaiting = verificationResource({
      status: "needs_first_factor",
      firstFactors: [{ strategy: "email_code", emailAddressId: "email_1", safeIdentifier: "account@example.com" }],
    });
    session.startVerification.mockResolvedValue(awaiting);
    session.prepareFirstFactorVerification.mockResolvedValue(awaiting);
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    await act(async () => result.current.selectFactor("first-0"));
    act(() => result.current.cancel());

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    await act(async () => result.current.selectFactor("first-0"));

    expect(session.prepareFirstFactorVerification).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({
      status: "awaiting_input",
      selectedFactor: { strategy: "email_code" },
      message: "確認コードを送信した直後です。あと30秒ほど待ってから再送してください。",
    });
  });

  it("phone codeのfirst factorを正確なphoneNumberIdでprepareする", async () => {
    const session = sessionResource();
    mocks.session = session;
    const awaiting = verificationResource({
      status: "needs_first_factor",
      firstFactors: [{ strategy: "phone_code", phoneNumberId: "phone_1", safeIdentifier: "+819012341234" }],
    });
    session.startVerification.mockResolvedValue(awaiting);
    session.prepareFirstFactorVerification.mockResolvedValue(awaiting);
    session.attemptFirstFactorVerification.mockResolvedValue(verificationResource({ status: "complete" }));
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    expect(result.current.state.factors[0]?.safeIdentifier).toBe("登録電話番号（末尾1234）");
    await act(async () => result.current.selectFactor("first-0"));
    await act(async () => result.current.submit("654321"));

    expect(session.prepareFirstFactorVerification).toHaveBeenCalledWith({
      strategy: "phone_code",
      phoneNumberId: "phone_1",
    });
    expect(session.attemptFirstFactorVerification).toHaveBeenCalledWith({ strategy: "phone_code", code: "654321" });
  });

  it.each([
    ["totp" as const, "123456"],
    ["backup_code" as const, "backup-code"],
  ])("first factor後の%s second factorがcompleteするまで元要求を再開しない", async (strategy, code) => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification.mockResolvedValue(
      verificationResource({
        status: "needs_first_factor",
        level: "multi_factor",
        firstFactors: [{ strategy: "password" }],
      }),
    );
    session.attemptFirstFactorVerification.mockResolvedValue(
      verificationResource({ status: "needs_second_factor", level: "multi_factor", secondFactors: [{ strategy }] }),
    );
    session.attemptSecondFactorVerification.mockResolvedValue(
      verificationResource({ status: "complete", level: "multi_factor" }),
    );
    const complete = vi.fn();
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "multi_factor", complete, cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    await act(async () => result.current.selectFactor("first-0"));
    await act(async () => result.current.submit("password"));

    expect(complete).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ status: "selecting_factor", stage: "second" });
    await act(async () => result.current.selectFactor("second-0"));
    await act(async () => result.current.submit(code));
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({ strategy, code });
    expect(complete).toHaveBeenCalledOnce();
  });

  it("second factorのphone codeのinitial prepare直後は再送せず、30秒後に再送できる", async () => {
    let currentTime = 2_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    const session = sessionResource();
    mocks.session = session;
    const awaiting = verificationResource({
      status: "needs_second_factor",
      level: "multi_factor",
      secondFactors: [{ strategy: "phone_code", phoneNumberId: "phone_2", safeIdentifier: "+81 *** 5678" }],
    });
    session.startVerification.mockResolvedValue(awaiting);
    session.prepareSecondFactorVerification.mockResolvedValue(awaiting);
    session.attemptSecondFactorVerification.mockResolvedValue(
      verificationResource({ status: "complete", level: "multi_factor" }),
    );
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "multi_factor", complete: vi.fn(), cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    await act(async () => result.current.selectFactor("second-0"));
    await act(async () => result.current.resend());

    expect(session.prepareSecondFactorVerification).toHaveBeenCalledOnce();
    expect(result.current.state).toMatchObject({
      status: "awaiting_input",
      message: "確認コードを送信した直後です。あと30秒ほど待ってから再送してください。",
    });

    currentTime += 30_000;
    await act(async () => result.current.resend());
    await act(async () => result.current.submit("222222"));

    expect(session.prepareSecondFactorVerification).toHaveBeenNthCalledWith(1, {
      strategy: "phone_code",
      phoneNumberId: "phone_2",
    });
    expect(session.prepareSecondFactorVerification).toHaveBeenCalledTimes(2);
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({ strategy: "phone_code", code: "222222" });
  });

  it("誤ったcodeでstatusがcompleteでなければcompleteせず再入力を維持する", async () => {
    const session = sessionResource();
    mocks.session = session;
    const awaiting = verificationResource({
      status: "needs_first_factor",
      firstFactors: [{ strategy: "email_code", emailAddressId: "email_1", safeIdentifier: "a***@example.com" }],
    });
    session.startVerification.mockResolvedValue(awaiting);
    session.prepareFirstFactorVerification.mockResolvedValue(awaiting);
    session.attemptFirstFactorVerification.mockResolvedValueOnce(awaiting);
    const complete = vi.fn();
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete, cancel: vi.fn() }));
    await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
    await act(async () => result.current.selectFactor("first-0"));
    await act(async () => result.current.submit("000000"));

    expect(complete).not.toHaveBeenCalled();
    expect(result.current.state).toMatchObject({ status: "awaiting_input", message: expect.any(String) });
  });

  it("先行要求を維持し、同時に来た後続要求だけを一度cancelする", async () => {
    const session = sessionResource();
    mocks.session = session;
    const start = deferred<SessionVerificationResource>();
    session.startVerification.mockReturnValue(start.promise);
    const firstCancel = vi.fn();
    const secondCancel = vi.fn();
    const { result } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel: firstCancel }));
    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel: secondCancel }));

    expect(secondCancel).toHaveBeenCalledOnce();
    expect(firstCancel).not.toHaveBeenCalled();
    act(() => result.current.cancel());
    act(() => result.current.cancel());
    expect(firstCancel).toHaveBeenCalledOnce();
    start.resolve(verificationResource({ status: "complete" }));
  });

  it("complete後も元operationがsettleするまでlockを保持する", async () => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification.mockResolvedValue(verificationResource({ status: "complete" }));
    const operation = deferred<string>();
    const complete = vi.fn();
    const secondOperation = vi.fn(async () => "second");
    const { result } = renderReverification();

    const firstPromise = result.current.runOperation(() => operation.promise);
    act(() => result.current.onNeedsReverification({ level: "first_factor", complete, cancel: vi.fn() }));
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(result.current.state.status).toBe("completing");

    await expect(result.current.runOperation(secondOperation)).resolves.toBeUndefined();
    expect(secondOperation).not.toHaveBeenCalled();
    operation.resolve("done");
    await expect(firstPromise).resolves.toBe("done");
    await waitFor(() => expect(result.current.state.status).toBe("idle"));
  });

  it("同じoperation内の後続APIが要求した本人確認を直列に処理する", async () => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification
      .mockResolvedValueOnce(verificationResource({ status: "complete" }))
      .mockResolvedValueOnce(verificationResource({ status: "complete", level: "second_factor" }));
    const operation = deferred<string>();
    const firstComplete = vi.fn();
    const secondComplete = vi.fn();
    const secondCancel = vi.fn();
    const { result } = renderReverification();

    const operationPromise = result.current.runOperation(() => operation.promise);
    act(() =>
      result.current.onNeedsReverification({ level: "first_factor", complete: firstComplete, cancel: vi.fn() }),
    );
    await waitFor(() => expect(firstComplete).toHaveBeenCalledOnce());

    act(() =>
      result.current.onNeedsReverification({
        level: "second_factor",
        complete: secondComplete,
        cancel: secondCancel,
      }),
    );
    await waitFor(() => expect(secondComplete).toHaveBeenCalledOnce());

    expect(secondCancel).not.toHaveBeenCalled();
    expect(session.startVerification).toHaveBeenNthCalledWith(1, { level: "first_factor" });
    expect(session.startVerification).toHaveBeenNthCalledWith(2, { level: "second_factor" });
    operation.resolve("done");
    await expect(operationPromise).resolves.toBe("done");
    await waitFor(() => expect(result.current.state.status).toBe("idle"));
  });

  it("StrictModeのcloseとunmount競合でもcancelを一度だけ呼ぶ", async () => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification.mockReturnValue(new Promise(() => undefined));
    const cancel = vi.fn();
    const { result, unmount } = renderReverification(true);

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel }));
    await waitFor(() => expect(result.current.state.status).toBe("starting"));
    act(() => result.current.cancel());
    unmount();

    expect(cancel).toHaveBeenCalledOnce();
  });

  it("current Sessionが変わると未完了要求を一度だけcancelする", async () => {
    const firstSession = sessionResource("sess_1");
    mocks.session = firstSession;
    firstSession.startVerification.mockReturnValue(new Promise(() => undefined));
    const cancel = vi.fn();
    const { result, rerender, unmount } = renderReverification();

    act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel }));
    mocks.session = sessionResource("sess_2");
    rerender();
    await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    unmount();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(["start", "prepare", "attempt"] as const)(
    "%s失敗をfail-closedにしてPromiseをpendingにしない",
    async (failurePoint) => {
      const session = sessionResource();
      mocks.session = session;
      const awaiting = verificationResource({
        status: "needs_first_factor",
        firstFactors: [{ strategy: "email_code", emailAddressId: "email_1", safeIdentifier: "a***@example.com" }],
      });
      session.startVerification.mockImplementation(async () => {
        if (failurePoint === "start") throw new Error("start failed");
        return awaiting;
      });
      session.prepareFirstFactorVerification.mockImplementation(async () => {
        if (failurePoint === "prepare") throw new Error("prepare failed");
        return awaiting;
      });
      session.attemptFirstFactorVerification.mockImplementation(async () => {
        if (failurePoint === "attempt") throw new Error("attempt failed");
        return verificationResource({ status: "complete" });
      });
      const cancel = vi.fn();
      const { result } = renderReverification();

      act(() => result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel }));
      if (failurePoint !== "start") {
        await waitFor(() => expect(result.current.state.status).toBe("selecting_factor"));
        await act(async () => result.current.selectFactor("first-0"));
      }
      if (failurePoint === "attempt") await act(async () => result.current.submit("123456"));

      await waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      expect(result.current.state.status).toBe("error");
    },
  );

  it("未対応factorだけの場合とSession不在をfail-closedにする", async () => {
    const session = sessionResource();
    mocks.session = session;
    session.startVerification.mockResolvedValue(
      verificationResource({ status: "needs_first_factor", firstFactors: [{ strategy: "passkey" }] }),
    );
    const unsupportedCancel = vi.fn();
    const { result } = renderReverification();

    act(() =>
      result.current.onNeedsReverification({ level: "first_factor", complete: vi.fn(), cancel: unsupportedCancel }),
    );
    await waitFor(() => expect(unsupportedCancel).toHaveBeenCalledOnce());

    mocks.session = null;
    const { result: signedOutResult } = renderReverification();
    const signedOutCancel = vi.fn();
    act(() =>
      signedOutResult.current.onNeedsReverification({
        level: "first_factor",
        complete: vi.fn(),
        cancel: signedOutCancel,
      }),
    );
    expect(signedOutCancel).toHaveBeenCalledOnce();
  });
});

function renderReverification(strict = false) {
  return renderHook(() => useLoginMethodReverification(), {
    wrapper: strict ? StrictModeWrapper : undefined,
  });
}

function StrictModeWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

function sessionResource(id = "sess_1") {
  return {
    id,
    startVerification: vi.fn(),
    prepareFirstFactorVerification: vi.fn(),
    attemptFirstFactorVerification: vi.fn(),
    prepareSecondFactorVerification: vi.fn(),
    attemptSecondFactorVerification: vi.fn(),
    verifyWithPasskey: vi.fn(),
  } as unknown as SignedInSessionResource & {
    startVerification: ReturnType<typeof vi.fn>;
    prepareFirstFactorVerification: ReturnType<typeof vi.fn>;
    attemptFirstFactorVerification: ReturnType<typeof vi.fn>;
    prepareSecondFactorVerification: ReturnType<typeof vi.fn>;
    attemptSecondFactorVerification: ReturnType<typeof vi.fn>;
    verifyWithPasskey: ReturnType<typeof vi.fn>;
  };
}

function verificationResource({
  status,
  level = "first_factor",
  firstFactors = [],
  secondFactors = [],
}: {
  status: "needs_first_factor" | "needs_second_factor" | "complete";
  level?: SessionVerificationLevel;
  firstFactors?: unknown[];
  secondFactors?: unknown[];
}) {
  return {
    status,
    level,
    supportedFirstFactors: firstFactors,
    supportedSecondFactors: secondFactors,
    firstFactorVerification: {},
    secondFactorVerification: {},
  } as unknown as SessionVerificationResource;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
