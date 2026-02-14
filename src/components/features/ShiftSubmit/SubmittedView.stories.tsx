import type { Meta, StoryObj } from "@storybook/react-vite";
import { SubmittedView } from "./SubmittedView";

const meta = {
  title: "features/ShiftSubmit/SubmittedView",
  component: SubmittedView,
  parameters: {
    layout: "centered",
  },
  args: {
    onEdit: () => {},
  },
} satisfies Meta<typeof SubmittedView>;

export default meta;
type Story = StoryObj<typeof meta>;

const mockEntries = [
  { date: "2026-03-02", isAvailable: true, startTime: "09:00", endTime: "17:00" },
  { date: "2026-03-03", isAvailable: false },
  { date: "2026-03-04", isAvailable: true, startTime: "10:00", endTime: "18:00" },
  { date: "2026-03-05", isAvailable: false },
  { date: "2026-03-06", isAvailable: true, startTime: "09:00", endTime: "17:00" },
  { date: "2026-03-07", isAvailable: true, startTime: "13:00", endTime: "22:00" },
  { date: "2026-03-08", isAvailable: false },
];

export const Basic: Story = {
  args: {
    entries: mockEntries,
    submittedAt: Date.now(),
    deadline: "2026-12-31",
  },
};

export const AfterDeadline: Story = {
  args: {
    entries: mockEntries,
    submittedAt: Date.now() - 7 * 24 * 60 * 60 * 1000,
    deadline: "2026-01-01",
  },
};
