// @vitest-environment jsdom

import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkHooks = vi.hoisted(() => ({
  SignIn: vi.fn(),
  SignUp: vi.fn(),
  useClerk: vi.fn(),
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
}));

vi.mock("@clerk/react", () => clerkHooks);

vi.mock("../AuthFormControls", () => ({
  ClerkCaptcha: () => <div id="clerk-captcha" />,
}));

vi.mock("./SsoCallbackView", () => ({
  SsoProcessingView: ({ captcha }: { captcha: ReactNode }) => <div data-testid="spinner">{captcha}</div>,
  SsoClientTrustView: ({
    errorMessage,
    onBack,
    onResend,
    onSubmit,
    resendCooldownSeconds,
  }: {
    errorMessage?: string;
    onBack: () => void;
    onResend: () => void;
    onSubmit: (values: { code: string }) => void;
    resendCooldownSeconds?: number;
  }) => (
    <div data-testid="client-trust-view">
      {errorMessage}
      <button type="button" onClick={onBack}>
        ログイン画面に戻る
      </button>
      <button type="button" disabled={Boolean(resendCooldownSeconds)} onClick={onResend}>
        確認コードを再送
      </button>
      <button type="button" onClick={() => onSubmit({ code: "123456" })}>
        確認してログイン
      </button>
    </div>
  ),
  SsoRecoveryView: ({
    errorMessage,
    onRestart,
    target,
  }: {
    errorMessage?: string;
    onRestart: () => void;
    target: "login" | "signup";
  }) => (
    <div data-testid="recovery-view">
      {errorMessage}
      <button type="button" onClick={onRestart}>
        {target === "signup" ? "新規登録をやり直す" : "ログインをやり直す"}
      </button>
    </div>
  ),
}));

import { SsoCallbackPage } from ".";
import {
  handleSsoCallback,
  type SsoCallbackNavigation,
  type SsoCallbackResources,
  useSsoCallbackController,
} from "./useSsoCallbackController";

type SignInStatus = SsoCallbackResources["signIn"]["status"];
type SignUpStatus = SsoCallbackResources["signUp"]["status"];

type ResourceOptions = {
  signInStatus?: SignInStatus;
  signUpStatus?: SignUpStatus;
  signInTransferable?: boolean;
  signUpTransferable?: boolean;
  signInCreatedSessionId?: string | null;
  signUpCreatedSessionId?: string | null;
  signInExistingSessionId?: string;
  signUpExistingSessionId?: string;
  signUpId?: string | null;
  secondFactorVerification?: {
    expireAt: Date | null;
    status: SsoCallbackResources["signIn"]["secondFactorVerification"]["status"];
    strategy: string | null;
  };
  withClientTrustEmailCode?: boolean;
};

function createResources(options: ResourceOptions = {}): SsoCallbackResources {
  return {
    clerk: {
      setActive: vi.fn<SsoCallbackResources["clerk"]["setActive"]>().mockResolvedValue(undefined),
    },
    signIn: {
      status: options.signInStatus ?? "needs_identifier",
      isTransferable: options.signInTransferable ?? false,
      existingSession: options.signInExistingSessionId ? { sessionId: options.signInExistingSessionId } : undefined,
      createdSessionId: options.signInCreatedSessionId ?? null,
      supportedSecondFactors: options.withClientTrustEmailCode
        ? ([{ strategy: "email_code", emailAddressId: "email-id", safeIdentifier: "ab***@example.com" }] as never)
        : [],
      secondFactorVerification: options.secondFactorVerification ?? { expireAt: null, status: null, strategy: null },
      mfa: {
        sendEmailCode: vi.fn<SsoCallbackResources["signIn"]["mfa"]["sendEmailCode"]>().mockResolvedValue({
          error: null,
        }),
        verifyEmailCode: vi.fn<SsoCallbackResources["signIn"]["mfa"]["verifyEmailCode"]>().mockResolvedValue({
          error: null,
        }),
      },
      create: vi.fn<SsoCallbackResources["signIn"]["create"]>().mockResolvedValue({ error: null }),
      finalize: vi.fn<SsoCallbackResources["signIn"]["finalize"]>().mockResolvedValue({ error: null }),
      reset: vi.fn<SsoCallbackResources["signIn"]["reset"]>().mockResolvedValue({ error: null }),
    },
    signUp: {
      id: options.signUpId === null ? undefined : (options.signUpId ?? "sign-up-attempt"),
      status: options.signUpStatus ?? "abandoned",
      isTransferable: options.signUpTransferable ?? false,
      existingSession: options.signUpExistingSessionId ? { sessionId: options.signUpExistingSessionId } : undefined,
      createdSessionId: options.signUpCreatedSessionId ?? null,
      create: vi.fn<SsoCallbackResources["signUp"]["create"]>().mockResolvedValue({ error: null }),
      finalize: vi.fn<SsoCallbackResources["signUp"]["finalize"]>().mockResolvedValue({ error: null }),
      reset: vi.fn<SsoCallbackResources["signUp"]["reset"]>().mockResolvedValue({ error: null }),
    },
  };
}

