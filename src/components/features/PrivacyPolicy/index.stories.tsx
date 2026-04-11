import type { Meta, StoryObj } from "@storybook/react-vite";
import { PrivacyPolicy } from ".";

const meta = {
  title: "Features/PrivacyPolicy",
  component: PrivacyPolicy,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof PrivacyPolicy>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {};

export const SP: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
