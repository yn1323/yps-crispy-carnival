import type { Meta, StoryObj } from "@storybook/react-vite";
import { Timecard } from "@/src/components/features/Timecard";

const mockAttendanceRecords = [
  {
    id: "1",
    date: "11/27",
    dayOfWeek: "水",
    clockIn: "09:02",
    clockOut: null,
    breakTime: "0:00",
    workTime: "勤務中",
    status: "in_progress" as const,
  },
  {
    id: "2",
    date: "11/26",
    dayOfWeek: "火",
    clockIn: "08:58",
    clockOut: "18:05",
    breakTime: "1:00",
    workTime: "8:07",
    status: "completed" as const,
  },
  {
    id: "3",
    date: "11/25",
    dayOfWeek: "月",
    clockIn: "09:15",
    clockOut: "17:30",
    breakTime: "1:00",
    workTime: "7:15",
    status: "completed" as const,
  },
  {
    id: "4",
    date: "11/24",
    dayOfWeek: "日",
    clockIn: null,
    clockOut: null,
    breakTime: "-",
    workTime: "-",
    status: "holiday" as const,
  },
  {
    id: "5",
    date: "11/23",
    dayOfWeek: "土",
    clockIn: null,
    clockOut: null,
    breakTime: "-",
    workTime: "-",
    status: "holiday" as const,
  },
  {
    id: "6",
    date: "11/22",
    dayOfWeek: "金",
    clockIn: "09:00",
    clockOut: "19:30",
    breakTime: "1:00",
    workTime: "9:30",
    status: "completed" as const,
  },
  {
    id: "7",
    date: "11/21",
    dayOfWeek: "木",
    clockIn: null,
    clockOut: null,
    breakTime: "-",
    workTime: "-",
    status: "absent" as const,
  },
];

const mockMonthlySummary = {
  totalWorkDays: 18,
  totalWorkHours: "142:30",
  averageWorkHours: "7:55",
  overtimeHours: "12:30",
  lateCount: 2,
  earlyLeaveCount: 1,
};

const meta = {
  title: "features/Timecard",
  component: Timecard,
  args: {
    currentTime: "14:32:45",
    currentDate: "2024年11月27日（水）",
    isClockedIn: true,
    todayRecord: {
      clockIn: "09:02",
      clockOut: null,
    },
    attendanceRecords: mockAttendanceRecords,
    monthlySummary: mockMonthlySummary,
    onClockIn: () => console.log("Clock in"),
    onClockOut: () => console.log("Clock out"),
    onEditRequest: (id: string) => console.log("Edit request for:", id),
  },
} satisfies Meta<typeof Timecard>;
export default meta;

export const Basic: StoryObj<typeof meta> = {};

export const NotClockedIn: StoryObj<typeof meta> = {
  args: {
    isClockedIn: false,
    todayRecord: {
      clockIn: null,
      clockOut: null,
    },
  },
};

export const ClockedOut: StoryObj<typeof meta> = {
  args: {
    isClockedIn: false,
    todayRecord: {
      clockIn: "09:00",
      clockOut: "18:00",
    },
  },
};
