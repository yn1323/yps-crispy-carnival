import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddStaffForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/AddStaffForm",
  component: AddStaffForm,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: () => {},
  },
} satisfies Meta<typeof AddStaffForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 初期状態: 3行の空入力欄 */
export const Empty: Story = {};

/** PC幅: 横並びレイアウト確認用 */
export const PCWidth: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "580px" }}>
        <Story />
      </div>
    ),
  ],
};

/** メールバリデーションエラー確認用 */
export const WithInvalidEmail: Story = {
  decorators: [
    (Story) => (
      <div style={{ maxWidth: "580px" }}>
        <Story />
        <button type="submit" form="add-staff-form">
          送信テスト
        </button>
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const { findByPlaceholderText, findByText } = await import("@testing-library/react");
    const nameInputs = canvasElement.querySelectorAll<HTMLInputElement>('input[placeholder="例: 田中 花子"]');
    const emailInputs = canvasElement.querySelectorAll<HTMLInputElement>('input[placeholder="例: hanako@example.com"]');

    // 1行目: 名前入力 + 無効メール
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.change(nameInputs[0], { target: { value: "田中 花子" } });
    fireEvent.change(emailInputs[0], { target: { value: "invalid-email" } });

    // フォーム送信
    const submitBtn = canvasElement.parentElement?.querySelector<HTMLButtonElement>(
      'button[type="submit"][form="add-staff-form"]',
    );
    if (submitBtn) fireEvent.click(submitBtn);
  },
};
