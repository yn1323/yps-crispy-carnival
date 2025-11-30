import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { ManagerInviteModal } from "./index";

const meta = {
  title: "features/Shop/ManagerInviteModal",
  component: ManagerInviteModal,
  parameters: {
    layout: "centered",
  },
  args: {
    shopId: "test-shop-id" as Id<"shops">,
    authId: "test-auth-id",
    isOpen: true,
    onOpenChange: () => {},
    onClose: () => {},
    onSuccess: () => {},
  },
} satisfies Meta<typeof ManagerInviteModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
