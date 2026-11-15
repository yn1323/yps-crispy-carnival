import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useMemo, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm, type ShiftFormDetailActions, type ShiftFormStaffing } from "../..";
import { mockShiftTypeDates, mockShiftTypePattern, mockShiftTypeStaffs } from "../../stories/fixtures";
import { desktopGlobals, fullscreenParameters, shiftFormDecorators, shiftTypeArgs } from "../../stories/shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション3つ、日の型あり、休憩あり、熟練度あり、仮の勤務あり）
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#3b82f6", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#c2410c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#7c3aed", isDefault: false };
const detailPositions = [hall, kitchen, register];

const shiftTypeOptions = mockShiftTypePattern.kind === "shiftType" ? mockShiftTypePattern.options : [];

const detailStaffs: StaffType[] = mockShiftTypeStaffs.map((staff) =>
  staff.id === "staff1"
    ? { ...staff, skillLevel: "lead" }
    : staff.id === "staff4"
      ? { ...staff, skillLevel: "newcomer" }
      : staff,
);

const segment = (staffId: string, date: string, optionId: string, position: PositionType) => {
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
};

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
  positions: assignments.map(([optionId, position]) => segment(staffId, date, optionId, position)),
  ...extra,
});

const [firstDate, secondDate] = mockShiftTypeDates;

const detailShifts: ShiftData[] = [
  // 責任者。早番と中番を続けて入り、早番の中で休憩する。
  shift(
    "staff1",
    firstDate,
    [
      ["morning", hall],
      ["middle", hall],
    ],
    { breaks: [{ start: "11:00", end: "11:30" }] },
  ),
  shift("staff2", firstDate, [["middle", kitchen]]),
  shift("staff3", firstDate, [["late", hall]], { breaks: [{ start: "19:00", end: "19:30" }] }),
  // 新人。
  shift("staff4", firstDate, [["night", register]]),
  shift("staff5", firstDate, [], { requestedShiftTypeOptionIds: [] }),
  // 未提出者へ入れた仮の勤務。
  shift("staff6", firstDate, [["morning", kitchen]], { requestedShiftTypeOptionIds: [], isProvisional: true }),
  // 2日目。人ごとの合計に効く。
  shift("staff1", secondDate, [["morning", hall]]),
  shift("staff2", secondDate, [["late", kitchen]]),
];

const requirements = (counts: Array<[position: PositionType, count: number]>) =>
  counts.map(([position, count]) => ({ positionId: position.id, count }));

const detailStaffing: ShiftFormStaffing = {
  dayTemplates: [
    {
      id: "weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      slots: [
        {
          key: { kind: "shiftType", optionId: "morning" },
          requirements: requirements([
            [hall, 2],
            [kitchen, 1],
          ]),
        },
        {
          key: { kind: "shiftType", optionId: "middle" },
          requirements: requirements([
            [hall, 1],
            [kitchen, 1],
          ]),
        },
        {
          key: { kind: "shiftType", optionId: "late" },
          requirements: requirements([
            [hall, 2],
            [kitchen, 1],
          ]),
        },
        { key: { kind: "shiftType", optionId: "night" }, requirements: requirements([[register, 1]]) },
      ],
    },
    {
      id: "event",
      name: "イベント日",
      weekdays: [],
      slots: [
        {
          key: { kind: "shiftType", optionId: "morning" },
          requirements: requirements([
            [hall, 3],
            [kitchen, 2],
          ]),
        },
        {
          key: { kind: "shiftType", optionId: "middle" },
          requirements: requirements([
            [hall, 3],
            [kitchen, 2],
          ]),
        },
      ],
    },
  ],
  dayTemplateOverrides: [],
  breakRule: null,
};

const detailArgs = {
  ...shiftTypeArgs,
  staffs: detailStaffs,
  positions: detailPositions,
  initialShifts: detailShifts,
  staffing: detailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
} satisfies ShiftFormArgs;

