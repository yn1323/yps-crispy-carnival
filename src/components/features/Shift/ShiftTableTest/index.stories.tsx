import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShiftTableTest } from ".";

const meta = {
  title: "Features/Shift/ShiftTableTest",
  component: ShiftTableTest,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof ShiftTableTest>;

export default meta;
type Story = StoryObj<typeof meta>;

// モックデータ: スタッフ
const mockStaffs = [
  { id: "staff1", name: "Aさん", isSubmitted: true },
  { id: "staff2", name: "Bさん", isSubmitted: true },
  { id: "staff3", name: "Cさん", isSubmitted: false },
  { id: "staff4", name: "Dさん", isSubmitted: true },
  { id: "staff5", name: "Eさん", isSubmitted: false },
];

// モックデータ: ポジション
const mockPositions = [
  { id: "pos1", name: "ホール", color: "#3b82f6" },
  { id: "pos2", name: "キッチン", color: "#f97316" },
  { id: "pos3", name: "レジ", color: "#10b981" },
  { id: "pos4", name: "休憩", color: "#6b7280" },
];

// モックデータ: シフト
const mockShifts = [
  // Aさん: 1/21 10:00-18:00 (ホール→キッチン)
  {
    id: "shift1",
    staffId: "staff1",
    staffName: "Aさん",
    date: "2026-01-21",
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg1", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "10:00", end: "14:00" },
      { id: "seg2", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "14:00", end: "18:00" },
    ],
  },
  // Bさん: 1/21 12:00-20:00 (キッチン→レジ)
  {
    id: "shift2",
    staffId: "staff2",
    staffName: "Bさん",
    date: "2026-01-21",
    requestedTime: { start: "12:00", end: "20:00" },
    positions: [
      { id: "seg3", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "12:00", end: "16:00" },
      { id: "seg4", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "16:00", end: "20:00" },
    ],
  },
  // Dさん: 1/21 15:00-21:00 (ホールのみ)
  {
    id: "shift3",
    staffId: "staff4",
    staffName: "Dさん",
    date: "2026-01-21",
    requestedTime: { start: "15:00", end: "21:00" },
    positions: [
      { id: "seg5", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "15:00", end: "21:00" },
    ],
  },
  // Aさん: 1/22 09:00-17:00 (ホール→休憩→ホール)
  {
    id: "shift4",
    staffId: "staff1",
    staffName: "Aさん",
    date: "2026-01-22",
    requestedTime: { start: "09:00", end: "17:00" },
    positions: [
      { id: "seg6", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "09:00", end: "12:00" },
      { id: "seg7", positionId: "pos4", positionName: "休憩", color: "#6b7280", start: "12:00", end: "13:00" },
      { id: "seg8", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "13:00", end: "17:00" },
    ],
  },
  // Bさん: 1/22 10:00-18:00 (レジのみ)
  {
    id: "shift5",
    staffId: "staff2",
    staffName: "Bさん",
    date: "2026-01-22",
    requestedTime: { start: "10:00", end: "18:00" },
    positions: [
      { id: "seg9", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "10:00", end: "18:00" },
    ],
  },
  // Dさん: 1/23 希望なし（提出済みだがこの日は休み）→ マネージャーがポジション割当
  {
    id: "shift10",
    staffId: "staff4",
    staffName: "Dさん",
    date: "2026-01-23",
    requestedTime: null,
    positions: [
      { id: "seg15", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "11:00", end: "15:00" },
    ],
  },
  // Cさん: 1/21 未提出 → マネージャーがポジション割当
  {
    id: "shift11",
    staffId: "staff3",
    staffName: "Cさん",
    date: "2026-01-21",
    requestedTime: null,
    positions: [
      { id: "seg16", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "10:00", end: "14:00" },
    ],
  },
];

// モックデータ: 日付（1週間分）
const mockDates = ["2026-01-21", "2026-01-22", "2026-01-23", "2026-01-24", "2026-01-25", "2026-01-26", "2026-01-27"];

