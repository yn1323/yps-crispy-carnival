import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReissueDone } from "./index";

const meta = {
  title: "features/StaffView/ReissueDone",
  component: ReissueDone,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ReissueDone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {};
