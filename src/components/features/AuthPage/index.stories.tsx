import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthContent } from ".";

const noop = () => {};

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
    onRequestReset: noop,
    onResetPassword: noop,
  },
} satisfies Meta<typeof AuthContent>;

export default meta;
type Story = StoryObj<typeof meta>;

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
