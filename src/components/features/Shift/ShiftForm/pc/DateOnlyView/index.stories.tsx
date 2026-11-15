import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useMemo, useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm, type ShiftFormDetailActions, type ShiftFormStaffing } from "../..";
import { mockDateOnlyStaffs } from "../../stories/fixtures";
import {
  dateOnlyArgs,
  dateOnlyDateNotesArgs,
  desktopGlobals,
  fullscreenParameters,
  shiftFormDecorators,
} from "../../stories/shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション3つ、日の型あり、休憩あり、熟練度あり）
// 期間は 2026-06-02(火)〜06-08(月)、06-07(日)は定休日。
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#3b82f6", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#c2410c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#7c3aed", isDefault: false };
const detailPositions = [hall, kitchen, register];

const detailStaffs: StaffType[] = mockDateOnlyStaffs.map((staff) =>
  staff.id === "staff1"
    ? { ...staff, skillLevel: "lead" }
    : staff.id === "staff4"
      ? { ...staff, skillLevel: "newcomer" }
      : staff,
);

const request = { start: "09:00", end: "22:00" };

const shift = (
  staffId: string,
  date: string,
  position: PositionType | null,
  extra: Partial<ShiftData> = {},
): ShiftData => ({
  id: `shift-${staffId}-${date}`,
  staffId,
  staffName: detailStaffs.find((staff) => staff.id === staffId)?.name ?? staffId,
  date,
  requestedTime: request,
  requestedTimes: [request],
  positions: position
    ? [
        {
          id: `seg-${staffId}-${date}`,
          positionId: position.id,
          positionName: position.name,
          color: position.color,
          start: "09:00",
          end: "22:00",
        },
      ]
    : [],
  ...extra,
});

const detailShifts: ShiftData[] = [
  shift("staff1", "2026-06-02", hall, { breaks: [{ start: "13:00", end: "14:00" }] }),
  shift("staff1", "2026-06-04", hall),
  shift("staff1", "2026-06-05", null),
  shift("staff2", "2026-06-02", kitchen),
  shift("staff2", "2026-06-03", kitchen, { breaks: [{ start: "12:00", end: "12:45" }] }),
  shift("staff2", "2026-06-06", kitchen),
  shift("staff3", "2026-06-03", hall),
  shift("staff3", "2026-06-04", register),
  shift("staff4", "2026-06-02", hall),
  shift("staff4", "2026-06-06", hall),
  shift("staff5", "2026-06-03", null),
  shift("staff5", "2026-06-06", register),
  // 未提出者へ入れた仮の勤務。
  shift("staff6", "2026-06-04", kitchen, { requestedTime: null, requestedTimes: [], isProvisional: true }),
];

const allDay = (counts: Array<[position: PositionType, count: number]>) => [
  {
    key: { kind: "allDay" as const },
    requirements: counts.map(([position, count]) => ({ positionId: position.id, count })),
  },
];

const detailStaffing: ShiftFormStaffing = {
  dayTemplates: [
    {
      id: "weekday",
      name: "平日",
      weekdays: ["mon", "tue", "wed", "thu", "fri"],
      slots: allDay([
        [hall, 2],
        [kitchen, 1],
      ]),
    },
    {
      id: "weekend",
      name: "土日",
      weekdays: ["sat", "sun"],
      slots: allDay([
        [hall, 2],
        [kitchen, 2],
        [register, 1],
      ]),
    },
    {
      id: "event",
      name: "イベント日",
      weekdays: [],
      slots: allDay([
        [hall, 3],
        [kitchen, 2],
        [register, 1],
      ]),
    },
  ],
  // 6/4(木)だけ、曜日の型ではなくイベント日の型を当てる。
  dayTemplateOverrides: [{ date: "2026-06-04", templateId: "event" }],
  breakRule: null,
};