function createNavigation(): SsoCallbackNavigation {
  return {
    navigateToApp: vi.fn<SsoCallbackNavigation["navigateToApp"]>(),
    continueClientTrust: vi.fn(),
    recover: vi.fn(),
  };
}

function mockClerkHooks(
  resources: SsoCallbackResources,
  loaded = true,
  fetchStatus: { signIn: "fetching" | "idle"; signUp: "fetching" | "idle" } = {
    signIn: "idle",
    signUp: "idle",
  },
) {
  clerkHooks.useClerk.mockReturnValue({ ...resources.clerk, loaded });
  clerkHooks.useSignIn.mockReturnValue({ fetchStatus: fetchStatus.signIn, signIn: resources.signIn });
  clerkHooks.useSignUp.mockReturnValue({ fetchStatus: fetchStatus.signUp, signUp: resources.signUp });
}

function mutateSignIn(
  resources: SsoCallbackResources,
  state: { createdSessionId: string | null; status: SignInStatus },
) {
  Object.defineProperty(resources.signIn, "status", { configurable: true, get: () => state.status });
  Object.defineProperty(resources.signIn, "createdSessionId", {
    configurable: true,
    get: () => state.createdSessionId,
  });
}

function mutateSignUp(
  resources: SsoCallbackResources,
  state: { createdSessionId: string | null; status: SignUpStatus },
) {
  Object.defineProperty(resources.signUp, "status", { configurable: true, get: () => state.status });
  Object.defineProperty(resources.signUp, "createdSessionId", {
    configurable: true,
    get: () => state.createdSessionId,
  });
}

