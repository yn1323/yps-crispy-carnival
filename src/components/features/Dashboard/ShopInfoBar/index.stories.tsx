import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShopInfoBar } from "./index";

const meta = {
  title: "Features/Dashboard/ShopInfoBar",
  component: ShopInfoBar,
  parameters: {
    layout: "padded",
  },
  args: {
    name: "居酒屋たなか",
    shiftStartTime: "14:00",
    shiftEndTime: "25:00",
    onEditClick: () => {},
  },
} satisfies Meta<typeof ShopInfoBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SameDay: Story = {
  args: {
    name: "カフェ・ソレイユ",
    shiftStartTime: "09:00",
    shiftEndTime: "18:00",
  },
};
