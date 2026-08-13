import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRouterState } from "@tanstack/react-router";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { AuthLoadingView } from "./AuthLoadingView";
import type { EmailVerificationValues } from "./EmailCodeVerificationForm";
import { ForgotPasswordFlowView } from "./ForgotPasswordFlow/ForgotPasswordFlowView";
import type { ForgotRequestValues, ForgotResetValues } from "./ForgotPasswordForm";
import { LoginFlowView } from "./LoginFlow/LoginFlowView";
import type { LoginValues } from "./LoginForm";
import { SignupFlowView } from "./SignupFlow/SignupFlowView";
import type { SignupValues } from "./SignupForm";
import type { AuthMode, ForgotStep, LoginStep } from "./types";

const noop = () => {};

type AuthStoryContentProps = {
  mode: AuthMode;
  errorMessage?: string;
  isInitialLoading?: boolean;
  isSubmitting?: boolean;
  loginStep?: LoginStep;
  loginSafeIdentifier?: string;
  verificationInfoMessage?: string;
  resendCooldownSeconds?: number;
  isVerificationStep?: boolean;
  forgotStep?: ForgotStep;
  forgotEmail?: string;
  redirectTo?: string;
  isLineBrowser?: boolean;
  onGoogle: () => void | Promise<void>;
  onLogin: (values: LoginValues) => void | Promise<void>;
  onVerifyLogin: (values: EmailVerificationValues) => void | Promise<void>;
  onResendLoginCode: () => void | Promise<void>;
  onRestartLogin: () => void | Promise<void>;
  onSignup: (values: SignupValues) => void | Promise<void>;
  onVerifyEmail: (values: EmailVerificationValues) => void | Promise<void>;
  onRestartSignup: () => void | Promise<void>;
  onRequestReset: (values: ForgotRequestValues) => void | Promise<void>;
  onResetPassword: (values: ForgotResetValues) => void | Promise<void>;
};

const AuthStoryContent = ({
  mode,
  errorMessage,
  isInitialLoading,
  isSubmitting,
  loginStep,
  loginSafeIdentifier,
  verificationInfoMessage,
  resendCooldownSeconds,
  isVerificationStep,
  forgotStep,
  forgotEmail,
  redirectTo = "/dashboard",
  isLineBrowser,
  onGoogle,
  onLogin,
  onVerifyLogin,
  onResendLoginCode,
  onRestartLogin,
  onSignup,
  onVerifyEmail,
  onRestartSignup,
  onRequestReset,
  onResetPassword,
}: AuthStoryContentProps) => {
  if (isInitialLoading) {
    return <AuthLoadingView mode={mode} />;
  }

  if (mode === "login") {
    return (
      <LoginFlowView
        errorMessage={errorMessage}
        isLineBrowser={isLineBrowser}
        isSubmitting={isSubmitting}
        loginSafeIdentifier={loginSafeIdentifier}
        loginStep={loginStep}
        redirectTo={redirectTo}
        resendCooldownSeconds={resendCooldownSeconds}
        verificationInfoMessage={verificationInfoMessage}
        onGoogle={onGoogle}
        onLogin={onLogin}
        onResendLoginCode={onResendLoginCode}
        onRestartLogin={onRestartLogin}
        onVerifyLogin={onVerifyLogin}
      />
    );
  }

  if (mode === "signup") {
    return (
      <SignupFlowView
        errorMessage={errorMessage}
        isLineBrowser={isLineBrowser}
        isSubmitting={isSubmitting}
        isVerificationStep={isVerificationStep}
        redirectTo={redirectTo}
        onGoogle={onGoogle}
        onRestartSignup={onRestartSignup}
        onSignup={onSignup}
        onVerifyEmail={onVerifyEmail}
      />
    );
  }

  return (
    <ForgotPasswordFlowView
      email={forgotEmail}
      errorMessage={errorMessage}
      isSubmitting={isSubmitting}
      redirectTo={redirectTo}
      step={forgotStep}
      onRequestReset={onRequestReset}
      onResetPassword={onResetPassword}
    />
  );
};

type AuthStoryContentArgs = ComponentProps<typeof AuthStoryContent>;

const meta = {
  title: "Features/AuthPage",
  component: AuthStoryContent,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    mode: "login",
    onGoogle: noop,
    onLogin: noop,
    onVerifyLogin: noop,
    onResendLoginCode: noop,
    onRestartLogin: noop,
    onSignup: noop,
    onVerifyEmail: noop,
    onRestartSignup: noop,
    onRequestReset: noop,
    onResetPassword: noop,
  },
} satisfies Meta<typeof AuthStoryContent>;

export default meta;
type Story = StoryObj<typeof meta>;

