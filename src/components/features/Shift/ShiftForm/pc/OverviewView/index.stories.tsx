import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "../..";
import { mockStaffs, withPositionSkills } from "../../stories/fixtures";
import {
  desktopGlobals,
  fullscreenParameters,
  overviewCalendarRangeArgs,
  shiftFormDecorators,
} from "../../stories/shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション2つ、1日に2つのポジション、休憩あり、熟練度あり）
// 期間は 2026-01-21(水)〜02-03(火)。
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };

// Aさんは、ホールではリーダー、キッチンでは見習い。Cさんは、ホールで見習い。Bさんは、ホールが担当外。
const detailStaffs: StaffType[] = withPositionSkills(mockStaffs, {
  staff1: { [hall.id]: "lead", [kitchen.id]: "newcomer" },
  staff2: { [hall.id]: "unavailable" },
  staff3: { [hall.id]: "newcomer" },
});

const shift = (
  staffId: string,
  date: string,
  segments: Array<[position: PositionType, start: string, end: string]>,
  extra: Partial<ShiftData> = {},
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: detailStaffs.find((staff) => staff.id === staffId)?.name ?? staffId,
  date,
  requestedTime: null,
  positions: segments.map(([position, start, end]) => ({
    id: `seg-${staffId}-${date}-${start}`,
    positionId: position.id,
    positionName: position.name,
    color: position.color,
    start,
    end,
  })),
  ...extra,
});

const detailShifts: ShiftData[] = [
  shift("staff1", "2026-01-21", [[hall, "10:00", "18:00"]], { breaks: [{ start: "13:00", end: "14:00" }] }),
  // 1日の中でポジションを変える。
  shift("staff1", "2026-01-22", [
    [hall, "10:00", "14:00"],
    [kitchen, "14:00", "18:00"],
  ]),
  shift("staff1", "2026-01-28", [[hall, "09:00", "15:30"]]),
  shift("staff2", "2026-01-21", [[kitchen, "13:00", "18:00"]]),
  shift("staff2", "2026-01-23", [[kitchen, "11:00", "20:00"]], { breaks: [{ start: "15:00", end: "15:45" }] }),
  // 中抜け。勤務と勤務の隙間は、週の計に数えない。
  shift("staff4", "2026-01-21", [
    [hall, "09:00", "12:00"],
    [hall, "16:00", "20:00"],
  ]),
  shift("staff3", "2026-01-24", [[hall, "10:00", "14:00"]], { isProvisional: true }),
];

const detailArgs = {
  ...overviewCalendarRangeArgs,
  staffs: detailStaffs,
  positions: [hall, kitchen],
  initialShifts: detailShifts,
  initialDetailMode: true,
  onDetailModeChange: () => {},
} satisfies ShiftFormArgs;

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Overview Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 勤務時間の下にポジションとそのポジションでの熟練度の印、横に休憩の印、名前に「入れるもの」での熟練度の印を出す。週の計は休憩と隙間を引く。 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** ポジションが1つの店舗では、休憩の印と熟練度の印だけを足す。 */
export const DetailSinglePosition: Story = {
  name: "Detail Single Position",
  args: {
    ...detailArgs,
    positions: [hall],
    initialShifts: detailShifts.map((item) => ({
      ...item,
      positions: item.positions.map((position) => ({
        ...position,
        positionId: hall.id,
        positionName: hall.name,
        color: hall.color,
      })),
    })),
  },
  globals: desktopGlobals,
};

/** スタッフ向けの確定シフト表示でも、ポジションと休憩は出す。熟練度は渡らない。 */
export const DetailConfirmedForStaff: Story = {
  name: "Detail Confirmed For Staff",
  args: {
    ...detailArgs,
    staffs: mockStaffs,
    isReadOnly: true,
    displayMode: "confirmed",
    currentStaffId: "staff1",
    onDetailModeChange: undefined,
  },
  globals: desktopGlobals,
};

/** シンプル表示でも、週の計は休憩と勤務の隙間を引いた時間にする。 */
export const SimpleTotalsExcludeBreaks: Story = {
  name: "Simple Totals Exclude Breaks",
  args: { ...detailArgs, initialDetailMode: false },
  globals: desktopGlobals,
};
