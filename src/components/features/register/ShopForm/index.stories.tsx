import type { Meta, StoryObj } from "@storybook/nextjs";
import { userEvent, within } from "storybook/internal/test";
import { ShopForm } from "./index";

const meta: Meta<typeof ShopForm> = {
  title: "features/register/ShopForm",
  component: ShopForm,
  parameters: {},
};

export default meta;
type Story = StoryObj<typeof ShopForm>;

export const Basic: Story = {
  args: {},
};

export const ErrorMessages: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // フォームの送信ボタンを取得
    const submitButton = canvas.getByRole("button", {
      name: "登録",
    });

    // 何も入力せずに送信
    await userEvent.click(submitButton);
  },
};
