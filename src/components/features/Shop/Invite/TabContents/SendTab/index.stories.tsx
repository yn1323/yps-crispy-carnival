import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/internal/test";
import { InviteComplete, InviteForm, SendTab } from "./index";

const meta = {
  title: "Features/Shop/Invite/SendTab",
  component: SendTab,
  parameters: {
    layout: "padded",
  },
  args: {
    shopId: "mock-shop-id",
  },
} satisfies Meta<typeof SendTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

// バリデーションエラー表示（空で送信）
export const ValidationError: StoryObj<typeof InviteForm> = {
  render: () => <InviteForm shopId="mock-shop-id" onSuccess={() => {}} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    const submitButton = canvas.getByRole("button", { name: /招待メールを送る/i });
    await userEvent.click(submitButton);
  },
};

// InviteCompleteコンポーネント
export const Complete: StoryObj<typeof InviteComplete> = {
  render: () => (
    <InviteComplete generatedUrl="https://example.com/invite?token=abc123def456" onCreateAnother={() => {}} />
  ),
};
