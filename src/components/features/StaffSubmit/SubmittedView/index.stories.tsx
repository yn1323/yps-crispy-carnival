import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubmittedView } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmittedView",
  component: SubmittedView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmittedView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
