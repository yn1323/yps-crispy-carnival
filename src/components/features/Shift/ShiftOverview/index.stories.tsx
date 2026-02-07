import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftOverview } from ".";
import type { RequiredStaffingData, ShiftData, StaffType } from "./types";

const meta = {
  title: "Features/Shift/ShiftOverview",
  component: ShiftOverview,
  args: {
    shopId: "shop1",
    onDateClick: (date) => console.log("Date clicked:", date),
  },
} satisfies Meta<typeof ShiftOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

// モックデータ: スタッフ（10名）
const mockStaffs: StaffType[] = [
  { id: "staff1", name: "田中太郎", isSubmitted: true },
  { id: "staff2", name: "山田花子", isSubmitted: true },
  { id: "staff3", name: "鈴木一郎", isSubmitted: true },
  { id: "staff4", name: "佐藤美咲", isSubmitted: true },
  { id: "staff5", name: "高橋健太", isSubmitted: true },
  { id: "staff6", name: "伊藤さくら", isSubmitted: true },
  { id: "staff7", name: "渡辺大輔", isSubmitted: false },
  { id: "staff8", name: "小林真理", isSubmitted: true },
  { id: "staff9", name: "加藤翔", isSubmitted: true },
  { id: "staff10", name: "吉田美優", isSubmitted: true },
];

// シフトデータ生成ヘルパー
const createShift = (
  id: string,
  staffId: string,
  staffName: string,
  date: string,
  startHour: number,
  endHour: number,
): ShiftData => ({
  id,
  staffId,
  staffName,
  date,
  requestedTime: { start: `${startHour}:00`, end: `${endHour}:00` },
  positions: [
    {
      id: `${id}-pos`,
      positionId: "pos1",
      positionName: "ホール",
      color: "#3b82f6",
      start: `${String(startHour).padStart(2, "0")}:00`,
      end: `${String(endHour).padStart(2, "0")}:00`,
    },
  ],
});

// モックデータ: シフト（2週間分）
const mockShifts: ShiftData[] = [
  // 田中太郎: 週4勤務（月火木金）
  createShift("s1", "staff1", "田中太郎", "2026-01-27", 9, 17),
  createShift("s2", "staff1", "田中太郎", "2026-01-28", 9, 17),
  createShift("s3", "staff1", "田中太郎", "2026-01-30", 9, 17),
  createShift("s4", "staff1", "田中太郎", "2026-01-31", 9, 17),
  createShift("s5", "staff1", "田中太郎", "2026-02-03", 9, 17),
  createShift("s6", "staff1", "田中太郎", "2026-02-04", 9, 17),
  createShift("s7", "staff1", "田中太郎", "2026-02-06", 9, 17),

  // 山田花子: 週3勤務（火水木）
  createShift("s8", "staff2", "山田花子", "2026-01-28", 11, 19),
  createShift("s9", "staff2", "山田花子", "2026-01-29", 11, 19),
  createShift("s10", "staff2", "山田花子", "2026-01-30", 11, 19),
  createShift("s11", "staff2", "山田花子", "2026-02-04", 11, 19),
  createShift("s12", "staff2", "山田花子", "2026-02-05", 11, 19),
  createShift("s13", "staff2", "山田花子", "2026-02-06", 11, 19),

  // 鈴木一郎: 週末勤務（土日）
  createShift("s14", "staff3", "鈴木一郎", "2026-02-01", 10, 18),
  createShift("s15", "staff3", "鈴木一郎", "2026-02-07", 10, 18),
  createShift("s16", "staff3", "鈴木一郎", "2026-02-08", 10, 18),

  // 佐藤美咲: 週5勤務
  createShift("s17", "staff4", "佐藤美咲", "2026-01-27", 10, 18),
  createShift("s18", "staff4", "佐藤美咲", "2026-01-28", 10, 18),
  createShift("s19", "staff4", "佐藤美咲", "2026-01-29", 10, 18),
  createShift("s20", "staff4", "佐藤美咲", "2026-01-30", 10, 18),
  createShift("s21", "staff4", "佐藤美咲", "2026-01-31", 10, 18),
  createShift("s22", "staff4", "佐藤美咲", "2026-02-03", 10, 18),
  createShift("s23", "staff4", "佐藤美咲", "2026-02-04", 10, 18),
  createShift("s24", "staff4", "佐藤美咲", "2026-02-05", 10, 18),
  createShift("s25", "staff4", "佐藤美咲", "2026-02-06", 10, 18),

  // 高橋健太: 週2勤務
  createShift("s26", "staff5", "高橋健太", "2026-01-27", 14, 22),
  createShift("s27", "staff5", "高橋健太", "2026-01-29", 14, 22),
  createShift("s28", "staff5", "高橋健太", "2026-02-03", 14, 22),
  createShift("s29", "staff5", "高橋健太", "2026-02-05", 14, 22),

  // 伊藤さくら: 週4勤務
  createShift("s30", "staff6", "伊藤さくら", "2026-01-28", 9, 15),
  createShift("s31", "staff6", "伊藤さくら", "2026-01-30", 9, 15),
  createShift("s32", "staff6", "伊藤さくら", "2026-02-01", 9, 15),
  createShift("s33", "staff6", "伊藤さくら", "2026-02-04", 9, 15),
  createShift("s34", "staff6", "伊藤さくら", "2026-02-06", 9, 15),
  createShift("s35", "staff6", "伊藤さくら", "2026-02-08", 9, 15),

  // 小林真理: 週3勤務
  createShift("s36", "staff8", "小林真理", "2026-01-27", 12, 20),
  createShift("s37", "staff8", "小林真理", "2026-01-29", 12, 20),
  createShift("s38", "staff8", "小林真理", "2026-01-31", 12, 20),
  createShift("s39", "staff8", "小林真理", "2026-02-03", 12, 20),
  createShift("s40", "staff8", "小林真理", "2026-02-05", 12, 20),

  // 加藤翔: 週4勤務
  createShift("s41", "staff9", "加藤翔", "2026-01-28", 8, 16),
  createShift("s42", "staff9", "加藤翔", "2026-01-30", 8, 16),
  createShift("s43", "staff9", "加藤翔", "2026-02-01", 8, 16),
  createShift("s44", "staff9", "加藤翔", "2026-02-04", 8, 16),
  createShift("s45", "staff9", "加藤翔", "2026-02-06", 8, 16),
  createShift("s46", "staff9", "加藤翔", "2026-02-08", 8, 16),

  // 吉田美優: 週2勤務
  createShift("s47", "staff10", "吉田美優", "2026-02-01", 10, 16),
  createShift("s48", "staff10", "吉田美優", "2026-02-07", 10, 16),
];

