import type { Meta, StoryObj } from "@storybook/react-vite";
import { MembersDetailPage } from ".";

const meta = {
  title: "pages/Members/DetailPage",
  component: MembersDetailPage,
  args: {
    userId: "jh7bg3b58ebkepen0pada606xx7s9aff",
    shopId: "jd7esxeq46sxn5ya9h7q4naaex7s9bkd",
  },
} satisfies Meta<typeof MembersDetailPage>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};
