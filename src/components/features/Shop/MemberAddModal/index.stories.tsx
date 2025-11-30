import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { MemberAddModal } from ".";

const meta = {
  title: "Features/Shop/MemberAddModal",
  component: MemberAddModal,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof MemberAddModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shopId: "shop123" as Id<"shops">,
    authId: "auth123",
    isOpen: true,
    onOpenChange: () => {},
    onClose: () => {},
    onSuccess: () => {},
  },
};
