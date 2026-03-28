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
    onEntriesChange: () => {},
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
