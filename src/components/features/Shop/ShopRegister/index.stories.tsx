import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/internal/test";
import { ShopRegister } from "./index";

const meta: Meta<typeof ShopRegister> = {
  title: "features/register/ShopRegister",
  component: ShopRegister,
  parameters: {},
};

export default meta;
type Story = StoryObj<typeof ShopRegister>;

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
