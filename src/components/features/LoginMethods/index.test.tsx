// @vitest-environment jsdom

import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const overviewController = {
    marker: "overview-controller",
    reload: vi.fn(async () => true),
  };
  const emailPasswordController = {
    marker: "email-password-controller",
    state: {
      phase: "choosingEmail",
      feedback: { status: "idle", message: null },
    },
  };
  const googleController = {
    marker: "google-controller",
    state: {
      phase: "readyToConnect",
      feedback: { status: "idle", message: null },
    },
  };
  const passwordChangeController = {
    marker: "password-change-controller",
    state: { isOpen: false, status: "idle", message: null },
  };
  const reverification = {
    state: {
      status: "idle",
      operationId: null,
      level: null,
      stage: null,
      factors: [],
      selectedFactor: null,
      message: null,
    },
    onNeedsReverification: vi.fn(),
    runOperation: vi.fn(),
    selectFactor: vi.fn(),
    submit: vi.fn(),
    resend: vi.fn(),
    useAnotherFactor: vi.fn(),
    cancel: vi.fn(),
  };
  return {
    clerkState: { isLoaded: true, user: { id: "user-1" } },
    overviewController,
    emailPasswordController,
    googleController,
    passwordChangeController,
    useLoginMethodsController: vi.fn((_options: unknown) => overviewController),
    useEmailPasswordMigrationController: vi.fn((_options: unknown) => emailPasswordController),
    useGoogleConnectionController: vi.fn((_options: unknown) => googleController),
    usePasswordChangeController: vi.fn((_options: unknown) => passwordChangeController),
    loginMethodsView: vi.fn(),
    migrationView: vi.fn(),
    loginMethodsViewMounted: vi.fn(),
    loginMethodsViewUnmounted: vi.fn(),
    showSuccessToast: vi.fn(),
    reverification,
    useLoginMethodReverification: vi.fn((_options: unknown) => reverification),
  };
});

vi.mock("@clerk/react", () => ({
  useUser: () => mocks.clerkState,
}));

vi.mock("@/src/components/shared/feedback", () => ({
  showSuccessToast: mocks.showSuccessToast,
}));

vi.mock("./useLoginMethodsController", () => ({
  useLoginMethodsController: mocks.useLoginMethodsController,
}));

vi.mock("./useLoginMethodReverification", () => ({
  useLoginMethodReverification: mocks.useLoginMethodReverification,
}));

vi.mock("./useEmailPasswordMigrationController", () => ({
  useEmailPasswordMigrationController: mocks.useEmailPasswordMigrationController,
}));

vi.mock("./useGoogleConnectionController", () => ({
  useGoogleConnectionController: mocks.useGoogleConnectionController,
}));

vi.mock("./usePasswordChangeController", () => ({
  usePasswordChangeController: mocks.usePasswordChangeController,
}));

vi.mock("./LoginMethodsView", async () => {
  const { useEffect } = await import("react");
  return {
    LoginMethodsView: (props: unknown) => {
      useEffect(() => {
        mocks.loginMethodsViewMounted();
        return () => mocks.loginMethodsViewUnmounted();
      }, []);
      mocks.loginMethodsView(props);
      return <div data-testid="login-methods-overview" />;
    },
  };
});

vi.mock("./LoginMethodMigrationView", () => ({
  LoginMethodMigrationView: (props: { flow: string; controller: { marker: string } }) => {
    mocks.migrationView(props);
    return <div data-testid="login-method-flow">{`${props.flow}:${props.controller.marker}`}</div>;
  },
}));

import { LoginMethods } from "./index";

