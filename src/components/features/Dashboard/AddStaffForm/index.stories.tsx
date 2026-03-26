import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddStaffForm } from "./index";

const meta = {
  title: "Features/Dashboard/AddStaffForm",
  component: AddStaffForm,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof AddStaffForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
