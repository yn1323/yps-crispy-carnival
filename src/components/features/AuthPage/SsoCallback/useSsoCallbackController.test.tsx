// @vitest-environment jsdom

import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clerkHooks = vi.hoisted(() => ({
  SignIn: vi.fn(),
  SignUp: vi.fn(),
  useClerk: vi.fn(),
  useSignIn: vi.fn(),
  useSignUp: vi.fn(),
}));

vi.mock("@clerk/react", () => clerkHooks);

vi.mock("@/src/components/templates/FullPageSpinner", () => ({
  FullPageSpinner: () => <div data-testid="spinner" />,
}));

vi.mock("../LoginFlow", () => ({
  LoginFlow: () => <div data-testid="login-flow" />,
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
  signInExistingSessionId?: string;
  signUpExistingSessionId?: string;
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
      create: vi.fn<SsoCallbackResources["signIn"]["create"]>().mockResolvedValue({ error: null }),
      finalize: vi.fn<SsoCallbackResources["signIn"]["finalize"]>().mockResolvedValue({ error: null }),
    },
    signUp: {
      status: options.signUpStatus ?? "missing_requirements",
      isTransferable: options.signUpTransferable ?? false,
      existingSession: options.signUpExistingSessionId ? { sessionId: options.signUpExistingSessionId } : undefined,
      create: vi.fn<SsoCallbackResources["signUp"]["create"]>().mockResolvedValue({ error: null }),
      finalize: vi.fn<SsoCallbackResources["signUp"]["finalize"]>().mockResolvedValue({ error: null }),
    },
  };
}

function createNavigation(): SsoCallbackNavigation {
  return {
    navigateToApp: vi.fn<SsoCallbackNavigation["navigateToApp"]>(),
    continueSignIn: vi.fn(),
    continueSignUp: vi.fn(),
  };
}

function mockClerkHooks(resources: SsoCallbackResources, loaded = true) {
  clerkHooks.useClerk.mockReturnValue({ ...resources.clerk, loaded });
  clerkHooks.useSignIn.mockReturnValue({ signIn: resources.signIn });
  clerkHooks.useSignUp.mockReturnValue({ signUp: resources.signUp });
}

beforeEach(() => {
  clerkHooks.SignIn.mockReset();
  clerkHooks.SignIn.mockImplementation(() => <div data-testid="sign-in-continuation" />);
  clerkHooks.SignUp.mockReset();
  clerkHooks.SignUp.mockImplementation(() => <div data-testid="sign-up-continuation" />);
  clerkHooks.useClerk.mockReset();
  clerkHooks.useSignIn.mockReset();
  clerkHooks.useSignUp.mockReset();
  window.history.replaceState(null, "", "/");
});

