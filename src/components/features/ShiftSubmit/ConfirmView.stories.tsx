import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConfirmView } from "./ConfirmView";

const meta = {
  title: "features/ShiftSubmit/ConfirmView",
  component: ConfirmView,
  parameters: {
    layout: "centered",
  },
  args: {
    onBack: () => {},
  },
} satisfies Meta<typeof ConfirmView>;

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
    onSubmit: () => new Promise((resolve) => setTimeout(resolve, 1000)),
  },
};
