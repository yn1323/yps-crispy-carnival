import type { Meta, StoryObj } from "@storybook/react-vite";
import { OrganizationManagementSection } from ".";

const meta = {
  title: "Features/OrganizationManagementSection",
  component: OrganizationManagementSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof OrganizationManagementSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
