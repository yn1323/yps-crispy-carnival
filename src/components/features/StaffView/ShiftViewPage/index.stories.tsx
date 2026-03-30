import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftViewPage } from "./index";

const mockStaffs = [
  { _id: "staff1" as Id<"staffs">, name: "田中太郎" },
  { _id: "staff2" as Id<"staffs">, name: "鈴木花子" },
  { _id: "staff3" as Id<"staffs">, name: "佐藤一郎" },
];

const mockAssignments = [
  { staffId: "staff1" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "18:00" },
  { staffId: "staff1" as Id<"staffs">, date: "2026-01-22", startTime: "12:00", endTime: "21:00" },
  { staffId: "staff2" as Id<"staffs">, date: "2026-01-20", startTime: "14:00", endTime: "22:00" },
  { staffId: "staff2" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "18:00" },
  { staffId: "staff3" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "18:00" },
];

const meta = {
  title: "features/StaffView/ShiftViewPage",
  component: ShiftViewPage,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShiftViewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    staffs: mockStaffs,
    assignments: mockAssignments,
    timeRange: { start: 9, end: 23, unit: 30 },
  },
};

export const Empty: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    staffs: [],
    assignments: [],
    timeRange: { start: 9, end: 23, unit: 30 },
  },
};
