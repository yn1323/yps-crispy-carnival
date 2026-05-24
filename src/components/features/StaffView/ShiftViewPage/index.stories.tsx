import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftViewPage } from "./index";

const mockStaffs = [
  { _id: "staff1" as Id<"staffs">, name: "田中太郎" },
  { _id: "staff2" as Id<"staffs">, name: "鈴木花子" },
  { _id: "staff3" as Id<"staffs">, name: "佐藤一郎" },
];

const defaultPositionId = "position-1" as Id<"positions">;
const mockPositions = [{ _id: defaultPositionId, name: "シフト", color: "#3b82f6", isDefault: true }];
const shiftTypePattern = {
  kind: "shiftType" as const,
  options: [
    { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};

const mockAssignments = [
  {
    staffId: "staff1" as Id<"staffs">,
    date: "2026-01-20",
    startTime: "10:00",
    endTime: "18:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff1" as Id<"staffs">,
    date: "2026-01-22",
    startTime: "12:00",
    endTime: "21:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff2" as Id<"staffs">,
    date: "2026-01-20",
    startTime: "14:00",
    endTime: "22:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff2" as Id<"staffs">,
    date: "2026-01-21",
    startTime: "10:00",
    endTime: "18:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff3" as Id<"staffs">,
    date: "2026-01-23",
    startTime: "10:00",
    endTime: "18:00",
    positionId: defaultPositionId,
  },
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
    positions: mockPositions,
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
    positions: mockPositions,
    assignments: [],
    timeRange: { start: 9, end: 23, unit: 30 },
  },
};

export const DateOnly: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    shopClosedDates: ["2026-01-22"],
    submissionPattern: { kind: "dateOnly" },
    staffs: mockStaffs,
    positions: mockPositions,
    assignments: [
      {
        staffId: "staff1" as Id<"staffs">,
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "22:00",
        positionId: defaultPositionId,
      },
      {
        staffId: "staff2" as Id<"staffs">,
        date: "2026-01-21",
        startTime: "09:00",
        endTime: "22:00",
        positionId: defaultPositionId,
      },
    ],
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

export const ShiftType: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    submissionPattern: shiftTypePattern,
    staffs: mockStaffs,
    positions: mockPositions,
    assignments: [
      {
        staffId: "staff1" as Id<"staffs">,
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "15:00",
        positionId: defaultPositionId,
        optionId: "morning",
      },
      {
        staffId: "staff1" as Id<"staffs">,
        date: "2026-01-21",
        startTime: "15:00",
        endTime: "22:00",
        positionId: defaultPositionId,
        optionId: "late",
      },
      {
        staffId: "staff2" as Id<"staffs">,
        date: "2026-01-20",
        startTime: "15:00",
        endTime: "22:00",
        positionId: defaultPositionId,
        optionId: "late",
      },
    ],
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};
