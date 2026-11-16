import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "../..";
import { mockDateOnlyDates, mockDateOnlyStaffs, withPositionSkills } from "../../stories/fixtures";
import {
  dateOnlyArgs,
  dateOnlyDateNotesArgs,
  desktopGlobals,
  fullscreenParameters,
  shiftFormDecorators,
} from "../../stories/shared";

import {
  buildStaffing,
  readStaffingCalls,
  StaffingHarness,
  type StoryTemplate,
  staffingCounts,
  templateDay,
  unsetDay,
} from "../../stories/staffingHarness";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション3つ、必要人数あり、休憩あり、熟練度あり）
// 期間は 2026-06-02(火)〜06-08(月)、06-07(日)は定休日。
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#3b82f6", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#c2410c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#7c3aed", isDefault: false };
const detailPositions = [hall, kitchen, register];

// 田中さんは、ホールでは責任者、キッチンでは新人。山田さんは、レジで新人。吉田さんは、キッチンに入れない。
const detailStaffs: StaffType[] = withPositionSkills(mockDateOnlyStaffs, {
  staff1: { [hall.id]: "lead", [kitchen.id]: "newcomer" },
  staff3: { [kitchen.id]: "unavailable" },
  staff4: { [register.id]: "newcomer" },
});

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
  // 6/2(火)のホールは、必要人数より1人多い。
  shift("staff5", "2026-06-02", hall),
  shift("staff5", "2026-06-03", null),
  shift("staff5", "2026-06-06", register),
  // 未提出者へ入れた仮の勤務。
  shift("staff6", "2026-06-04", kitchen, { requestedTime: null, requestedTimes: [], isProvisional: true }),
];

const dateOnlyTemplate = (id: string, name: string, counts: Array<[PositionType, number]>): StoryTemplate => ({
  id,
  name,
  requirements: { kind: "dateOnly", counts: staffingCounts(counts) },
});
const weekdayTemplate = dateOnlyTemplate("weekday", "平日", [
  [hall, 2],
  [kitchen, 1],
]);
const weekendTemplate = dateOnlyTemplate("weekend", "土日", [
  [hall, 2],
  [kitchen, 2],
  [register, 1],
]);
const eventTemplate = dateOnlyTemplate("event", "イベント日", [
  [hall, 3],
  [kitchen, 2],
  [register, 1],
]);
const templates = [weekdayTemplate, weekendTemplate, eventTemplate];

// 曜日の設定で当たる型。土日（6/6、6/7）は土日の型、ほかは平日の型。
const weekdayDays = mockDateOnlyDates.map((date) =>
  templateDay(date, date === "2026-06-06" || date === "2026-06-07" ? weekendTemplate : weekdayTemplate),
);
// 6/4(木)だけ、曜日の型ではなくイベント日の型を当てる。
const detailDays = weekdayDays.map((day) =>
  day.date === "2026-06-04" ? templateDay(day.date, eventTemplate, "dateTemplate") : day,
);
const detailStaffing = buildStaffing({ templates, days: detailDays });

const noopStaffingActions = {
  onApplyTemplate: async () => true,
  onSaveCustom: async () => true,
  isPending: false,
};

const detailArgs = {
  ...dateOnlyArgs,
  staffs: detailStaffs,
  positions: detailPositions,
  initialShifts: detailShifts,
  staffing: detailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions: { onOpenSetup: () => {}, dayStaffingActions: noopStaffingActions },
} satisfies ShiftFormArgs;

/** 必要人数の操作を受け取り、Storyの中の状態でサーバーの代わりをする。 */
const harnessRender = (args: ShiftFormArgs) => (
  <StaffingHarness {...args} templates={templates} weekdayDays={weekdayDays} />
);

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/PC Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、必要人数（足りない人数、多い人数、新人だけの印、その日だけの型）、休憩、熟練度を1画面で確かめる。 */
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
    staffing: buildStaffing({
      templates,
      days: detailDays.map((day) => ({
        ...day,
        requirements: { kind: "dateOnly" as const, counts: staffingCounts([[hall, 3]]) },
      })),
    }),
  },
  globals: desktopGlobals,
};

/** 型を設定していない店舗では、人数だけを出し、必要人数が未設定であることを伝える。 */
export const DetailWithoutDayTemplates: Story = {
  name: "Detail Without Day Templates",
  args: { ...detailArgs, staffing: buildStaffing({ days: mockDateOnlyDates.map(unsetDay) }) },
  globals: desktopGlobals,
};

