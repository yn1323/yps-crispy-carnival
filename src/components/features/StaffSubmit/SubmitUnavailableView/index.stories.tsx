import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubmitUnavailableView } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmitUnavailableView",
  component: SubmitUnavailableView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitUnavailableView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InvalidLink: Story = {
  args: {
    reason: "invalid_link",
  },
};

export const RecruitmentDeleted: Story = {
  args: {
    reason: "recruitment_deleted",
  },
};

export const SubmissionClosed: Story = {
  args: {
    reason: "submission_closed",
  },
};
