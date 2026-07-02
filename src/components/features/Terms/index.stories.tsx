import type { Meta, StoryObj } from "@storybook/react-vite";
import { Terms } from ".";

const meta = {
  title: "Features/Terms",
  component: Terms,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Terms>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

export const SP: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

export const StaffPC: Story = {
  args: {
    audience: "staff",
  },
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};

export const StaffSP: Story = {
  args: {
    audience: "staff",
  },
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  parameters: {
    vrt: { releaseFixedHeader: true },
  },
};