/** 管理者の閲覧専用でも、ポジションと休憩と人数は出す。型は名前だけを出す。 */
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
    await expect(await findWednesdayCount("1日 ホール 1/2 ▲1、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("radio", { name: "レジ" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務なし"));
    const registerCell = await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、レジ");
    await expect(registerCell).toHaveTextContent("レジ");
    // 山田さんはレジで新人なので、入れた勤務に「新」の印が付く。
    await expect(within(registerCell).getByText("新")).toHaveAttribute("title", "レジでは新人です");
    // 新人の山田さんだけが入ったレジには、新人だけの印が付く。
    await expect(await findWednesdayCount("1日 ホール 1/2 ▲1、キッチン 1/1、レジ 1（新人だけ）")).toBeInTheDocument();

    // 別のポジションを選んで勤務のあるセルを押すと、外れずに入れ替わる。
    await userEvent.click(await canvas.findByRole("radio", { name: "ホール" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、レジ"));
    const hallCell = await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、ホール");
    await expect(hallCell).toHaveTextContent("ホール");
    // ホールでは標準なので、同じ人の勤務でも印は付かない。
    await expect(within(hallCell).queryByText("新")).not.toBeInTheDocument();
    await expect(await findWednesdayCount("1日 ホール 2/2、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 同じポジションでもう一度押すと外れる。
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務あり、ホール"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 6/3(水) 勤務なし")).toBeInTheDocument();
    await expect(await findWednesdayCount("1日 ホール 1/2 ▲1、キッチン 1/1、レジ 0")).toBeInTheDocument();
  },
};

/** 日付の列の人数を押すと、その日の型のメニューが開き、型を当てられる。その日だけの型は、曜日の設定へ戻せる。 */
export const DetailDayTemplateInteractive: Story = {
  name: "Detail Day Template Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "6/3(水)の人数 2/3、この日の型: 平日" }));
    // その日だけの指定がない日には「曜日の設定に戻す」を出さない。
    await expect(await body.findByRole("menuitem", { name: "イベント日" })).toBeInTheDocument();
    await expect(body.queryByRole("menuitem", { name: "曜日の設定に戻す" })).not.toBeInTheDocument();
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));
    const overridden = await canvas.findByRole("button", {
      name: "6/3(水)の人数 2/6、この日の型: イベント日（この日だけ）",
    });
    await expect(within(overridden).getByTitle("1日 ホール 1/3 ▲2、キッチン 1/2 ▲1、レジ 0/1 ▲1")).toBeInTheDocument();

    await userEvent.click(overridden);
    await userEvent.click(await body.findByRole("menuitem", { name: "曜日の設定に戻す" }));
    const restored = await canvas.findByRole("button", { name: "6/3(水)の人数 2/3、この日の型: 平日" });
    await expect(within(restored).getByTitle("1日 ホール 1/2 ▲1、キッチン 1/1、レジ 0")).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: ["2026-06-03"], templateId: "event" },
      { mutation: "applyDayTemplateToDates", dates: ["2026-06-03"], templateId: null },
    ]);
  },
};

/** 「この日だけ人数を変える」で、1日の人数を数字で直し、その日だけの必要人数として保存する。 */
export const DetailCustomRequirementsInteractive: Story = {
  name: "Detail Custom Requirements Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "6/3(水)の人数 2/3、この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "この日だけ人数を変える" }));
    const dialog = within(await body.findByRole("dialog", { name: "6月3日（水）の必要人数" }));
    const registerInput = dialog.getByRole("spinbutton", { name: "1日のレジの必要人数" });
    await expect(dialog.getByRole("spinbutton", { name: "1日のホールの必要人数" })).toHaveValue(2);
    await expect(registerInput).toHaveValue(null);

    await userEvent.type(registerInput, "2");
    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));

    await waitFor(() => expect(body.queryByRole("dialog", { name: "6月3日（水）の必要人数" })).not.toBeInTheDocument());
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      {
        mutation: "saveDayCustomRequirements",
        date: "2026-06-03",
        requirements: {
          kind: "dateOnly",
          counts: [
            { positionId: "hall", count: 2 },
            { positionId: "kitchen", count: 1 },
            { positionId: "register", count: 2 },
          ],
        },
      },
    ]);
    const custom = await canvas.findByRole("button", { name: "6/3(水)の人数 2/5、この日の型: この日だけ変更" });
    await expect(within(custom).getByTitle("1日 ホール 1/2 ▲1、キッチン 1/1、レジ 0/2 ▲2")).toBeInTheDocument();
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
