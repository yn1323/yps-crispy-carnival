import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRouterState } from "@tanstack/react-router";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { AuthContent } from ".";

const noop = () => {};
type AuthContentArgs = ComponentProps<typeof AuthContent>;

const meta = {
  title: "Features/AuthPage",
  component: AuthContent,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    mode: "login",
    onGoogle: noop,
    onLogin: noop,
    onSignup: noop,
    onVerifyEmail: noop,
    onRestartSignup: noop,
    onRequestReset: noop,
    onResetPassword: noop,
  },
} satisfies Meta<typeof AuthContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const modeFromPathname = (pathname: string): AuthContentArgs["mode"] => {
  if (pathname === "/signup") return "signup";
  if (pathname === "/forgot-password") return "forgot-password";
  return "login";
};

const RoutedAuthContent = (args: AuthContentArgs) => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return <AuthContent {...args} mode={modeFromPathname(pathname)} />;
};

const SignupVerificationRestartContent = (args: AuthContentArgs) => {
  const [isVerificationStep, setIsVerificationStep] = useState(true);

  return (
    <AuthContent
      {...args}
      mode="signup"
      isVerificationStep={isVerificationStep}
      onRestartSignup={() => setIsVerificationStep(false)}
    />
  );
};

export const Login: Story = {
  args: {
    mode: "login",
  },
};

export const Signup: Story = {
  args: {
    mode: "signup",
  },
};

export const ForgotPassword: Story = {
  args: {
    mode: "forgot-password",
  },
};

export const Loading: Story = {
  args: {
    mode: "login",
    isInitialLoading: true,
  },
};

export const Submitting: Story = {
  args: {
    mode: "login",
    isSubmitting: true,
  },
};

export const ErrorState: Story = {
  args: {
    mode: "login",
    errorMessage: "メールアドレスまたはパスワードが正しくありません。",
  },
};

export const LineInAppBrowser: Story = {
  args: {
    mode: "login",
    isLineBrowser: true,
  },
};

export const SignupVerification: Story = {
  args: {
    mode: "signup",
    isVerificationStep: true,
  },
};

export const SignupVerificationRestart: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  args: {
    mode: "signup",
  },
  render: (args) => <SignupVerificationRestartContent {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("メールに届いた確認コードを入力してください。")).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("button", { name: "最初からやり直す" }));
    await expect(await canvas.findByRole("button", { name: "アカウントを作成" })).toBeInTheDocument();
  },
};

export const LoginRouteNavigation: Story = {
  parameters: { chromatic: { disableSnapshot: true } },
  args: {
    mode: "login",
    redirectTo: "/dashboard?tab=staff",
  },
  render: (args) => <RoutedAuthContent {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { name: "シフトリにログイン" })).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("link", { name: "新規登録" }));
    await expect(await canvas.findByRole("heading", { name: "シフトリをはじめる" })).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("link", { name: "ログイン" }));
    await expect(await canvas.findByRole("heading", { name: "シフトリにログイン" })).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("link", { name: "パスワードを忘れた方" }));
    await expect(await canvas.findByRole("heading", { name: "パスワードを再設定" })).toBeInTheDocument();
  },
};

export const ForgotPasswordReset: Story = {
  args: {
    mode: "forgot-password",
    forgotStep: "reset",
    forgotEmail: "manager@example.com",
  },
};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  args: {
    mode: "login",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
