import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopsEditPage } from ".";

const meta = {
  title: "Pages/Shops/EditPage",
  component: ShopsEditPage,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShopsEditPage>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shopId: "jd7esxeq46sxn5ya9h7q4naaex7s9bkd",
  },
};
