import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftBoardData } from "../types";
import { ShiftBoardPage } from "./index";

const mockData: ShiftBoardData = {
  recruitment: {
    _id: "recruitment-1" as Id<"recruitments">,
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    status: "open",
    confirmedAt: null,
  },
  staffs: [
    { _id: "s1" as Id<"staffs">, name: "鈴木太郎", isSubmitted: true },
    { _id: "s2" as Id<"staffs">, name: "佐藤花子", isSubmitted: true },
    { _id: "s3" as Id<"staffs">, name: "田中次郎", isSubmitted: false },
    { _id: "s4" as Id<"staffs">, name: "山田美咲", isSubmitted: true },
    { _id: "s5" as Id<"staffs">, name: "高橋翔太", isSubmitted: true },
    { _id: "s6" as Id<"staffs">, name: "渡辺優子", isSubmitted: true },
    { _id: "s7" as Id<"staffs">, name: "伊藤健一", isSubmitted: true },
    { _id: "s8" as Id<"staffs">, name: "中村真理", isSubmitted: true },
    { _id: "s9" as Id<"staffs">, name: "小林大輔", isSubmitted: false },
    { _id: "s10" as Id<"staffs">, name: "加藤美穂", isSubmitted: true },
  ],
  shiftRequests: [
    { staffId: "s1" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "18:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "18:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-22", startTime: "10:00", endTime: "18:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "14:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "18:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-21", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-22", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-24", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-26", startTime: "11:00", endTime: "19:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-20", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-22", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-23", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-24", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-26", startTime: "14:00", endTime: "21:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "15:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-20", startTime: "09:00", endTime: "17:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-22", startTime: "09:00", endTime: "17:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-24", startTime: "09:00", endTime: "17:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-21", startTime: "12:00", endTime: "20:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-23", startTime: "12:00", endTime: "20:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-25", startTime: "12:00", endTime: "20:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-22", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "16:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-20", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-22", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-24", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-26", startTime: "11:00", endTime: "18:00" },
  ],
  shiftAssignments: [],
  timeRange: { start: 9, end: 22, unit: 30 },
};

const meta = {
  title: "Features/ShiftBoard/ShiftBoardPage",
  component: ShiftBoardPage,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    data: mockData,
    recruitmentId: "recruitment-1" as Id<"recruitments">,
  },
} satisfies Meta<typeof ShiftBoardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PC: Story = {};

export const SP: Story = {
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
};

export const Confirmed: Story = {
  args: {
    data: {
      ...mockData,
      recruitment: {
        ...mockData.recruitment,
        status: "confirmed",
        confirmedAt: new Date("2026-03-28T23:15:00").getTime(),
      },
    },
  },
};
