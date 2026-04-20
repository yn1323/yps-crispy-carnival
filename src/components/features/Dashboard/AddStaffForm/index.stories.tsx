import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "@/src/components/ui/Dialog";
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

export const InDialog: Story = {
  render: () => (
    <Dialog
      title="スタッフを追加"
      isOpen={true}
      onOpenChange={() => {}}
      formId="add-staff-form"
      submitLabel="スタッフを追加する"
      onClose={() => {}}
      maxW="640px"
      maxH="85dvh"
    >
      <AddStaffForm onSubmit={() => {}} />
    </Dialog>
  ),
};