// 祝日
const mockHolidays = ["2026-02-11"];

// モックデータ: 必要人員設定（曜日ごと）
const mockRequiredStaffing: RequiredStaffingData[] = [
  {
    dayOfWeek: 1, // 月
    slots: [
      { hour: 9, position: "ホール", requiredCount: 2 },
      { hour: 9, position: "キッチン", requiredCount: 1 },
      { hour: 10, position: "ホール", requiredCount: 3 },
      { hour: 10, position: "キッチン", requiredCount: 2 },
      { hour: 11, position: "ホール", requiredCount: 3 },
      { hour: 11, position: "キッチン", requiredCount: 2 },
    ],
  },
  {
    dayOfWeek: 2, // 火
    slots: [
      { hour: 9, position: "ホール", requiredCount: 2 },
      { hour: 9, position: "キッチン", requiredCount: 1 },
      { hour: 11, position: "ホール", requiredCount: 3 },
      { hour: 11, position: "キッチン", requiredCount: 2 },
    ],
  },
  {
    dayOfWeek: 3, // 水
    slots: [
      { hour: 10, position: "ホール", requiredCount: 2 },
      { hour: 10, position: "キッチン", requiredCount: 1 },
    ],
  },
  {
    dayOfWeek: 4, // 木
    slots: [
      { hour: 10, position: "ホール", requiredCount: 3 },
      { hour: 10, position: "キッチン", requiredCount: 2 },
    ],
  },
  {
    dayOfWeek: 5, // 金
    slots: [
      { hour: 9, position: "ホール", requiredCount: 2 },
      { hour: 9, position: "キッチン", requiredCount: 2 },
    ],
  },
  {
    dayOfWeek: 6, // 土
    slots: [
      { hour: 10, position: "ホール", requiredCount: 4 },
      { hour: 10, position: "キッチン", requiredCount: 2 },
    ],
  },
  {
    dayOfWeek: 0, // 日
    slots: [
      { hour: 10, position: "ホール", requiredCount: 3 },
      { hour: 10, position: "キッチン", requiredCount: 2 },
    ],
  },
];

export const Basic: Story = {
  args: {
    startDate: "2026-01-27",
    endDate: "2026-02-09",
    staffs: mockStaffs,
    shifts: mockShifts,
    holidays: mockHolidays,
    requiredStaffing: mockRequiredStaffing,
  },
};

export const WithHoliday: Story = {
  args: {
    startDate: "2026-02-09",
    endDate: "2026-02-15",
    staffs: mockStaffs.slice(0, 5),
    shifts: [
      createShift("h1", "staff1", "田中太郎", "2026-02-09", 9, 17),
      createShift("h2", "staff1", "田中太郎", "2026-02-10", 9, 17),
      createShift("h3", "staff1", "田中太郎", "2026-02-12", 9, 17),
      createShift("h4", "staff2", "山田花子", "2026-02-11", 10, 18), // 祝日
      createShift("h5", "staff2", "山田花子", "2026-02-13", 10, 18),
    ],
    holidays: ["2026-02-11"], // 建国記念の日
  },
};

export const FewStaffs: Story = {
  args: {
    startDate: "2026-01-27",
    endDate: "2026-02-02",
    staffs: mockStaffs.slice(0, 3),
    shifts: mockShifts.filter((s) => ["staff1", "staff2", "staff3"].includes(s.staffId)),
    holidays: [],
  },
};

export const NoShifts: Story = {
  args: {
    startDate: "2026-01-27",
    endDate: "2026-02-02",
    staffs: mockStaffs.slice(0, 3),
    shifts: [],
    holidays: [],
  },
};
