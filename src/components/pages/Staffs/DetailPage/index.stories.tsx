import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffDetailPage } from ".";

const meta = {
  title: "Pages/Staffs/DetailPage",
  component: StaffDetailPage,
  args: {
    userId: "jh7bg3b58ebkepen0pada606xx7s9aff",
    shopId: "jd7esxeq46sxn5ya9h7q4naaex7s9bkd",
  },
} satisfies Meta<typeof StaffDetailPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
