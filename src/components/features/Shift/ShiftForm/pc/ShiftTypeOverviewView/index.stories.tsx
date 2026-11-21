import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "../..";
import { mockShiftTypePattern, mockShiftTypeStaffs, withPositionSkills } from "../../stories/fixtures";
import { desktopGlobals, fullscreenParameters, shiftFormDecorators, shiftTypeArgs } from "../../stories/shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション3つ、1日に2つの勤務パターン、休憩あり、熟練度あり）
// 期間は 2026-05-21(木)〜05-28(木)。
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#a78bfa", isDefault: false };

const shiftTypeOptions = mockShiftTypePattern.kind === "shiftType" ? mockShiftTypePattern.options : [];

// 田中さんは、ホールではリーダー、キッチンでは見習い。山田さんは、レジで見習い。鈴木さんは、ホールが担当外。
const detailStaffs: StaffType[] = withPositionSkills(mockShiftTypeStaffs, {
  staff1: { [hall.id]: "lead", [kitchen.id]: "newcomer" },
  staff4: { [register.id]: "newcomer" },
  staff5: { [hall.id]: "unavailable" },
});

const shift = (
  staffId: string,
  date: string,
  assignments: Array<[optionId: string, position: PositionType]>,
  extra: Partial<ShiftData> = {},
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: detailStaffs.find((staff) => staff.id === staffId)?.name ?? staffId,
  date,
  requestedTime: null,
  requestedShiftTypeOptionIds: assignments.map(([optionId]) => optionId),
  positions: assignments.map(([optionId, position]) => {
    const option = shiftTypeOptions.find((item) => item.id === optionId) ?? shiftTypeOptions[0];
    return {
      id: `seg-${staffId}-${date}-${option.id}`,
      positionId: position.id,
      positionName: position.name,
      color: position.color,
      start: option.startTime,
      end: option.endTime,
      shiftTypeOptionId: option.id,
    };
  }),
  ...extra,
});

const detailShifts: ShiftData[] = [
  // 早番と中番で別のポジションに入り、早番の中で休憩する。
  shift(
    "staff1",
    "2026-05-21",
    [
      ["morning", hall],
      ["middle", kitchen],
    ],
    { breaks: [{ start: "11:00", end: "11:30" }] },
  ),
  shift("staff1", "2026-05-22", [["morning", hall]]),
  shift("staff1", "2026-05-25", [["late", hall]]),
  shift("staff2", "2026-05-21", [["middle", kitchen]]),
  shift("staff2", "2026-05-23", [["late", kitchen]], { breaks: [{ start: "19:00", end: "19:30" }] }),
  shift("staff3", "2026-05-21", [["late", hall]]),
  shift("staff4", "2026-05-21", [["night", register]]),
  shift("staff4", "2026-05-26", [["morning", register]]),
  shift("staff6", "2026-05-22", [["morning", kitchen]], { isProvisional: true }),
];

const detailArgs = {
  ...shiftTypeArgs,
  staffs: detailStaffs,
  positions: [hall, kitchen, register],
  initialShifts: detailShifts,
  initialViewMode: "overview",
  initialDetailMode: true,
  onDetailModeChange: () => {},
} satisfies ShiftFormArgs;

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/PC/Overview Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 勤務パターンの下にポジション、横に休憩の印、名前に熟練度の印、右端に週の計を出す。 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** ポジションが1つの店舗では、休憩の印、熟練度の印、週の計だけを足す。 */
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
    staffs: mockShiftTypeStaffs,
    isReadOnly: true,
    displayMode: "confirmed",
    currentStaffId: "staff1",
    onDetailModeChange: undefined,
  },
  globals: desktopGlobals,
};
