import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "../..";
import { shiftTypeDetailDays, shiftTypeDetailTemplates, shiftTypeWeekdayTemplate } from "../../sp/detailStoryFixtures";
import {
  mockShiftTypeDates,
  mockShiftTypePattern,
  mockShiftTypeStaffs,
  withPositionSkills,
} from "../../stories/fixtures";
import { desktopGlobals, fullscreenParameters, shiftFormDecorators, shiftTypeArgs } from "../../stories/shared";
import {
  buildStaffing,
  readStaffingCalls,
  StaffingHarness,
  staffingCounts,
  templateDay,
  unsetDay,
} from "../../stories/staffingHarness";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション3つ、必要人数あり、休憩あり、熟練度あり、仮の勤務あり）
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#3b82f6", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#c2410c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#7c3aed", isDefault: false };
const detailPositions = [hall, kitchen, register];

const shiftTypeOptions = mockShiftTypePattern.kind === "shiftType" ? mockShiftTypePattern.options : [];

// 田中さんは、ホールでは責任者、キッチンでは新人。山田さんは、キッチンとレジで新人。鈴木さんは、ホールに入れない。
const detailStaffs: StaffType[] = withPositionSkills(mockShiftTypeStaffs, {
  staff1: { [hall.id]: "lead", [kitchen.id]: "newcomer" },
  staff4: { [kitchen.id]: "newcomer", [register.id]: "newcomer" },
  staff5: { [hall.id]: "unavailable" },
});

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
  // ホールでは責任者。早番と中番を続けて入り、早番の中で休憩する。
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
  // レジでは新人。
  shift("staff4", firstDate, [["night", register]]),
  shift("staff5", firstDate, [], { requestedShiftTypeOptionIds: [] }),
  // 未提出者へ入れた仮の勤務。
  shift("staff6", firstDate, [["morning", kitchen]], { requestedShiftTypeOptionIds: [], isProvisional: true }),
  // 2日目。人ごとの合計に効く。
  shift("staff1", secondDate, [["morning", hall]]),
  shift("staff2", secondDate, [["late", kitchen]]),
];

const detailStaffing = buildStaffing({ templates: shiftTypeDetailTemplates, days: shiftTypeDetailDays });

const noopStaffingActions = {
  onApplyTemplate: async () => true,
  onSaveCustom: async () => true,
  isPending: false,
};

const detailArgs = {
  ...shiftTypeArgs,
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
  <StaffingHarness {...args} templates={shiftTypeDetailTemplates} weekdayDays={shiftTypeDetailDays} />
);

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/PC/Daily Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、必要人数（足りない人数、新人だけの印）、休憩、熟練度、仮の勤務を1画面で確かめる。 */
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
    staffing: buildStaffing({
      templates: [shiftTypeWeekdayTemplate],
      days: mockShiftTypeDates.map((date) =>
        templateDay(date, {
          ...shiftTypeWeekdayTemplate,
          requirements: {
            kind: "shiftType",
            options: shiftTypeOptions.map((option) => ({ optionId: option.id, counts: staffingCounts([[hall, 2]]) })),
          },
        }),
      ),
    }),
  },
  globals: desktopGlobals,
};

/** 型を設定していない店舗では、人数だけを出し、必要人数が未設定であることを伝える。 */
export const DetailWithoutDayTemplates: Story = {
  name: "Detail Without Day Templates",
  args: { ...detailArgs, staffing: buildStaffing({ days: mockShiftTypeDates.map(unsetDay) }) },
  globals: desktopGlobals,
};

