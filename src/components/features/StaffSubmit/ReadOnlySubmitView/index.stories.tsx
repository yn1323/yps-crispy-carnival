import type { Meta, StoryObj } from "@storybook/react-vite";
import type { SubmissionData } from "../SubmitFormView";
import { ReadOnlySubmitView } from "./index";

const mockData: SubmissionData = {
  shopName: "居酒屋さくら",
  staffName: "田中太郎",
  periodStart: "2026-04-07",
  periodEnd: "2026-04-13",
  deadline: "2026-04-04",
  isBeforeDeadline: false,
  hasSubmitted: true,
  existingRequests: [
    { date: "2026-04-07", startTime: "09:00", endTime: "18:00" },
    { date: "2026-04-08", startTime: "09:00", endTime: "18:00" },
    { date: "2026-04-09", startTime: "10:00", endTime: "15:00" },
    { date: "2026-04-11", startTime: "09:00", endTime: "22:00" },
  ],
  timeRange: { startTime: "09:00", endTime: "22:00" },
};

const meta = {
  title: "features/StaffSubmit/ReadOnlySubmitView",
  component: ReadOnlySubmitView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ReadOnlySubmitView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    data: mockData,
  },
};
