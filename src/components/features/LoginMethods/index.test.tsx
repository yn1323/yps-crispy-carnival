// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DISABLED_LOGIN_METHOD_CAPABILITIES, LOGIN_METHOD_CAPABILITIES } from "./capabilities";

const mocks = vi.hoisted(() => ({
  useLoginMethodsController: vi.fn(() => ({ marker: "controller" })),
  useEmailPasswordMigrationController: vi.fn(() => ({ marker: "email-migration" })),
  useGoogleConnectionController: vi.fn(() => ({ marker: "google-migration" })),
  useGoogleReplacementController: vi.fn(() => ({ marker: "replacement-migration" })),
  loginMethodsView: vi.fn(),
  migrationView: vi.fn(),
  reverification: {
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
  },
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({ isLoaded: true, user: { id: "user-1" } }),
}));

vi.mock("./useLoginMethodsController", () => ({
  useLoginMethodsController: mocks.useLoginMethodsController,
}));

vi.mock("./useLoginMethodReverification", () => ({
  useLoginMethodReverification: () => mocks.reverification,
}));

vi.mock("./useEmailPasswordMigrationController", () => ({
  useEmailPasswordMigrationController: mocks.useEmailPasswordMigrationController,
}));

vi.mock("./useGoogleConnectionController", () => ({
  useGoogleConnectionController: mocks.useGoogleConnectionController,
}));

vi.mock("./useGoogleReplacementController", () => ({
  useGoogleReplacementController: mocks.useGoogleReplacementController,
}));

vi.mock("./LoginMethodsView", () => ({
  LoginMethodsView: (props: unknown) => {
    mocks.loginMethodsView(props);
    return null;
  },
}));

vi.mock("./LoginMethodMigrationView", () => ({
  LoginMethodMigrationView: (props: { flow: string; onRequestPreviousMethodRemoval: () => void }) => {
    mocks.migrationView(props);
    return (
      <button type="button" data-testid="migration-flow" onClick={props.onRequestPreviousMethodRemoval}>
        {props.flow}
      </button>
    );
  },
}));

import { LoginMethods } from "./index";

describe("ログイン設定のcanary capability", () => {
  beforeEach(() => {
    mocks.useLoginMethodsController.mockClear();
    mocks.useEmailPasswordMigrationController.mockClear();
    mocks.useGoogleConnectionController.mockClear();
    mocks.useGoogleReplacementController.mockClear();
    mocks.loginMethodsView.mockClear();
    mocks.migrationView.mockClear();
  });

  it("通常buildでは実験的な操作を閉じたcapabilityを注入する", () => {
    render(<LoginMethods />);

    expect(LOGIN_METHOD_CAPABILITIES).toEqual(DISABLED_LOGIN_METHOD_CAPABILITIES);
    expect(mocks.useLoginMethodsController).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: LOGIN_METHOD_CAPABILITIES }),
    );
  });

  it("メール・パスワード移行へsetPassword capabilityと共通本人再確認を注入する", () => {
    render(<LoginMethods flow="add-email-password" />);

    expect(screen.getByTestId("migration-flow").textContent).toBe("add-email-password");
    expect(mocks.useEmailPasswordMigrationController).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: LOGIN_METHOD_CAPABILITIES.setPassword,
        onNeedsReverification: mocks.reverification.onNeedsReverification,
        runOperation: mocks.reverification.runOperation,
      }),
    );
  });

  it("Google追加の正当なOAuth markerだけを専用controllerへ渡す", () => {
    const onHandled = vi.fn();
    render(<LoginMethods flow="connect-google" oauth="google" onGoogleOAuthReturnHandled={onHandled} />);

    expect(screen.getByTestId("migration-flow").textContent).toBe("connect-google");
    expect(mocks.useGoogleConnectionController).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: LOGIN_METHOD_CAPABILITIES.connectGoogle,
        flow: "connect-google",
        oauthReturn: true,
        onOAuthReturnHandled: onHandled,
      }),
    );
  });

  it("Google置換へ構成capability全体を渡し、独立controllerで処理する", () => {
    render(<LoginMethods flow="replace-google" />);

    expect(screen.getByTestId("migration-flow").textContent).toBe("replace-google");
    expect(mocks.useGoogleReplacementController).toHaveBeenCalledWith(
      expect.objectContaining({ capabilities: LOGIN_METHOD_CAPABILITIES, oauthReturn: false }),
    );
  });

  it.each([
    ["add-email-password", "google"],
    ["connect-google", "password"],
  ] as const)("%sの結果から停止対象%sをPageへ通知する", (flow, expectedKind) => {
    const onRequestPreviousMethodRemoval = vi.fn();
    render(<LoginMethods flow={flow} onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval} />);

    fireEvent.click(screen.getByTestId("migration-flow"));

    expect(onRequestPreviousMethodRemoval).toHaveBeenCalledWith(expectedKind);
  });

  it("Google置換の完了画面から追加flow用の停止選択を通知しない", () => {
    const onRequestPreviousMethodRemoval = vi.fn();
    render(<LoginMethods flow="replace-google" onRequestPreviousMethodRemoval={onRequestPreviousMethodRemoval} />);

    fireEvent.click(screen.getByTestId("migration-flow"));

    expect(onRequestPreviousMethodRemoval).not.toHaveBeenCalled();
  });

  it("overviewへ一時的な停止対象とclaim callbackを渡す", () => {
    const onPendingRemovalClaimed = vi.fn();
    render(<LoginMethods pendingRemovalKind="password" onPendingRemovalClaimed={onPendingRemovalClaimed} />);

    expect(mocks.loginMethodsView).toHaveBeenCalledWith(
      expect.objectContaining({ pendingRemovalKind: "password", onPendingRemovalClaimed }),
    );
  });
});
