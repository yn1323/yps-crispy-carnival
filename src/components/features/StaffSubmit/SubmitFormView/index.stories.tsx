import type { Meta, StoryObj } from "@storybook/react-vite";
import { previousWeeklyPattern, submitStoryBaseData } from "../storyData";
import { SubmitFormView } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmitFormView",
  component: SubmitFormView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitFormView>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = async () => {};

export const PreviousPatternApplied: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      existingRequests: [
        { date: "2026-04-07", startTime: "09:00", endTime: "17:00" },
        { date: "2026-04-09", startTime: "10:00", endTime: "18:00" },
        { date: "2026-04-11", startTime: "12:00", endTime: "21:00" },
      ],
      previousWeeklyPattern,
    },
    onSubmit: noop,
  },
};

export const LegalConsentRequired: Story = {
  args: {
    data: { ...submitStoryBaseData, legalConsentRequired: true },
    onSubmit: noop,
  },
};
