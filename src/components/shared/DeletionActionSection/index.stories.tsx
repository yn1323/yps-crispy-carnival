import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeletionActionSection } from ".";

const meta = {
  title: "Shared/DeletionActionSection",
  component: DeletionActionSection,
  parameters: { layout: "padded" },
  args: {
    title: "店舗を削除する",
    description: "この店舗を利用できない状態にします。この操作は元に戻せません。",
    actionLabel: "削除",
    canDelete: true,
    onDelete: () => {},
  },
} satisfies Meta<typeof DeletionActionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    canDelete: false,
    disabledReason: "最後の店舗は削除できません。",
  },
};
