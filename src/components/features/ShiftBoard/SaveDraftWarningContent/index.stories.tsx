import type { Meta, StoryObj } from "@storybook/react-vite";
import { SaveDraftWarningContent } from "./index";

const meta = {
  title: "Features/ShiftBoard/SaveDraftWarningContent",
  component: SaveDraftWarningContent,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof SaveDraftWarningContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