// 基本ストーリー
export const Basic: Story = {
  args: {
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// 空の状態
export const Empty: Story = {
  args: {
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: [],
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// 多くのスタッフ
export const ManyStaffs: Story = {
  args: {
    staffs: [
      ...mockStaffs,
      { id: "staff6", name: "Fさん", isSubmitted: true },
      { id: "staff7", name: "Gさん", isSubmitted: true },
      { id: "staff8", name: "Hさん", isSubmitted: true },
      { id: "staff9", name: "Iさん", isSubmitted: false },
      { id: "staff10", name: "Jさん", isSubmitted: true },
    ],
    positions: mockPositions,
    initialShifts: [
      ...mockShifts,
      {
        id: "shift6",
        staffId: "staff6",
        staffName: "Fさん",
        date: "2026-01-21",
        requestedTime: { start: "11:00", end: "19:00" },
        positions: [
          { id: "seg10", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "11:00", end: "19:00" },
        ],
      },
      {
        id: "shift7",
        staffId: "staff7",
        staffName: "Gさん",
        date: "2026-01-21",
        requestedTime: { start: "09:00", end: "15:00" },
        positions: [
          { id: "seg11", positionId: "pos3", positionName: "レジ", color: "#10b981", start: "09:00", end: "15:00" },
        ],
      },
      {
        id: "shift8",
        staffId: "staff8",
        staffName: "Hさん",
        date: "2026-01-21",
        requestedTime: { start: "16:00", end: "22:00" },
        positions: [
          { id: "seg12", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "16:00", end: "22:00" },
        ],
      },
      {
        id: "shift9",
        staffId: "staff10",
        staffName: "Jさん",
        date: "2026-01-21",
        requestedTime: { start: "13:00", end: "21:00" },
        positions: [
          { id: "seg13", positionId: "pos1", positionName: "ホール", color: "#3b82f6", start: "13:00", end: "17:00" },
          { id: "seg14", positionId: "pos2", positionName: "キッチン", color: "#f97316", start: "17:00", end: "21:00" },
        ],
      },
    ],
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// 15分単位
export const Unit15Minutes: Story = {
  args: {
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 15 },
  },
};

// 1日だけ
export const SingleDay: Story = {
  args: {
    staffs: mockStaffs.slice(0, 3),
    positions: mockPositions,
    initialShifts: mockShifts.filter((s) => s.date === "2026-01-21"),
    dates: ["2026-01-21"],
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// ポジション10個（2行折り返しレイアウト確認用）
export const ManyPositions: Story = {
  args: {
    staffs: mockStaffs,
    positions: [
      ...mockPositions,
      { id: "pos5", name: "洗い場", color: "#8b5cf6" },
      { id: "pos6", name: "デリバリー", color: "#ec4899" },
      { id: "pos7", name: "仕込み", color: "#14b8a6" },
      { id: "pos8", name: "接客", color: "#f59e0b" },
      { id: "pos9", name: "清掃", color: "#6366f1" },
      { id: "pos10", name: "事務", color: "#84cc16" },
    ],
    initialShifts: mockShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// 提出状況の3状態を確認するストーリー（初期表示: 1/23 = 希望なしパターン）
// 1/23: Aさん(希望なし), Bさん(希望なし), Cさん(未提出), Dさん(希望なし+割当済), Eさん(未提出)
// 1/21: Aさん(希望あり), Bさん(希望あり), Cさん(未提出+割当済), Dさん(希望あり), Eさん(未提出)
export const SubmissionStatus: Story = {
  args: {
    staffs: mockStaffs,
    positions: mockPositions,
    initialShifts: mockShifts,
    dates: ["2026-01-23", ...mockDates.filter((d) => d !== "2026-01-23")],
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// === 40名スタッフの大規模ストーリー ===

const largeTeamNames = [
  "田中太郎",
  "山田花子",
  "佐藤健太",
  "鈴木美咲",
  "高橋一郎",
  "伊藤裕子",
  "渡辺大輝",
  "中村さくら",
  "小林翔太",
  "加藤莉子",
  "吉田拓海",
  "山口あかり",
  "松本蓮",
  "井上七海",
  "木村陸",
  "林美月",
  "清水悠斗",
  "山崎結衣",
  "森本颯太",
  "池田凛",
  "橋本大和",
  "阿部千尋",
  "石川海斗",
  "前田彩花",
  "藤田樹",
  "小川穂乃香",
  "岡田蒼",
  "後藤琴音",
  "長谷川陽",
  "村上桃花",
  "近藤大翔",
  "坂本優花",
  "遠藤空",
  "青木真央",
  "西村太一",
  "福田ひなた",
  "三浦奏",
  "岩崎心春",
  "原田悠馬",
  "中島紗良",
];

const largeTeamStaffs = largeTeamNames.map((name, i) => ({
  id: `lt-staff${i + 1}`,
  name,
  isSubmitted: i % 5 !== 2, // 約80%が提出済み（3,8,13,18,23,28番目が未提出）
}));

// シフトパターン（時間帯のバリエーション）
const shiftPatterns = [
  { start: "09:00", end: "17:00" }, // 朝シフト
  { start: "10:00", end: "18:00" }, // 日勤
  { start: "11:00", end: "19:00" }, // 遅番
  { start: "12:00", end: "20:00" }, // 午後シフト
  { start: "14:00", end: "22:00" }, // 夕方シフト
  { start: "09:00", end: "14:00" }, // 短時間朝
  { start: "17:00", end: "22:00" }, // 短時間夜
  { start: "10:00", end: "15:00" }, // 短時間昼
];

// ポジション割当パターン
const positionPatterns = [
  // ホールのみ
  (start: string, end: string) => [{ positionId: "pos1", positionName: "ホール", color: "#3b82f6", start, end }],
  // キッチンのみ
  (start: string, end: string) => [{ positionId: "pos2", positionName: "キッチン", color: "#f97316", start, end }],
  // レジのみ
  (start: string, end: string) => [{ positionId: "pos3", positionName: "レジ", color: "#10b981", start, end }],
  // ホール→キッチン（前半/後半）
  (start: string, end: string) => {
    const startH = Number.parseInt(start.split(":")[0], 10);
    const endH = Number.parseInt(end.split(":")[0], 10);
    const mid = Math.floor((startH + endH) / 2);
    const midStr = `${mid}:00`;
    return [
      { positionId: "pos1", positionName: "ホール", color: "#3b82f6", start, end: midStr },
      { positionId: "pos2", positionName: "キッチン", color: "#f97316", start: midStr, end },
    ];
  },
  // キッチン→レジ
  (start: string, end: string) => {
    const startH = Number.parseInt(start.split(":")[0], 10);
    const endH = Number.parseInt(end.split(":")[0], 10);
    const mid = Math.floor((startH + endH) / 2);
    const midStr = `${mid}:00`;
    return [
      { positionId: "pos2", positionName: "キッチン", color: "#f97316", start, end: midStr },
      { positionId: "pos3", positionName: "レジ", color: "#10b981", start: midStr, end },
    ];
  },
];

// 40名分のシフトデータを生成
const generateLargeTeamShifts = () => {
  const shifts: Array<{
    id: string;
    staffId: string;
    staffName: string;
    date: string;
    requestedTime: { start: string; end: string } | null;
    positions: Array<{
      id: string;
      positionId: string;
      positionName: string;
      color: string;
      start: string;
      end: string;
    }>;
  }> = [];
  let shiftIdx = 0;
  let segIdx = 0;

  for (let staffI = 0; staffI < largeTeamStaffs.length; staffI++) {
    const staff = largeTeamStaffs[staffI];
    const isSubmitted = staff.isSubmitted;

    // 各スタッフに2〜4日のシフトを割り当て（staffIndexで決定的に変化）
    const daysCount = 2 + (staffI % 3); // 2, 3, 4, 2, 3, 4...
    for (let d = 0; d < daysCount; d++) {
      const dateIdx = (staffI + d * 3) % mockDates.length;
      const date = mockDates[dateIdx];
      const pattern = shiftPatterns[(staffI + d) % shiftPatterns.length];
      const posPattern = positionPatterns[(staffI + d) % positionPatterns.length];
      const posSegments = posPattern(pattern.start, pattern.end);

      shiftIdx++;
      shifts.push({
        id: `lt-shift${shiftIdx}`,
        staffId: staff.id,
        staffName: staff.name,
        date,
        requestedTime: isSubmitted ? { start: pattern.start, end: pattern.end } : null,
        positions: posSegments.map((seg) => {
          segIdx++;
          return { id: `lt-seg${segIdx}`, ...seg };
        }),
      });
    }
  }
  return shifts;
};

const largeTeamShifts = generateLargeTeamShifts();

// 40名スタッフ（大規模チーム・ソート確認用）
export const LargeTeam: Story = {
  args: {
    staffs: largeTeamStaffs,
    positions: mockPositions,
    initialShifts: largeTeamShifts,
    dates: mockDates,
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};
