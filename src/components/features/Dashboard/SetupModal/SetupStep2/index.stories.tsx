import type { Meta, StoryObj } from "@storybook/react-vite";
import { SetupStep2 } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/SetupModal/SetupStep2",
  component: SetupStep2,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: () => {},
  },
} satisfies Meta<typeof SetupStep2>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
