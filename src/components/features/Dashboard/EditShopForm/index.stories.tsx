import type { Meta, StoryObj } from "@storybook/react-vite";
import { Dialog } from "@/src/components/ui/Dialog";
import { EditShopForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/EditShopForm",
  component: EditShopForm,
  parameters: {
    layout: "padded",
  },
  args: {
    defaultValues: {
      shopName: "居酒屋たなか",
      regularClosedDays: [],
      submissionPattern: { kind: "dateOnly" },
    },
    onSubmit: () => {},
  },
} satisfies Meta<typeof EditShopForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Dialog 内にレンダリング（PC） */
export const InDialog: Story = {
  render: () => (
    <Dialog
      title="店舗設定"
      isOpen={true}
      onOpenChange={() => {}}
      formId="edit-shop-form"
      submitLabel="保存する"
      onClose={() => {}}
    >
      <EditShopForm
        defaultValues={{
          shopName: "居酒屋たなか",
          regularClosedDays: [],
          submissionPattern: { kind: "time", startTime: "14:00", endTime: "25:00" },
        }}
        onSubmit={() => {}}
      />
    </Dialog>
  ),
};

/** 定休日を選択済みの状態 */
export const WithRegularClosedDays: Story = {
  args: {
    defaultValues: {
      shopName: "居酒屋たなか",
      regularClosedDays: ["mon", "tue"],
      submissionPattern: {
        kind: "shiftType",
        options: [
          { id: "morning", name: "早番", startTime: "14:00", endTime: "18:00", sortOrder: 0 },
          { id: "late", name: "遅番", startTime: "18:00", endTime: "25:00", sortOrder: 1 },
        ],
      },
    },
  },
};
