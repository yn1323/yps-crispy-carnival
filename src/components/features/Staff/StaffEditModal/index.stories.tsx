import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffEditModal } from "./index";

const meta = {
  title: "features/Staff/StaffEditModal",
  component: StaffEditModal,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof StaffEditModal>;

export default meta;

type Story = StoryObj<typeof meta>;

// Note: This component requires Convex connection to fetch data
// In Storybook, it will show loading state or error without backend
export const Basic: Story = {
  args: {
    staffId: "staff1",
    shopId: "shop1",
    isOpen: true,
    onOpenChange: (details) => {
      console.log("onOpenChange:", details);
    },
    onClose: () => {
      console.log("onClose");
    },
    onSave: () => {
      console.log("onSave");
    },
  },
};

export const Closed: Story = {
  args: {
    ...Basic.args,
    isOpen: false,
  },
};