/** シフト表の外にある「特別な日」の保存を、Storyの中の状態で代わりに持つ。 */
const ShiftFormWithDayTemplateState = (args: ShiftFormArgs) => {
  const [overrides, setOverrides] = useState(args.staffing?.dayTemplateOverrides ?? []);
  const staffing = useMemo(
    () => (args.staffing ? { ...args.staffing, dayTemplateOverrides: overrides } : undefined),
    [args.staffing, overrides],
  );
  const detailActions = useMemo<ShiftFormDetailActions>(
    () => ({
      onOpenSetup: () => {},
      onChangeDayTemplate: (date, templateId) =>
        setOverrides((current) => [
          ...current.filter((entry) => entry.date !== date),
          ...(templateId ? [{ date, templateId }] : []),
        ]),
    }),
    [],
  );
  return <ShiftForm {...args} staffing={staffing} detailActions={detailActions} />;
};

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/PC/Daily Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
  render: (args) => <ShiftFormWithDayTemplateState {...args} />,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、日の型あり（不足あり）、休憩、熟練度、仮の勤務を1画面で確かめる。 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** ポジションが1つの店舗では「○」のまま、人数と休憩だけを足す。 */
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
    staffing: {
      ...detailStaffing,
      dayTemplates: detailStaffing.dayTemplates.map((template) => ({
        ...template,
        slots: template.slots.map((slot) => ({ ...slot, requirements: requirements([[hall, 2]]) })),
      })),
    },
  },
  globals: desktopGlobals,
};

/** 日の型を設定していない店舗では、人数だけを出し、設定への導線を置く。 */
export const DetailWithoutDayTemplates: Story = {
  name: "Detail Without Day Templates",
  args: { ...detailArgs, staffing: { dayTemplates: [], dayTemplateOverrides: [], breakRule: null } },
  globals: desktopGlobals,
};

/** 管理者の閲覧専用でも、ポジションと休憩と人数は出す。入れるものの選択は出さず、日の型は名前だけを出す。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...detailArgs, isReadOnly: true },
  globals: desktopGlobals,
};

/** スタッフ向けの確定シフト表示では、ポジションと休憩だけを足す。熟練度と人数は出さない。 */
export const DetailConfirmedForStaff: Story = {
  name: "Detail Confirmed For Staff",
  args: {
    ...detailArgs,
    staffs: mockShiftTypeStaffs,
    staffing: undefined,
    isReadOnly: true,
    displayMode: "confirmed",
    currentStaffId: "staff1",
    onDetailModeChange: undefined,
  },
  globals: desktopGlobals,
};

const findVisibleByLabelText = async (canvas: ReturnType<typeof within>, label: string) => {
  const elements: HTMLElement[] = await canvas.findAllByLabelText(label);
  const visibleElement = elements.find((element) => element.getClientRects().length > 0);
  await expect(visibleElement).toBeDefined();
  return visibleElement as HTMLElement;
};

/** 選んだポジションで勤務が入り、別のポジションを選んで押すと入れ替わり、人数も変わる。 */
export const DetailAssignInteractive: Story = {
  name: "Detail Assign Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTitle("早番 ホール 1/2、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務なし"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、キッチン")).toHaveTextContent(
      "キッチン",
    );
    await expect(await canvas.findByTitle("早番 ホール 1/2、キッチン 2/1、レジ 0")).toBeInTheDocument();

    // 別のポジションを選んで勤務のあるセルを押すと、外れずに入れ替わる。
    await userEvent.click(await canvas.findByRole("radio", { name: "ホール" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、キッチン"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、ホール")).toHaveTextContent("ホール");
    await expect(await canvas.findByTitle("早番 ホール 2/2、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 同じポジションでもう一度押すと外れる。
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、ホール"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務なし")).toBeInTheDocument();
    await expect(await canvas.findByTitle("早番 ホール 1/2、キッチン 1/1、レジ 0")).toBeInTheDocument();
  },
};

/** 人数の行の左から、その日に当てる日の型を変えると、必要人数が変わる。 */
export const DetailDayTemplateInteractive: Story = {
  name: "Detail Day Template Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));
    await expect(await canvas.findByRole("button", { name: "この日の型: イベント日" })).toBeInTheDocument();
    await expect(await canvas.findByTitle("早番 ホール 1/3、キッチン 1/2、レジ 0")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "この日の型: イベント日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "曜日の設定に戻す" }));
    await expect(await canvas.findByRole("button", { name: "この日の型: 平日" })).toBeInTheDocument();
    await expect(await canvas.findByTitle("早番 ホール 1/2、キッチン 1/1、レジ 0")).toBeInTheDocument();
  },
};

/** 休憩を選んでいる間は、勤務のあるセルを押すと、勤務を外さずに休憩の編集を開く。 */
export const DetailBreakToolInteractive: Story = {
  name: "Detail Break Tool Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "佐藤 花子 中番 勤務あり、キッチン"));

    await expect(await within(document.body).findByRole("dialog")).toBeInTheDocument();
    await expect(await findVisibleByLabelText(canvas, "佐藤 花子 中番 勤務あり、キッチン")).toBeInTheDocument();
  },
};
