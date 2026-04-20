import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "@/src/components/ui/Dialog";
import { mockStaffs } from "../storyMocks";
import { EditStaffForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/EditStaffForm",
  component: EditStaffForm,
  parameters: {
    layout: "padded",
  },
  args: {
    staff: mockStaffs[0],
    onSubmit: () => {},
  },
} satisfies Meta<typeof EditStaffForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 既存値が入力された状態 */
export const PreFilled: Story = {};

/** Dialog内にレンダリング */
export const InDialog: Story = {
  render: () => (
    <Dialog
      title="スタッフを編集"
      isOpen={true}
      onOpenChange={() => {}}
      formId="edit-staff-form"
      submitLabel="保存する"
      onClose={() => {}}
    >
      <EditStaffForm staff={mockStaffs[0]} onSubmit={() => {}} />
    </Dialog>
  ),
};