const modeFromPathname = (pathname: string): AuthStoryContentArgs["mode"] => {
  if (pathname === "/signup") return "signup";
  if (pathname === "/forgot-password") return "forgot-password";
  return "login";
};

const RoutedAuthStory = (args: AuthStoryContentArgs) => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return <AuthStoryContent {...args} mode={modeFromPathname(pathname)} />;
};

const SignupVerificationRestartContent = (args: AuthStoryContentArgs) => {
  const [isVerificationStep, setIsVerificationStep] = useState(true);

  return (
    <AuthStoryContent
      {...args}
      mode="signup"
      isVerificationStep={isVerificationStep}
      onRestartSignup={() => setIsVerificationStep(false)}
    />
  );
};

const LoginVerificationBackContent = (args: AuthStoryContentArgs) => {
  const [loginStep, setLoginStep] = useState<AuthStoryContentArgs["loginStep"]>("verify-email-code");

  return (
    <AuthStoryContent {...args} mode="login" loginStep={loginStep} onRestartLogin={() => setLoginStep("credentials")} />
  );
};

const LoginVerificationResendContent = (args: AuthStoryContentArgs) => {
  const [infoMessage, setInfoMessage] = useState<string>();

  return (
    <AuthStoryContent
      {...args}
      mode="login"
      loginStep="verify-email-code"
      verificationInfoMessage={infoMessage}
      onResendLoginCode={() => setInfoMessage("新しい確認コードを送りました。")}
    />
  );
};

const LoginVerificationSubmitContent = (args: AuthStoryContentArgs) => {
  const [submittedCode, setSubmittedCode] = useState<string>();

  return (
    <>
      <AuthStoryContent
        {...args}
        mode="login"
        loginStep="verify-email-code"
        onVerifyLogin={({ code }) => setSubmittedCode(code)}
      />
      {submittedCode && <output>確認コードを送信しました: {submittedCode}</output>}
    </>
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

export const LoginVerification: Story = {
  args: {
    mode: "login",
    loginStep: "verify-email-code",
    loginSafeIdentifier: "yn1323+07112@gmail.com",
    resendCooldownSeconds: 30,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("yn***@gmail.com", { exact: false })).toBeInTheDocument();
    await expect(canvas.queryByText("yn1323+07112@gmail.com", { exact: false })).not.toBeInTheDocument();
  },
};

export const LoginVerificationMobile: Story = {
  tags: ["vrt-mobile2"],
  args: {
    mode: "login",
    loginStep: "verify-email-code",
    loginSafeIdentifier: "ma***@example.com",
    resendCooldownSeconds: 30,
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const LoginVerificationError: Story = {
  args: {
    mode: "login",
    loginStep: "verify-email-code",
    loginSafeIdentifier: "ma***@example.com",
    errorMessage: "確認コードが正しくありません。",
  },
};

export const LoginVerificationResend: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    mode: "login",
    loginSafeIdentifier: "ma***@example.com",
  },
  render: (args) => <LoginVerificationResendContent {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button", { name: "確認コードを再送" }));
    await expect(await canvas.findByText("新しい確認コードを送りました。")).toBeInTheDocument();
  },
};

export const LoginVerificationBack: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    mode: "login",
    loginSafeIdentifier: "ma***@example.com",
  },
  render: (args) => <LoginVerificationBackContent {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { name: "本人確認" })).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("button", { name: "ログイン画面に戻る" }));
    await expect(await canvas.findByRole("heading", { name: "シフトリにログイン" })).toBeInTheDocument();
  },
};

export const LoginVerificationSubmit: Story = {
  parameters: { screenshot: { skip: true } },
  args: {
    mode: "login",
    loginSafeIdentifier: "ma***@example.com",
  },
  render: (args) => <LoginVerificationSubmitContent {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(await canvas.findByLabelText("確認コード"), "123456");
    await userEvent.click(await canvas.findByRole("button", { name: "確認してログイン" }));
    await expect(await canvas.findByText("確認コードを送信しました: 123456")).toBeInTheDocument();
  },
};

export const SignupVerificationRestart: Story = {
  parameters: { screenshot: { skip: true } },
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
  parameters: { screenshot: { skip: true } },
  args: {
    mode: "login",
    redirectTo: "/dashboard?tab=staff",
  },
  render: (args) => <RoutedAuthStory {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { name: "シフトリにログイン" })).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("link", { name: "新規登録" }));
    await expect(await canvas.findByRole("heading", { name: "シフトリをはじめる" })).toBeInTheDocument();
    const pricingLink = await canvas.findByRole("link", { name: "料金・プランを見る（新しいタブ）" });
    await expect(pricingLink).toHaveAttribute("href", "/pricing");
    await expect(pricingLink).toHaveAttribute("target", "_blank");
    await expect(pricingLink).toHaveAttribute("rel", "noreferrer");

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
