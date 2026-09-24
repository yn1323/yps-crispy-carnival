import type { Meta, StoryObj } from "@storybook/react-vite";
import { StaffSubmissionSection } from ".";

const meta = {
  title: "Features/LandingPage/StaffSubmissionSection",
  component: StaffSubmissionSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof StaffSubmissionSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};

export const Mobile: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};