describe("ログイン方法のoverviewと追加Modal", () => {
  beforeEach(() => {
    mocks.useLoginMethodsController.mockClear();
    mocks.useEmailPasswordMigrationController.mockClear();
    mocks.useGoogleConnectionController.mockClear();
    mocks.usePasswordChangeController.mockClear();
    mocks.useLoginMethodReverification.mockClear();
    mocks.loginMethodsView.mockClear();
    mocks.migrationView.mockClear();
    mocks.loginMethodsViewMounted.mockClear();
    mocks.loginMethodsViewUnmounted.mockClear();
    mocks.showSuccessToast.mockReset();
    mocks.overviewController.reload.mockReset();
    mocks.overviewController.reload.mockResolvedValue(true);
    mocks.clerkState.isLoaded = true;
    mocks.clerkState.user = { id: "user-1" };
    Object.assign(mocks.emailPasswordController.state, {
      phase: "choosingEmail",
      feedback: { status: "idle", message: null },
    });
    Object.assign(mocks.googleController.state, {
      phase: "readyToConnect",
      feedback: { status: "idle", message: null },
    });
  });

  it("overviewでは共通本人再確認だけをcontrollerへ渡し、旧capabilityを注入しない", () => {
    render(<LoginMethods />);

    expect(screen.getByTestId("login-methods-overview")).toBeDefined();
    expect(screen.queryByTestId("login-method-flow")).toBeNull();
    expect(mocks.loginMethodsView).toHaveBeenCalledWith(expect.objectContaining({ isMigrationDialogOpen: false }));

    const overviewOptions = mocks.useLoginMethodsController.mock.calls[0]?.[0] as {
      operationCooldown?: unknown;
    };
    expect(overviewOptions).toEqual(
      expect.objectContaining({
        isLoaded: true,
        user: { id: "user-1" },
        onNeedsReverification: mocks.reverification.onNeedsReverification,
        runOperation: mocks.reverification.runOperation,
      }),
    );
    expect(overviewOptions).not.toHaveProperty("capabilities");
    expect(mocks.useLoginMethodReverification).toHaveBeenCalledWith({
      operationCooldown: overviewOptions.operationCooldown,
    });

    const emailOptions = mocks.useEmailPasswordMigrationController.mock.calls[0]?.[0] as {
      operationCooldown?: unknown;
    };
    expect(emailOptions).toEqual(
      expect.objectContaining({
        active: false,
        onNeedsReverification: mocks.reverification.onNeedsReverification,
        runOperation: mocks.reverification.runOperation,
      }),
    );
    expect(emailOptions).not.toHaveProperty("enabled");
    expect(emailOptions).not.toHaveProperty("purpose");
    expect(emailOptions.operationCooldown).toBe(overviewOptions.operationCooldown);

    expect(mocks.useGoogleConnectionController).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        oauthReturn: false,
        operationCooldown: overviewOptions.operationCooldown,
      }),
    );
    expect(mocks.usePasswordChangeController).toHaveBeenCalledWith(
      expect.objectContaining({
        isLoaded: true,
        user: { id: "user-1" },
        onNeedsReverification: mocks.reverification.onNeedsReverification,
        runOperation: mocks.reverification.runOperation,
      }),
    );
    expect(mocks.loginMethodsView).toHaveBeenCalledWith(
      expect.objectContaining({ passwordChangeController: mocks.passwordChangeController }),
    );
  });

  it("current Userが切り替わると操作Modalを含む内部stateを破棄する", async () => {
    const view = render(<LoginMethods flow="add-email-password" />);
    await waitFor(() => expect(mocks.loginMethodsViewMounted).toHaveBeenCalledOnce());

    mocks.clerkState.user = { id: "user-2" };
    view.rerender(<LoginMethods flow="add-email-password" />);

    await waitFor(() => {
      expect(mocks.loginMethodsViewUnmounted).toHaveBeenCalledOnce();
      expect(mocks.loginMethodsViewMounted).toHaveBeenCalledTimes(2);
    });
  });

  it("完了状態の再取得中にcurrent Userが切り替われば通知と画面遷移を行わない", async () => {
    Object.assign(mocks.googleController.state, {
      phase: "methodReady",
      feedback: { status: "success", message: "Googleログインを追加しました。" },
    });
    let resolveReload: ((value: boolean) => void) | undefined;
    const completionReload = new Promise<boolean>((resolve) => {
      resolveReload = resolve;
    });
    mocks.overviewController.reload.mockReturnValueOnce(completionReload);
    const onBackToOverview = vi.fn();
    const view = render(<LoginMethods flow="connect-google" onBackToOverview={onBackToOverview} />);
    await waitFor(() => expect(mocks.overviewController.reload).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("login-method-flow")).toBeNull();

    Object.assign(mocks.googleController.state, {
      phase: "readyToConnect",
      feedback: { status: "idle", message: null },
    });
    mocks.clerkState.user = { id: "user-2" };
    view.rerender(<LoginMethods flow="connect-google" onBackToOverview={onBackToOverview} />);
    await act(async () => resolveReload?.(true));

    expect(mocks.showSuccessToast).not.toHaveBeenCalled();
    expect(onBackToOverview).not.toHaveBeenCalled();
  });

  it("メール・パスワード追加中もoverviewを残し、対応するcontrollerだけをModalへ渡す", () => {
    const onBackToOverview = vi.fn();
    render(<LoginMethods flow="add-email-password" onBackToOverview={onBackToOverview} />);

    expect(screen.getByTestId("login-methods-overview")).toBeDefined();
    expect(screen.getByTestId("login-method-flow").textContent).toBe("add-email-password:email-password-controller");
    expect(mocks.loginMethodsView).toHaveBeenCalledWith(expect.objectContaining({ isMigrationDialogOpen: true }));
    expect(mocks.migrationView).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "add-email-password",
        controller: mocks.emailPasswordController,
        reverification: mocks.reverification,
        onBackToOverview,
      }),
    );
    expect(mocks.useEmailPasswordMigrationController).toHaveBeenCalledWith(expect.objectContaining({ active: true }));
    expect(mocks.useGoogleConnectionController).toHaveBeenCalledWith(
      expect.objectContaining({ active: false, oauthReturn: false }),
    );
  });

  it("Google追加中もoverviewを残し、OAuth markerをGoogle controllerだけへ渡す", () => {
    const onHandled = vi.fn();
    const onBackToOverview = vi.fn();
    render(
      <LoginMethods
        flow="connect-google"
        oauth="google"
        onGoogleOAuthReturnHandled={onHandled}
        onBackToOverview={onBackToOverview}
      />,
    );

    expect(screen.getByTestId("login-methods-overview")).toBeDefined();
    expect(screen.getByTestId("login-method-flow").textContent).toBe("connect-google:google-controller");
    expect(mocks.loginMethodsView).toHaveBeenCalledWith(expect.objectContaining({ isMigrationDialogOpen: true }));
    expect(mocks.useGoogleConnectionController).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        oauthReturn: true,
        onOAuthReturnHandled: onHandled,
        onNeedsReverification: mocks.reverification.onNeedsReverification,
        runOperation: mocks.reverification.runOperation,
      }),
    );
    expect(mocks.migrationView).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: "connect-google",
        controller: mocks.googleController,
        onBackToOverview,
      }),
    );
  });

  it("OAuth markerがなければGoogle追加Modalでも帰還処理を開始しない", () => {
    render(<LoginMethods flow="connect-google" />);

    expect(mocks.useGoogleConnectionController).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, oauthReturn: false }),
    );
  });

  it("メール・パスワード追加の成功時は完了Modalを挟まずSnackbarを出してoverviewへ戻す", async () => {
    Object.assign(mocks.emailPasswordController.state, {
      phase: "methodReady",
      feedback: { status: "success", message: "メールアドレスとパスワードを設定しました。" },
    });
    const onBackToOverview = vi.fn();

    render(<LoginMethods flow="add-email-password" onBackToOverview={onBackToOverview} />);

    expect(screen.getByTestId("login-methods-overview")).toBeDefined();
    expect(screen.queryByTestId("login-method-flow")).toBeNull();
    await waitFor(() => expect(onBackToOverview).toHaveBeenCalledOnce());
    expect(mocks.overviewController.reload).toHaveBeenCalledOnce();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "メインのメールアドレスとパスワードを設定しました",
      description: "Google認証とシフト通知先メールアドレスは変わりません。",
    });
    expect(screen.queryByText("設定が完了しました")).toBeNull();
  });

  it("Google追加の成功時は完了Modalを挟まずSnackbarを出してoverviewへ戻す", async () => {
    Object.assign(mocks.googleController.state, {
      phase: "methodReady",
      feedback: { status: "success", message: "Googleログインを追加しました。" },
    });
    const onBackToOverview = vi.fn();

    render(<LoginMethods flow="connect-google" onBackToOverview={onBackToOverview} />);

    expect(screen.queryByTestId("login-method-flow")).toBeNull();
    await waitFor(() => expect(onBackToOverview).toHaveBeenCalledOnce());
    expect(mocks.overviewController.reload).toHaveBeenCalledOnce();
    expect(mocks.showSuccessToast).toHaveBeenCalledExactlyOnceWith({
      title: "Googleログインを追加しました",
    });
    expect(screen.queryByText("設定が完了しました")).toBeNull();
  });

  it("overviewへ戻った後の2回目のGoogle追加もSnackbarと帰還を実行する", async () => {
    Object.assign(mocks.googleController.state, {
      phase: "methodReady",
      feedback: { status: "success", message: "Googleログインを追加しました。" },
    });
    const onBackToOverview = vi.fn();
    const view = render(<LoginMethods flow="connect-google" onBackToOverview={onBackToOverview} />);

    await waitFor(() => expect(onBackToOverview).toHaveBeenCalledOnce());

    Object.assign(mocks.googleController.state, {
      phase: "readyToConnect",
      feedback: { status: "idle", message: null },
    });
    view.rerender(<LoginMethods onBackToOverview={onBackToOverview} />);

    Object.assign(mocks.googleController.state, {
      phase: "methodReady",
      feedback: { status: "success", message: "Googleログインを追加しました。" },
    });
    view.rerender(<LoginMethods flow="connect-google" onBackToOverview={onBackToOverview} />);

    await waitFor(() => expect(onBackToOverview).toHaveBeenCalledTimes(2));
    expect(mocks.overviewController.reload).toHaveBeenCalledTimes(2);
    expect(mocks.showSuccessToast).toHaveBeenCalledTimes(2);
  });
});
