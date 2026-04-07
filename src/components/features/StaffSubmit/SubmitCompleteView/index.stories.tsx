import type { Meta, StoryObj } from "@storybook/react-vite";
import type { DayEntry } from "../DayCard";
import { SubmitCompleteView } from "./index";

const mockEntries: DayEntry[] = [
  { date: "2026-04-07", isWorking: true, startTime: "09:00", endTime: "18:00" },
  { date: "2026-04-08", isWorking: true, startTime: "09:00", endTime: "18:00" },
  { date: "2026-04-09", isWorking: true, startTime: "10:00", endTime: "15:00" },
  { date: "2026-04-10", isWorking: false, startTime: "09:00", endTime: "22:00" },
  { date: "2026-04-11", isWorking: true, startTime: "09:00", endTime: "22:00" },
  { date: "2026-04-12", isWorking: false, startTime: "09:00", endTime: "22:00" },
  { date: "2026-04-13", isWorking: false, startTime: "09:00", endTime: "22:00" },
];

const meta = {
  title: "features/StaffSubmit/SubmitCompleteView",
  component: SubmitCompleteView,
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitCompleteView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    shopName: "居酒屋さくら",
    entries: mockEntries,
    onEdit: () => {},
  },
};
