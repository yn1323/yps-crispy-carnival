import type { Meta, StoryObj } from "@storybook/react-vite";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
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
      shiftStartTime: "14:00",
      shiftEndTime: "25:00",
    },
    onSubmit: () => {},
  },
} satisfies Meta<typeof EditShopForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 既存値が入力された状態 */
export const PreFilled: Story = {};

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
        defaultValues={{ shopName: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" }}
        onSubmit={() => {}}
      />
    </Dialog>
  ),
};

/** BottomSheet 内にレンダリング（SP） */
export const InBottomSheet: Story = {
  parameters: {
    viewport: { defaultViewport: "mobile1" },
  },
  render: () => (
    <BottomSheet
      title="店舗設定"
      isOpen={true}
      onOpenChange={() => {}}
      formId="edit-shop-form"
      submitLabel="保存する"
      onClose={() => {}}
      overflowY="visible"
    >
      <EditShopForm
        defaultValues={{ shopName: "居酒屋たなか", shiftStartTime: "14:00", shiftEndTime: "25:00" }}
        onSubmit={() => {}}
      />
    </BottomSheet>
  ),
};
