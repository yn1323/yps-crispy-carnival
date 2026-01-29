import type { Meta, StoryObj } from "@storybook/react-vite";
import { CopyModal } from "./index";

const meta = {
  title: "features/Shift/StaffingMatrix/CopyModal",
  component: CopyModal,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof CopyModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    isOpen: true,
    onOpenChange: () => {},
    onClose: () => console.log("Closed"),
    sourceDayOfWeek: 1, // 月曜日
    onCopy: (targetDays) => console.log("Copy to:", targetDays),
  },
};

export const FromSaturday: Story = {
  args: {
    isOpen: true,
    onOpenChange: () => {},
    onClose: () => console.log("Closed"),
    sourceDayOfWeek: 6, // 土曜日
    onCopy: (targetDays) => console.log("Copy to:", targetDays),
  },
};

export const Loading: Story = {
  args: {
    isOpen: true,
    onOpenChange: () => {},
    onClose: () => console.log("Closed"),
    sourceDayOfWeek: 1,
    onCopy: () => {},
    isLoading: true,
  },
};