const detailArgs = {
  ...dateOnlyArgs,
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
  title: "Features/Shift/ShiftForm/Date Only/PC Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
  render: (args) => <ShiftFormWithDayTemplateState {...args} />,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、日の型あり（不足あり、その日だけの型あり）、休憩、熟練度を1画面で確かめる。 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** 連絡事項の列がある募集では日付の列が狭くなる。狭い列でも人数とポジションが読めることを確かめる。 */
export const DetailWithDateNotes: Story = {
  name: "Detail With Date Notes",
  args: { ...detailArgs, dateNotes: dateOnlyDateNotesArgs.dateNotes },
  globals: desktopGlobals,
};

const toHall = (item: ShiftData): ShiftData => ({
  ...item,
  positions: item.positions.map((position) => ({
    ...position,
    positionId: hall.id,
    positionName: hall.name,
    color: hall.color,
  })),
});

/** ポジションが1つの店舗では、勤務のある日は今までの色と「○」のまま、人数と休憩だけを足す。 */
export const DetailSinglePosition: Story = {
  name: "Detail Single Position",
  args: {
    ...detailArgs,
    positions: [hall],
    initialShifts: detailShifts.map(toHall),
    staffing: {
      ...detailStaffing,
      dayTemplates: detailStaffing.dayTemplates.map((template) => ({ ...template, slots: allDay([[hall, 3]]) })),
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

/** 管理者の閲覧専用でも、ポジションと休憩と人数は出す。日の型は名前だけを出す。 */
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
    staffs: mockDateOnlyStaffs,
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

/** 選んだポジションで勤務が入り、別のポジションを選んで押すと入れ替わり、その日の人数も変わる。 */
export const DetailAssignInteractive: Story = {
  name: "Detail Assign Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 6/3(水)の列の人数。ほかの日と内訳が同じになっても取り違えないよう、その日の列の中で探す。
    const findWednesdayCount = async (title: string) =>
      within(await canvas.findByRole("button", { name: /^6\/3\(水\)の人数 / })).findByTitle(title);
    await expect(await findWednesdayCount("1日 ホール 1/2、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("radio", { name: "レジ" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務なし"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、レジ")).toHaveTextContent("レジ");
    await expect(await findWednesdayCount("1日 ホール 1/2、キッチン 1/1、レジ 1")).toBeInTheDocument();

    // 別のポジションを選んで勤務のあるセルを押すと、外れずに入れ替わる。
    await userEvent.click(await canvas.findByRole("radio", { name: "ホール" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、レジ"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、ホール")).toHaveTextContent(
      "ホール",
    );
    await expect(await findWednesdayCount("1日 ホール 2/2、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 同じポジションでもう一度押すと外れる。
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、ホール"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務なし")).toBeInTheDocument();
    await expect(await findWednesdayCount("1日 ホール 1/2、キッチン 1/1、レジ 0")).toBeInTheDocument();
  },
};

/** 日付の列の人数を押すと、その日に当てる日の型を変えられる。その日だけの型は、曜日の設定へ戻せる。 */
export const DetailDayTemplateInteractive: Story = {
  name: "Detail Day Template Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "6/3(水)の人数 2/3、この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));
    const overridden = await canvas.findByRole("button", {
      name: "6/3(水)の人数 2/6、この日の型: イベント日（この日だけ）",
    });
    await expect(within(overridden).getByTitle("1日 ホール 1/3、キッチン 1/2、レジ 0/1")).toBeInTheDocument();

    await userEvent.click(overridden);
    await userEvent.click(await body.findByRole("menuitem", { name: "曜日の設定に戻す" }));
    const restored = await canvas.findByRole("button", { name: "6/3(水)の人数 2/3、この日の型: 平日" });
    await expect(within(restored).getByTitle("1日 ホール 1/2、キッチン 1/1、レジ 0")).toBeInTheDocument();
  },
};

/** 休憩を選んでいる間は、勤務のある日を押すと、勤務を外さずに休憩の編集を開く。 */
export const DetailBreakToolInteractive: Story = {
  name: "Detail Break Tool Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 6/2(火) 勤務あり、ホール"));

    await expect(await within(document.body).findByRole("dialog")).toBeInTheDocument();
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 6/2(火) 勤務あり、ホール")).toBeInTheDocument();
  },
};
