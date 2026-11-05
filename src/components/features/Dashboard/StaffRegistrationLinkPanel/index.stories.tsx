import { Box } from "@chakra-ui/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { StaffRegistrationLinkPanel } from "./index";

const registrationUrl = "https://shiftori.app/staff/register?token=preview-token";
const rotatedRegistrationUrl = "https://shiftori.app/staff/register?token=rotated-preview-token";
const sharedRegistrationUrl = `${registrationUrl}&openExternalBrowser=1`;
const sharedRotatedRegistrationUrl = `${rotatedRegistrationUrl}&openExternalBrowser=1`;
const noop = () => {};

const meta = {
  title: "Features/Dashboard/StaffRegistrationLinkPanel",
  component: StaffRegistrationLinkPanel,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <Box w="520px" maxW="calc(100vw - 32px)">
        <Story />
      </Box>
    ),
  ],
} satisfies Meta<typeof StaffRegistrationLinkPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    registrationUrl,
    onRequestRegistrationLinkRotation: noop,
  },
};

export const EmailNoticeHelpLinkBehavior: Story = {
  args: {
    registrationUrl,
  },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = await canvas.findByRole("link", { name: "こちら" });

    await expect(link.parentElement).toHaveTextContent("登録時にシフトリから送る案内メールについてはこちら");
    await expect(link).toHaveAttribute("href", "/help/basics/notifications");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  },
};

export const Loading: Story = {
  args: {
    registrationUrl: null,
    isLoading: true,
  },
};

export const ErrorState: Story = {
  args: {
    registrationUrl: null,
    hasError: true,
    onRetry: () => {},
  },
};

export const RetryBehavior: Story = {
  args: {
    registrationUrl: null,
  },
  parameters: { screenshot: { skip: true } },
  render: () => <RetryFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("alert")).toHaveTextContent("招待リンクを読み込めませんでした");
    await userEvent.click(await canvas.findByRole("button", { name: "もう一度読み込む" }));
    await expect(await canvas.findByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
  },
};

export const RotationClearsCopiedStateBehavior: Story = {
  args: {
    registrationUrl,
  },
  parameters: { screenshot: { skip: true } },
  render: () => <RotationFixture />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const copiedTexts: string[] = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copiedTexts.push(text);
        },
      },
    });

    try {
      await expect(await canvas.findByText(sharedRegistrationUrl)).toBeInTheDocument();
      await userEvent.click(await canvas.findByRole("button", { name: "リンクをコピー" }));
      await expect(await canvas.findByRole("button", { name: "コピーしました" })).toBeInTheDocument();
      // LINEで開いた場合も外部ブラウザでセキュリティ確認を行えるよう、共有リンクだけにパラメータを付ける。
      await expect(copiedTexts).toEqual([sharedRegistrationUrl]);

      await userEvent.click(await canvas.findByRole("button", { name: "登録リンクを再発行" }));
      await expect(await canvas.findByText(sharedRotatedRegistrationUrl)).toBeInTheDocument();
      await expect(await canvas.findByRole("button", { name: "リンクをコピー" })).toBeInTheDocument();
    } finally {
      if (clipboardDescriptor) Object.defineProperty(navigator, "clipboard", clipboardDescriptor);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  },
};

function RetryFixture() {
  const [hasError, setHasError] = useState(true);

  return (
    <StaffRegistrationLinkPanel
      registrationUrl={hasError ? null : registrationUrl}
      hasError={hasError}
      onRetry={() => setHasError(false)}
    />
  );
}

function RotationFixture() {
  const [url, setUrl] = useState(registrationUrl);

  return (
    <StaffRegistrationLinkPanel
      registrationUrl={url}
      onRequestRegistrationLinkRotation={() => setUrl(rotatedRegistrationUrl)}
    />
  );
}