/** 管理者の閲覧専用でも、ポジションと休憩と人数は出す。入れるものの選択は出さず、型は名前だけを出す。 */
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
    await expect(await canvas.findByTitle("早番 ホール 1/2 ▲1、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務なし"));
    const kitchenCell = await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、キッチン");
    await expect(kitchenCell).toHaveTextContent("キッチン");
    // 山田さんはキッチンで新人なので、入れた勤務に「新」の印が付く。
    await expect(within(kitchenCell).getByText("新")).toHaveAttribute("title", "キッチンでは新人です");
    // 新人の山田さんが入っても、仮の勤務の中村さんがいるため、キッチンは新人だけにならない。
    await expect(await canvas.findByTitle("早番 ホール 1/2 ▲1、キッチン 2/1 ＋1、レジ 0")).toBeInTheDocument();

    // 別のポジションを選んで勤務のあるセルを押すと、外れずに入れ替わる。
    await userEvent.click(await canvas.findByRole("radio", { name: "ホール" }));
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、キッチン"));
    const hallCell = await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、ホール");
    await expect(hallCell).toHaveTextContent("ホール");
    // ホールでは標準なので、同じ人の勤務でも印は付かない。
    await expect(within(hallCell).queryByText("新")).not.toBeInTheDocument();
    await expect(await canvas.findByTitle("早番 ホール 2/2、キッチン 1/1、レジ 0")).toBeInTheDocument();

    // 同じポジションでもう一度押すと外れる。
    await userEvent.click(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり、ホール"));
    await expect(await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務なし")).toBeInTheDocument();
    await expect(await canvas.findByTitle("早番 ホール 1/2 ▲1、キッチン 1/1、レジ 0")).toBeInTheDocument();
  },
};

/** 人数の行の左にある型のメニューから型を当てると、その日と型を送り、必要人数が変わる。曜日の設定へも戻せる。 */
export const DetailDayTemplateInteractive: Story = {
  name: "Detail Day Template Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));
    await expect(await canvas.findByRole("button", { name: "この日の型: イベント日" })).toBeInTheDocument();
    // イベント日は早番のホールに3人が必要で、キッチンは未設定になる。
    await expect(await canvas.findByTitle("早番 ホール 1/3 ▲2、キッチン 1、レジ 0")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "この日の型: イベント日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "曜日の設定に戻す" }));
    await expect(await canvas.findByRole("button", { name: "この日の型: 平日" })).toBeInTheDocument();
    await expect(await canvas.findByTitle("早番 ホール 1/2 ▲1、キッチン 1/1、レジ 0")).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [firstDate], templateId: "event" },
      { mutation: "applyDayTemplateToDates", dates: [firstDate], templateId: null },
    ]);
  },
};

/** 「この日だけ人数を変える」で、勤務パターンごとの人数を数字で直し、その日だけの必要人数として保存する。 */
export const DetailCustomRequirementsInteractive: Story = {
  name: "Detail Custom Requirements Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "この日の型: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "この日だけ人数を変える" }));
    // 2026-05-21は木曜日。
    const dialog = within(await body.findByRole("dialog", { name: "5月21日（木）の必要人数" }));
    const hallInput = dialog.getByRole("spinbutton", { name: "早番のホールの必要人数" });
    // いまの必要人数が初期値に入っている。
    await expect(hallInput).toHaveValue(2);

    await userEvent.clear(hallInput);
    await userEvent.type(hallInput, "4");
    await userEvent.clear(dialog.getByRole("spinbutton", { name: "夜勤のレジの必要人数" }));
    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));

    await waitFor(() =>
      expect(body.queryByRole("dialog", { name: "5月21日（木）の必要人数" })).not.toBeInTheDocument(),
    );
    const count = (positionId: string, value: number) => ({ positionId, count: value });
    // 0人にした夜勤は送らない。
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      {
        mutation: "saveDayCustomRequirements",
        date: firstDate,
        requirements: {
          kind: "shiftType",
          options: [
            { optionId: "morning", counts: [count("hall", 4), count("kitchen", 1)] },
            { optionId: "middle", counts: [count("hall", 1), count("kitchen", 1)] },
            { optionId: "late", counts: [count("hall", 2), count("kitchen", 1)] },
          ],
        },
      },
    ]);
    await expect(await canvas.findByRole("button", { name: "この日の型: この日だけ変更" })).toBeInTheDocument();
    await expect(await canvas.findByTitle("早番 ホール 1/4 ▲3、キッチン 1/1、レジ 0")).toBeInTheDocument();
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
