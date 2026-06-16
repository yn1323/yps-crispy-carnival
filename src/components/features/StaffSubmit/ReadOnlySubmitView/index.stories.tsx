import type { Meta, StoryObj } from "@storybook/react-vite";
import { submitStoryBaseData, submittedRequests } from "../storyData";
import { ReadOnlySubmitView } from "./index";

const meta = {
  title: "features/StaffSubmit/ReadOnlySubmitView",
  component: ReadOnlySubmitView,
  tags: ["vrt-mobile2"],
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ReadOnlySubmitView>;

export default meta;
type Story = StoryObj<typeof meta>;

const shiftTypePattern = {
  kind: "shiftType" as const,
  options: [
    { id: "morning", name: "早番", startTime: "09:00", endTime: "14:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "14:00", endTime: "22:00", sortOrder: 1 },
  ],
};

export const Time: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      isBeforeDeadline: false,
      hasSubmitted: true,
      existingRequests: submittedRequests,
    },
  },
};

export const DateOnly: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      submissionPattern: { kind: "dateOnly" },
      existingSelection: { kind: "dateOnly", workingDates: ["2026-04-07", "2026-04-09"] },
      isBeforeDeadline: false,
      hasSubmitted: true,
    },
  },
};

export const ShiftType: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      submissionPattern: shiftTypePattern,
      existingSelection: {
        kind: "shiftType",
        selections: [
          { date: "2026-04-07", optionId: "morning" },
          { date: "2026-04-09", optionId: "late" },
        ],
      },
      isBeforeDeadline: false,
      hasSubmitted: true,
    },
  },
};
