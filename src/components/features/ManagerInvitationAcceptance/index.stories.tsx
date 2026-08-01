import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { ManagerInvitationAcceptanceView } from ".";

const actions = {
  onAccept: fn(),
  onLogin: fn(),
  onSignup: fn(),
  onSwitchAccount: fn(),
  onGoToDashboard: fn(),
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
export const EmailMismatch: Story = {
  args: { state: { kind: "emailMismatch", isSwitchingAccount: false } },
};
export const Conflict: Story = { args: { state: { kind: "conflict", isAccepting: false } } };
export const RetryableError: Story = {
  args: {
    state: { kind: "retryableError", isRetrying: false },
    actions: { ...actions, onAccept: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "もう一度試す" }));
    expect(args.actions.onAccept).toHaveBeenCalledOnce();
  },
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
    actions: { ...actions, onGoToDashboard: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ダッシュボードへ" }));
    expect(args.actions.onGoToDashboard).toHaveBeenCalledOnce();
  },
};

export const LoginBehavior: Story = {
  args: {
    state: {
      kind: "ready",
      organizationName: "株式会社さくらダイニング",
      expiresAtLabel: "2026年7月23日 18:00",
      isSignedIn: false,
      isAccepting: false,
    },
    actions: { ...actions, onLogin: fn() },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "ログインして続ける" }));
    expect(args.actions.onLogin).toHaveBeenCalledOnce();
  },
};