describe("SSO callback", () => {
  it("完了したsign-inをfinalizeし、decorate済みの保持redirectへ遷移する", async () => {
    const resources = createResources({ signInStatus: "complete" });
    mockClerkHooks(resources);

    renderHook(() => useSsoCallbackController({ redirectTo: "/dashboard?tab=staff" }));

    await waitFor(() => expect(resources.signIn.finalize).toHaveBeenCalledOnce());
    const navigate = vi.mocked(resources.signIn.finalize).mock.calls[0]?.[0]?.navigate;
    const decorateUrl = vi.fn(() => "#dashboard");
    await navigate?.({ session: {} as never, decorateUrl });

    expect(decorateUrl).toHaveBeenCalledExactlyOnceWith("/dashboard?tab=staff");
    expect(window.location.hash).toBe("#dashboard");
  });

  it("transfer可能なsign-upをsign-inへ引き継ぎ、完了後にfinalizeする", async () => {
    let signInStatus: SignInStatus = "needs_identifier";
    const resources = createResources({ signUpTransferable: true });
    Object.defineProperty(resources.signIn, "status", { get: () => signInStatus });
    vi.mocked(resources.signIn.create).mockImplementation(async () => {
      signInStatus = "complete";
      return { error: null };
    });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signIn.create).toHaveBeenCalledExactlyOnceWith({ transfer: true });
    expect(resources.signIn.finalize).toHaveBeenCalledExactlyOnceWith({ navigate: navigation.navigateToApp });
    expect(navigation.continueSignIn).not.toHaveBeenCalled();
  });

  it("transfer先のsign-upが未完了なら既存状態の継続を要求する", async () => {
    const resources = createResources({ signInTransferable: true });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signUp.create).toHaveBeenCalledExactlyOnceWith({ transfer: true });
    expect(resources.signUp.finalize).not.toHaveBeenCalled();
    expect(navigation.continueSignUp).toHaveBeenCalledOnce();
  });

  it("完了したsign-upをfinalizeする", async () => {
    const resources = createResources({ signUpStatus: "complete" });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(resources.signUp.finalize).toHaveBeenCalledExactlyOnceWith({ navigate: navigation.navigateToApp });
  });

  it("追加情報が必要なsign-upは既存状態の継続を要求する", async () => {
    const resources = createResources({ signUpStatus: "missing_requirements" });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(navigation.continueSignUp).toHaveBeenCalledOnce();
    expect(resources.signUp.finalize).not.toHaveBeenCalled();
  });

  it.each([
    { label: "first factor", status: "needs_first_factor" as const },
    { label: "second factor", status: "needs_second_factor" as const },
    { label: "client trust", status: "needs_client_trust" as const },
    { label: "new password", status: "needs_new_password" as const },
    { label: "Protect check", status: "needs_protect_check" as const },
  ])("$labelが必要なら既存sign-in状態の継続を要求する", async ({ status }) => {
    const resources = createResources({ signInStatus: status });
    const navigation = createNavigation();

    await handleSsoCallback(resources, navigation);

    expect(navigation.continueSignIn).toHaveBeenCalledOnce();
    expect(resources.clerk.setActive).not.toHaveBeenCalled();
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

  it("継続先を判定できない状態をerrorとして終了する", async () => {
    const resources = createResources({ signUpStatus: "abandoned" });

    await expect(handleSsoCallback(resources, createNavigation())).rejects.toThrowError(
      "SSO callback could not continue from the current authentication state",
    );
  });

  it("Core 3 operationのreturned errorを日本語fallbackへ渡す", async () => {
    const resources = createResources({ signUpTransferable: true });
    vi.mocked(resources.signIn.create).mockResolvedValue({
      error: { code: "too_many_requests", message: "rate limited" },
    } as never);
    mockClerkHooks(resources);

    const { result } = renderHook(() => useSsoCallbackController({ redirectTo: "/dashboard?tab=staff" }));

    await waitFor(() => expect(result.current.isProcessing).toBe(false));
    expect(result.current.errorMessage).toBe("試行回数が多すぎます。時間をおいてもう一度お試しください。");
    expect(resources.signIn.finalize).not.toHaveBeenCalled();
  });

  it("処理中もClerk captchaのmount先を表示する", () => {
    const resources = createResources();
    mockClerkHooks(resources, false);

    render(<SsoCallbackPage redirectTo="/dashboard" />);

    expect(document.querySelector("#clerk-captcha")).not.toBeNull();
    expect(screen.getByTestId("spinner")).not.toBeNull();
  });

  it("追加本人確認は保持redirect付きのprebuilt SignInで継続する", async () => {
    const resources = createResources({ signInStatus: "needs_client_trust" });
    mockClerkHooks(resources);

    render(<SsoCallbackPage redirectTo="/dashboard?tab=staff" />);

    expect(await screen.findByTestId("sign-in-continuation")).not.toBeNull();
    expect(clerkHooks.SignIn.mock.calls[0]?.[0]).toEqual({
      forceRedirectUrl: "/dashboard?tab=staff",
      routing: "hash",
    });
    expect(screen.queryByTestId("login-flow")).toBeNull();
    expect(document.querySelector("#clerk-captcha")).not.toBeNull();
  });

  it("transfer後の未完了sign-upは保持redirect付きのprebuilt SignUpで継続する", async () => {
    const resources = createResources({ signInTransferable: true });
    mockClerkHooks(resources);

    render(<SsoCallbackPage redirectTo="/dashboard?tab=staff" />);

    expect(await screen.findByTestId("sign-up-continuation")).not.toBeNull();
    expect(clerkHooks.SignUp.mock.calls[0]?.[0]).toEqual({
      forceRedirectUrl: "/dashboard?tab=staff",
      routing: "hash",
    });
    expect(screen.queryByTestId("login-flow")).toBeNull();
  });
});