beforeEach(() => {
  clerkHooks.SignIn.mockReset();
  clerkHooks.SignUp.mockReset();
  clerkHooks.useClerk.mockReset();
  clerkHooks.useSignIn.mockReset();
  clerkHooks.useSignUp.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("SSO callback", () => {
  it("session IDのある完了sign-inだけをfinalizeし、decorate済みredirectへ遷移する", async () => {
    const resources = createResources({ signInStatus: "complete", signInCreatedSessionId: "session-created" });
    mockClerkHooks(resources);

    renderHook(() => useSsoCallbackController({ redirectTo: "/dashboard?tab=staff" }));

    await waitFor(() => expect(resources.signIn.finalize).toHaveBeenCalledOnce());
    const navigate = vi.mocked(resources.signIn.finalize).mock.calls[0]?.[0]?.navigate;
    const decorateUrl = vi.fn(() => "#dashboard");
    await navigate?.({ session: {} as never, decorateUrl });

    expect(decorateUrl).toHaveBeenCalledExactlyOnceWith("/dashboard?tab=staff");
    expect(window.location.hash).toBe("#dashboard");
    expect(resources.signIn.reset).not.toHaveBeenCalled();
    expect(resources.signUp.reset).not.toHaveBeenCalled();
  });

  it("completeでもsession IDがなければfinalizeせず回復画面へ倒す", async () => {
    const resources = createResources({ signInStatus: "complete" });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signIn.finalize).not.toHaveBeenCalled();
    expect(navigation.recover).toHaveBeenCalledExactlyOnceWith(
      "login",
      "セッションを作成できませんでした。最初からやり直してください。",
    );
  });

  it("transfer後もsession IDのあるcompleteだけをfinalizeする", async () => {
    const state = { status: "needs_identifier" as SignInStatus, createdSessionId: null as string | null };
    const resources = createResources({ signUpTransferable: true });
    mutateSignIn(resources, state);
    vi.mocked(resources.signIn.create).mockImplementation(async () => {
      state.status = "complete";
      state.createdSessionId = "session-created";
      return { error: null };
    });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signIn.create).toHaveBeenCalledExactlyOnceWith({ transfer: true });
    expect(resources.signIn.finalize).toHaveBeenCalledExactlyOnceWith({ navigate: navigation.navigateToApp });
    expect(navigation.recover).not.toHaveBeenCalled();
  });

  it("transfer後がcompleteでもsession IDなしならfinalizeしない", async () => {
    const state = { status: "needs_identifier" as SignInStatus, createdSessionId: null as string | null };
    const resources = createResources({ signUpTransferable: true });
    mutateSignIn(resources, state);
    vi.mocked(resources.signIn.create).mockImplementation(async () => {
      state.status = "complete";
      return { error: null };
    });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signIn.finalize).not.toHaveBeenCalled();
    expect(navigation.recover).toHaveBeenCalledWith("login", expect.any(String));
  });

  it("transfer可能なsign-inからsession IDのあるsign-up完了へ引き継ぐ", async () => {
    const state = { status: "missing_requirements" as SignUpStatus, createdSessionId: null as string | null };
    const resources = createResources({ signInTransferable: true });
    mutateSignUp(resources, state);
    vi.mocked(resources.signUp.create).mockImplementation(async () => {
      state.status = "complete";
      state.createdSessionId = "session-created";
      return { error: null };
    });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signUp.create).toHaveBeenCalledExactlyOnceWith({ transfer: true });
    expect(resources.signUp.finalize).toHaveBeenCalledExactlyOnceWith({ navigate: navigation.navigateToApp });
  });

  it("session IDのある完了sign-upをfinalizeする", async () => {
    const resources = createResources({ signUpStatus: "complete", signUpCreatedSessionId: "session-created" });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signUp.finalize).toHaveBeenCalledExactlyOnceWith({ navigate: navigation.navigateToApp });
    expect(navigation.recover).not.toHaveBeenCalled();
  });

  it("既存sessionがあれば同じnavigate callbackで有効化する", async () => {
    const resources = createResources({ signInExistingSessionId: "session-existing" });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.clerk.setActive).toHaveBeenCalledExactlyOnceWith({
      session: "session-existing",
      navigate: navigation.navigateToApp,
    });
  });

  it("Client Trustはexact email_code factorがある時だけ一度送信して継続する", async () => {
    const resources = createResources({ signInStatus: "needs_client_trust", withClientTrustEmailCode: true });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
    expect(navigation.continueClientTrust).toHaveBeenCalledExactlyOnceWith("ab***@example.com", true);
    expect(resources.signIn.reset).not.toHaveBeenCalled();
    expect(resources.signUp.reset).not.toHaveBeenCalled();
  });

  it.each([
    {
      expected: "reuse",
      label: "有効期限内のemail_code",
      verification: {
        expireAt: new Date(Date.now() + 60_000),
        status: "unverified" as const,
        strategy: "email_code",
      },
    },
    {
      expected: "reuse",
      label: "有効期限を返さない有効なemail_code",
      verification: { expireAt: null, status: "unverified" as const, strategy: "email_code" },
    },
    {
      expected: "prepare",
      label: "expiredのemail_code",
      verification: { expireAt: new Date(Date.now() - 60_000), status: "expired" as const, strategy: "email_code" },
    },
    {
      expected: "prepare",
      label: "期限を過ぎたunverified email_code",
      verification: {
        expireAt: new Date(Date.now() - 60_000),
        status: "unverified" as const,
        strategy: "email_code",
      },
    },
    {
      expected: "recover",
      label: "phone_code",
      verification: {
        expireAt: new Date(Date.now() + 60_000),
        status: "unverified" as const,
        strategy: "phone_code",
      },
    },
    {
      expected: "recover",
      label: "totp",
      verification: { expireAt: null, status: "unverified" as const, strategy: "totp" },
    },
    {
      expected: "recover",
      label: "failed email_code",
      verification: { expireAt: null, status: "failed" as const, strategy: "email_code" },
    },
    {
      expected: "recover",
      label: "verified email_code",
      verification: { expireAt: null, status: "verified" as const, strategy: "email_code" },
    },
    {
      expected: "recover",
      label: "status不明のemail_code",
      verification: { expireAt: null, status: null, strategy: "email_code" },
    },
  ])("second factor verificationが$labelなら$expectedと判定する", async ({ expected, verification }) => {
    const resources = createResources({
      secondFactorVerification: verification,
      signInStatus: "needs_client_trust",
      withClientTrustEmailCode: true,
    });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    if (expected === "prepare") {
      expect(resources.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
      expect(navigation.continueClientTrust).toHaveBeenCalledExactlyOnceWith("ab***@example.com", true);
      expect(navigation.recover).not.toHaveBeenCalled();
      return;
    }

    if (expected === "reuse") {
      expect(resources.signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
      expect(navigation.continueClientTrust).toHaveBeenCalledExactlyOnceWith("ab***@example.com", false);
      expect(navigation.recover).not.toHaveBeenCalled();
      return;
    }

    expect(resources.signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
    expect(navigation.continueClientTrust).not.toHaveBeenCalled();
    expect(navigation.recover).toHaveBeenCalledExactlyOnceWith("login");
  });

  it.each([
    { label: "first factor", status: "needs_first_factor" as const },
    { label: "email codeなしMFA", status: "needs_second_factor" as const },
    { label: "Client Trustのfactorなし", status: "needs_client_trust" as const },
    { label: "new password", status: "needs_new_password" as const },
    { label: "Protect check", status: "needs_protect_check" as const },
  ])("$labelは更新・finalizeせず回復画面へ倒す", async ({ status }) => {
    const resources = createResources({ signInStatus: status });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(navigation.recover).toHaveBeenCalledWith("login");
    expect(resources.signIn.finalize).not.toHaveBeenCalled();
    expect(resources.signIn.reset).not.toHaveBeenCalled();
    expect(resources.signUp.reset).not.toHaveBeenCalled();
  });

  it("sign-upのmissing requirementsは更新・finalizeせず新規登録の回復画面へ倒す", async () => {
    const resources = createResources({ signUpStatus: "missing_requirements" });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(navigation.recover).toHaveBeenCalledExactlyOnceWith("signup");
    expect(resources.signUp.finalize).not.toHaveBeenCalled();
  });

  it("active sign-up attemptがないdefault missing requirementsはログイン回復へ倒す", async () => {
    const resources = createResources({ signUpId: null, signUpStatus: "missing_requirements" });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(navigation.recover).toHaveBeenCalledExactlyOnceWith("login");
    expect(resources.signUp.finalize).not.toHaveBeenCalled();
  });

  it("未知statusはsession化せずログイン回復へ倒す", async () => {
    const resources = createResources({
      signInStatus: "unknown_status" as SignInStatus,
      signUpStatus: "abandoned",
    });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(navigation.recover).toHaveBeenCalledExactlyOnceWith("login");
    expect(resources.signIn.finalize).not.toHaveBeenCalled();
    expect(resources.signUp.finalize).not.toHaveBeenCalled();
    expect(resources.clerk.setActive).not.toHaveBeenCalled();
  });

  it("Clerkと両resourceが読込済みになるまで初期分類を始めない", async () => {
    const resources = createResources({ signInStatus: "complete", signInCreatedSessionId: "session-created" });
    mockClerkHooks(resources, true, { signIn: "idle", signUp: "fetching" });

    const { result } = renderHook(() => useSsoCallbackController({ redirectTo: "/dashboard" }));

    await act(async () => Promise.resolve());
    expect(result.current.isProcessing).toBe(true);
    expect(result.current.isSubmitting).toBe(true);
    expect(resources.signIn.finalize).not.toHaveBeenCalled();
    expect(resources.signIn.reset).not.toHaveBeenCalled();
  });

  it("callback mountではattemptをresetせずClient TrustをシフトリUI内で継続する", async () => {
    const resources = createResources({ signInStatus: "needs_client_trust", withClientTrustEmailCode: true });
    mockClerkHooks(resources);

    const { rerender } = render(<SsoCallbackPage redirectTo="/dashboard?tab=staff" />);

    expect(await screen.findByTestId("client-trust-view")).not.toBeNull();
    rerender(<SsoCallbackPage redirectTo="/dashboard?tab=staff" />);

    expect(resources.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
    expect(resources.signIn.reset).not.toHaveBeenCalled();
    expect(resources.signUp.reset).not.toHaveBeenCalled();
    expect(clerkHooks.SignIn).not.toHaveBeenCalled();
    expect(clerkHooks.SignUp).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "確認コードを再送" }).disabled).toBe(true);
    expect(document.querySelector("#clerk-captcha")).toBeNull();
  });

  it("同じattemptをremountしても開始済みのsecond factorへコードを自動再送しない", async () => {
    const verificationState: NonNullable<ResourceOptions["secondFactorVerification"]> = {
      expireAt: null,
      status: null,
      strategy: null,
    };
    const resources = createResources({
      secondFactorVerification: verificationState,
      signInStatus: "needs_client_trust",
      withClientTrustEmailCode: true,
    });
    vi.mocked(resources.signIn.mfa.sendEmailCode).mockImplementation(async () => {
      resources.signIn.secondFactorVerification.expireAt = new Date(Date.now() + 60_000);
      resources.signIn.secondFactorVerification.status = "unverified";
      resources.signIn.secondFactorVerification.strategy = "email_code";
      return { error: null };
    });
    mockClerkHooks(resources);

    const firstMount = render(<SsoCallbackPage redirectTo="/dashboard" />);
    expect(await screen.findByTestId("client-trust-view")).not.toBeNull();
    firstMount.unmount();

    render(<SsoCallbackPage redirectTo="/dashboard" />);
    expect(await screen.findByTestId("client-trust-view")).not.toBeNull();

    expect(resources.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
    expect(resources.signIn.reset).not.toHaveBeenCalled();
    expect(resources.signUp.reset).not.toHaveBeenCalled();
  });

  it("開始済みverificationでは自動送信せず、明示した再送だけを実行する", async () => {
    const resources = createResources({
      secondFactorVerification: {
        expireAt: new Date(Date.now() + 60_000),
        status: "unverified",
        strategy: "email_code",
      },
      signInStatus: "needs_client_trust",
      withClientTrustEmailCode: true,
    });
    mockClerkHooks(resources);

    render(<SsoCallbackPage redirectTo="/dashboard" />);
    expect(await screen.findByTestId("client-trust-view")).not.toBeNull();

    expect(resources.signIn.mfa.sendEmailCode).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "確認コードを再送" }));
    await waitFor(() => expect(resources.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce());
  });

  it("いずれかのresourceがfetching中なら検証・再送・再開始を実行しない", async () => {
    const resources = createResources({ signInStatus: "needs_client_trust", withClientTrustEmailCode: true });
    const replaceLocation = vi.fn();
    mockClerkHooks(resources);

    const { result, rerender } = renderHook(() =>
      useSsoCallbackController({ redirectTo: "/dashboard", replaceLocation }),
    );
    await waitFor(() => expect(result.current.viewState.kind).toBe("client-trust"));
    mockClerkHooks(resources, true, { signIn: "idle", signUp: "fetching" });
    rerender();

    await act(async () => {
      await result.current.onVerifyClientTrust({ code: "123456" });
      await result.current.onResendClientTrustCode();
      await result.current.onRestart("login");
    });

    expect(result.current.isSubmitting).toBe(true);
    expect(resources.signIn.mfa.verifyEmailCode).not.toHaveBeenCalled();
    expect(resources.signIn.mfa.sendEmailCode).toHaveBeenCalledOnce();
    expect(resources.signIn.reset).not.toHaveBeenCalled();
    expect(resources.signUp.reset).not.toHaveBeenCalled();
    expect(replaceLocation).not.toHaveBeenCalled();
  });

  it("Client Trustのコード検証後、session IDを確認してfinalizeする", async () => {
    const state = { status: "needs_client_trust" as SignInStatus, createdSessionId: null as string | null };
    const resources = createResources({ signInStatus: state.status, withClientTrustEmailCode: true });
    mutateSignIn(resources, state);
    vi.mocked(resources.signIn.mfa.verifyEmailCode).mockImplementation(async () => {
      state.status = "complete";
      state.createdSessionId = "session-created";
      return { error: null };
    });
    mockClerkHooks(resources);

    render(<SsoCallbackPage redirectTo="/dashboard" />);
    fireEvent.click(await screen.findByRole("button", { name: "確認してログイン" }));

    await waitFor(() => expect(resources.signIn.finalize).toHaveBeenCalledOnce());
    expect(resources.signIn.mfa.verifyEmailCode).toHaveBeenCalledExactlyOnceWith({ code: "123456" });
  });

  it("コード検証後にsession IDがなければfinalizeしない", async () => {
    const state = { status: "needs_client_trust" as SignInStatus, createdSessionId: null as string | null };
    const resources = createResources({ signInStatus: state.status, withClientTrustEmailCode: true });
    mutateSignIn(resources, state);
    vi.mocked(resources.signIn.mfa.verifyEmailCode).mockImplementation(async () => {
      state.status = "complete";
      return { error: null };
    });
    mockClerkHooks(resources);

    render(<SsoCallbackPage redirectTo="/dashboard" />);
    fireEvent.click(await screen.findByRole("button", { name: "確認してログイン" }));

    expect(await screen.findByText(/本人確認が完了しませんでした/)).not.toBeNull();
    expect(resources.signIn.finalize).not.toHaveBeenCalled();
  });

  it("明示的な再開始だけが両attemptをresetして正規化済みredirect付きURLへreplaceする", async () => {
    const resources = createResources({ signUpStatus: "missing_requirements" });
    const replaceLocation = vi.fn();
    mockClerkHooks(resources);

    const { result } = renderHook(() =>
      useSsoCallbackController({ redirectTo: "/dashboard?tab=staff", replaceLocation }),
    );
    await waitFor(() => expect(result.current.viewState.kind).toBe("recovery"));

    await act(async () => {
      await result.current.onRestart("signup");
    });

    expect(resources.signIn.reset).toHaveBeenCalledOnce();
    expect(resources.signUp.reset).toHaveBeenCalledOnce();
    expect(replaceLocation).toHaveBeenCalledExactlyOnceWith("/signup?redirect=%2Fdashboard%3Ftab%3Dstaff");
  });

  it("reset失敗時は遷移せずproviderのraw errorやPIIを表示しない", async () => {
    const resources = createResources({ signUpStatus: "missing_requirements" });
    const replaceLocation = vi.fn();
    vi.mocked(resources.signIn.reset).mockResolvedValue({
      error: { code: "unknown", message: "token=secret user@example.com" },
    } as never);
    mockClerkHooks(resources);

    const { result } = renderHook(() => useSsoCallbackController({ redirectTo: "/dashboard", replaceLocation }));
    await waitFor(() => expect(result.current.viewState.kind).toBe("recovery"));
    await act(async () => {
      await result.current.onRestart("signup");
    });

    expect(result.current.errorMessage).toBe("認証に失敗しました。\n入力内容を確認してください。");
    expect(result.current.errorMessage).not.toContain("token=secret");
    expect(result.current.errorMessage).not.toContain("user@example.com");
    expect(resources.signUp.reset).not.toHaveBeenCalled();
    expect(replaceLocation).not.toHaveBeenCalled();
  });

  it("Core 3 operationのreturned errorも安全な回復文言だけを表示する", async () => {
    const resources = createResources({ signUpTransferable: true });
    vi.mocked(resources.signIn.create).mockResolvedValue({
      error: { code: "too_many_requests", message: "raw provider error token=secret" },
    } as never);
    mockClerkHooks(resources);

    render(<SsoCallbackPage redirectTo="/dashboard" />);

    expect(await screen.findByText(/試行回数が多すぎます/)).not.toBeNull();
    expect(screen.queryByText(/raw provider error/)).toBeNull();
    expect(screen.getByTestId("recovery-view")).not.toBeNull();
  });

  it("Clerk読込中もcaptchaのmount先とspinnerを表示する", () => {
    const resources = createResources();
    mockClerkHooks(resources, false);

    render(<SsoCallbackPage redirectTo="/dashboard" />);

    expect(document.querySelectorAll("#clerk-captcha")).toHaveLength(1);
    expect(screen.getByTestId("spinner")).not.toBeNull();
  });
});
