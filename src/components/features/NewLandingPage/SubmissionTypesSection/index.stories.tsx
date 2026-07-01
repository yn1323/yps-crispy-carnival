import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubmissionTypesSection } from ".";

const meta = {
  title: "Features/NewLandingPage/SubmissionTypesSection",
  component: SubmissionTypesSection,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof SubmissionTypesSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Desktop: Story = {};
