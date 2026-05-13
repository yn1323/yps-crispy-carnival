import type { Meta, StoryObj } from "@storybook/react-vite";
import { previousWeeklyPattern, submitStoryBaseData, submittedRequests } from "../storyData";
import { ShiftSubmitPage } from "./index";

const meta = {
  title: "features/StaffSubmit/ShiftSubmitPage",
  component: ShiftSubmitPage,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ShiftSubmitPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = async () => {};

export const StateA_Unsubmitted: Story = {
  args: {
    data: submitStoryBaseData,
    onSubmit: noop,
  },
};

export const StateB_Submitted: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      hasSubmitted: true,
      existingRequests: submittedRequests,
    },
  },
};

export const StateB_PreviousPatternAvailable: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      previousWeeklyPattern,
    },
  },
};

export const StateC_SubmittedExpired: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      isBeforeDeadline: false,
      hasSubmitted: true,
      existingRequests: [
        { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-08", startTime: "09:00", endTime: "18:00" },
        { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
        { date: "2026-04-11", startTime: "09:00", endTime: "22:00" },
      ],
    },
  },
};

export const StateD_Expired: Story = {
  args: {
    onSubmit: noop,
    data: {
      ...submitStoryBaseData,
      isBeforeDeadline: false,
      hasSubmitted: false,
    },
  },
};
