import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { SsoClientTrustView, SsoRecoveryView } from "./SsoCallbackView";

const noop = () => {};

type SsoCallbackStoryProps = {
  mode: "client-trust" | "recovery";
  isSubmitting?: boolean;
};

function SsoCallbackStory({ isSubmitting, mode }: SsoCallbackStoryProps) {
  if (mode === "client-trust") {
    return (
      <SsoClientTrustView
        isSubmitting={isSubmitting}
        resendCooldownSeconds={30}
        safeIdentifier="ma***@example.com"
        onBack={noop}
        onResend={noop}
        onSubmit={noop}
      />
    );
  }

  return (
    <SsoRecoveryView
      errorMessage="Google認証を完了できませんでした。\n最初からやり直してください。"
      isSubmitting={isSubmitting}
      target="login"
      onRestart={noop}
    />
  );
}

const meta = {
  title: "Features/AuthPage/SsoCallback",
  component: SsoCallbackStory,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    mode: "recovery",
  },
} satisfies Meta<typeof SsoCallbackStory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ClientTrust: Story = {
  args: {
    mode: "client-trust",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { name: "本人確認" })).toBeInTheDocument();
    await expect(await canvas.findByText("ma***@example.com", { exact: false })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "30秒後に再送できます" })).toBeDisabled();
  },
};

export const Recovery: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("heading", { name: "認証を続けられませんでした" })).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "ログインをやり直す" })).toBeEnabled();
  },
};

export const RecoveryMobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
