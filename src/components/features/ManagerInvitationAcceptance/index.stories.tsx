import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  ManagerInvitationAcceptanceView,
  type ManagerInvitationAcceptanceViewProps,
  type ManagerInvitationAcceptanceViewState,
} from ".";

const noop = () => {};

const actions: ManagerInvitationAcceptanceViewProps["actions"] = {
  onAccept: noop,
  onLogin: noop,
  onSignup: noop,
  onStartVerification: noop,
  onVerifyCode: noop,
  onResendCode: noop,
  onBackToVerificationInput: noop,
  onGoToDashboard: noop,
};

const meta = {
  title: "Features/ManagerInvitationAcceptance",
  component: ManagerInvitationAcceptanceView,
  parameters: { layout: "fullscreen" },
  args: {
    state: {
      kind: "ready",
      organizationName: "株式会社さくらダイニング",
      expiresAtLabel: "2026年7月23日 18:00",
      isSignedIn: true,
      isAccepting: false,
    },
    actions,
  },
} satisfies Meta<typeof ManagerInvitationAcceptanceView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadySignedIn: Story = {};

export const ReadySignedOut: Story = {
  args: {
    state: {
      kind: "ready",
      organizationName: "株式会社さくらダイニング",
      expiresAtLabel: "2026年7月23日 18:00",
      isSignedIn: false,
      isAccepting: false,
    },
  },
};

export const Loading: Story = { args: { state: { kind: "loading" } } };
export const Expired: Story = { args: { state: { kind: "expired" } } };
export const Revoked: Story = { args: { state: { kind: "revoked" } } };
export const Used: Story = { args: { state: { kind: "used" } } };
export const Unavailable: Story = { args: { state: { kind: "unavailable" } } };
export const Invalid: Story = { args: { state: { kind: "invalid" } } };
export const VerificationRequired: Story = {
  args: {
    state: {
      kind: "verificationRequired",
      step: "input",
      errorMessage: null,
      isBusy: false,
    },
  },
};
export const VerificationCode: Story = {
  args: {
    state: {
      kind: "verificationRequired",
      step: "code",
      maskedEmail: "in***@example.com",
      errorMessage: null,
      infoMessage: null,
      isBusy: false,
    },
  },
};
export const VerificationRequiredMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    state: {
      kind: "verificationRequired",
      step: "input",
      errorMessage: null,
      isBusy: false,
    },
  },
};
export const Conflict: Story = { args: { state: { kind: "conflict", isAccepting: false } } };
export const RetryableError: Story = {
  args: { state: { kind: "retryableError", isRetrying: false } },
};
export const Accepted: Story = {
  args: {
    state: {
      kind: "accepted",
      organizationName: "株式会社さくらダイニング",
      isPreparingDestination: true,
      hasDestination: true,
    },
  },
};

export const AcceptedWithoutDestination: Story = {
  args: {
    state: {
      kind: "accepted",
      organizationName: "株式会社さくらダイニング",
      isPreparingDestination: false,
      hasDestination: false,
    },
  },
};

function RetryBehaviorStory({ actions: storyActions }: ManagerInvitationAcceptanceViewProps) {
  const [didRetry, setDidRetry] = useState(false);
  return (
    <>
      <ManagerInvitationAcceptanceView
        state={{ kind: "retryableError", isRetrying: false }}
        actions={{ ...storyActions, onAccept: () => setDidRetry(true) }}
      />
      {didRetry && <output>招待の再確認を要求しました</output>}
    </>
  );
}

export const RetryActionBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: (args) => <RetryBehaviorStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "再実行する" }));
    await expect(canvas.getByText("招待の再確認を要求しました")).toBeInTheDocument();
  },
};

function AcceptedWithoutDestinationBehaviorStory({ actions: storyActions }: ManagerInvitationAcceptanceViewProps) {
  const [didRequestDashboard, setDidRequestDashboard] = useState(false);
  return (
    <>
      <ManagerInvitationAcceptanceView
        state={{
          kind: "accepted",
          organizationName: "株式会社さくらダイニング",
          isPreparingDestination: false,
          hasDestination: false,
        }}
        actions={{ ...storyActions, onGoToDashboard: () => setDidRequestDashboard(true) }}
      />
      {didRequestDashboard && <output>ダッシュボードへの遷移を要求しました</output>}
    </>
  );
}

export const AcceptedWithoutDestinationBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: (args) => <AcceptedWithoutDestinationBehaviorStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "シフトリを確認する" }));
    await expect(canvas.getByText("ダッシュボードへの遷移を要求しました")).toBeInTheDocument();
  },
};

function VerificationFlowStory({ actions: storyActions }: ManagerInvitationAcceptanceViewProps) {
  const [state, setState] = useState<ManagerInvitationAcceptanceViewState>({
    kind: "verificationRequired",
    step: "input",
    errorMessage: null,
    isBusy: false,
  });

  return (
    <ManagerInvitationAcceptanceView
      state={state}
      actions={{
        ...storyActions,
        onStartVerification: () => {
          setState({
            kind: "verificationRequired",
            step: "code",
            maskedEmail: "in***@example.com",
            errorMessage: null,
            infoMessage: null,
            isBusy: false,
          });
        },
        onVerifyCode: () => {
          setState({
            kind: "accepted",
            organizationName: "株式会社さくらダイニング",
            isPreparingDestination: false,
            hasDestination: false,
          });
        },
      }}
    />
  );
}

export const VerificationFlowBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: (args) => <VerificationFlowStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "招待先メールアドレス" }), "invite@example.com");
    await userEvent.click(canvas.getByRole("button", { name: "確認コードを送信" }));
    await expect(await canvas.findByRole("textbox", { name: "確認コード" })).toBeInTheDocument();
    await expect(canvas.queryByText("invite@example.com", { exact: false })).not.toBeInTheDocument();

    await userEvent.type(canvas.getByRole("textbox", { name: "確認コード" }), "123456");
    await userEvent.click(canvas.getByRole("button", { name: "確認して参加する" }));
    await expect(await canvas.findByRole("heading", { name: "管理者として参加しました" })).toBeInTheDocument();
  },
};

function LoginBehaviorStory({ state, actions: storyActions }: ManagerInvitationAcceptanceViewProps) {
  const [didRequestLogin, setDidRequestLogin] = useState(false);

  return (
    <>
      <ManagerInvitationAcceptanceView
        state={state}
        actions={{ ...storyActions, onLogin: () => setDidRequestLogin(true) }}
      />
      {didRequestLogin && <output>ログイン画面への遷移を要求しました</output>}
    </>
  );
}

export const LoginBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    state: {
      kind: "ready",
      organizationName: "株式会社さくらダイニング",
      expiresAtLabel: "2026年7月23日 18:00",
      isSignedIn: false,
      isAccepting: false,
    },
  },
  render: (args) => <LoginBehaviorStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ログインして続ける" }));
    await expect(canvas.getByText("ログイン画面への遷移を要求しました")).toBeInTheDocument();
  },
};
