import type { Meta, StoryObj } from "@storybook/nextjs";
import { userEvent, within } from "storybook/internal/test";
import { UserForm } from ".";

const meta = {
  title: "features/register/UserForm",
  component: UserForm,
  args: {
    userId: "fa96ae18-86da-4e34-95c3-a63ad6879068",
  },
} satisfies Meta<typeof UserForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};

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
