import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import {
  type ManagerInvitationAcceptanceAccount,
  ManagerInvitationAcceptanceView,
  type ManagerInvitationAcceptanceViewProps,
} from ".";

const noop = () => {};

const actions: ManagerInvitationAcceptanceViewProps["actions"] = {
  onAccept: noop,
  onLogin: noop,
  onSignup: noop,
  onLogout: noop,
  onGoToDashboard: noop,
};

const account: ManagerInvitationAcceptanceAccount = {
  email: "suzuki.hanako@example.com",
  errorMessage: null,
  isLoggingOut: false,
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
    account,
    actions,
  },
} satisfies Meta<typeof ManagerInvitationAcceptanceView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadySignedIn: Story = {};

export const ReadySignedInAccepting: Story = {
  args: {
    state: {
      kind: "ready",
      organizationName: "株式会社さくらダイニング",
      expiresAtLabel: "2026年7月23日 18:00",
      isSignedIn: true,
      isAccepting: true,
    },
  },
};

export const ReadySignedInMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: { viewport: { value: "mobile2", isRotated: false } },
  args: {
    account: { ...account, email: "very.long.account.name.for.wrapping.check@subdomain.example.co.jp" },
  },
};

export const ReadySignedOut: Story = {
  args: {
    state: {
      kind: "ready",
      organizationName: "株式会社さくらダイニング",
      expiresAtLabel: "2026年7月23日 18:00",
      isSignedIn: false,
      isAccepting: false,
    },
    account: null,
  },
};

export const Loading: Story = { args: { state: { kind: "loading" } } };
export const Expired: Story = { args: { state: { kind: "expired" } } };
export const ExpiredSignedOut: Story = { args: { state: { kind: "expired" }, account: null } };
export const Revoked: Story = { args: { state: { kind: "revoked" } } };
export const Used: Story = { args: { state: { kind: "used" } } };
export const Unavailable: Story = { args: { state: { kind: "unavailable" } } };
export const Invalid: Story = { args: { state: { kind: "invalid" } } };
export const Conflict: Story = { args: { state: { kind: "conflict" } } };
export const AccountAlreadyRegistered: Story = {
  args: { state: { kind: "accountAlreadyRegistered", organizationName: "株式会社さくらダイニング" } },
};
export const LogoutFailed: Story = {
  args: {
    state: { kind: "conflict" },
    account: { ...account, errorMessage: "ログアウトできませんでした。もう一度お試しください。" },
  },
};
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

function SignedInBehaviorStory({
  state,
  account: storyAccount,
  actions: storyActions,
}: ManagerInvitationAcceptanceViewProps) {
  const [requested, setRequested] = useState<string | null>(null);

  return (
    <>
      <ManagerInvitationAcceptanceView
        state={state}
        account={storyAccount}
        actions={{
          ...storyActions,
          onAccept: () => setRequested("参加を要求しました"),
          onLogout: () => setRequested("ログアウトを要求しました"),
        }}
      />
      {requested && <output>{requested}</output>}
    </>
  );
}

export const AcceptBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: (args) => <SignedInBehaviorStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "参加する" }));
    await expect(canvas.getByText("参加を要求しました")).toBeInTheDocument();
  },
};

export const LogoutBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  render: (args) => <SignedInBehaviorStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ログアウト" }));
    await expect(canvas.getByText("ログアウトを要求しました")).toBeInTheDocument();
  },
};

export const SwitchAccountBehavior: Story = {
  parameters: { screenshot: { skip: true } },
  args: { state: { kind: "accountAlreadyRegistered", organizationName: "株式会社さくらダイニング" } },
  render: (args) => <SignedInBehaviorStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "別のアカウントでログインする" }));
    await expect(canvas.getByText("ログアウトを要求しました")).toBeInTheDocument();
  },
};

function RetryBehaviorStory({ actions: storyActions }: ManagerInvitationAcceptanceViewProps) {
  const [didRetry, setDidRetry] = useState(false);
  return (
    <>
      <ManagerInvitationAcceptanceView
        state={{ kind: "retryableError", isRetrying: false }}
        account={account}
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
        account={account}
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

function LoginBehaviorStory({ state, actions: storyActions }: ManagerInvitationAcceptanceViewProps) {
  const [didRequestLogin, setDidRequestLogin] = useState(false);

  return (
    <>
      <ManagerInvitationAcceptanceView
        state={state}
        account={null}
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
    const header = within(canvas.getByRole("banner"));

    await expect(header.queryByRole("link", { name: "ログイン" })).not.toBeInTheDocument();
    await expect(header.queryByRole("link", { name: "シフトリをはじめる" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "すでにアカウントを持っている" }));
    await expect(canvas.getByText("ログイン画面への遷移を要求しました")).toBeInTheDocument();
  },
};
