import type { Meta, StoryObj } from "@storybook/react-vite";
import { ExpiredSubmitView } from "./index";

const meta = {
  title: "features/StaffSubmit/ExpiredSubmitView",
  component: ExpiredSubmitView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ExpiredSubmitView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shopName: "居酒屋さくら",
  },
};
