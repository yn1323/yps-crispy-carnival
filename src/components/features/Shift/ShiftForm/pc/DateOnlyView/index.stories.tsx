import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "../..";
import { lastPositionStorageKey } from "../../lastPositionStorage";
import {
  clearRememberedDateOnlyBoardPosition,
  dateOnlyBoardDayWithoutTemplateArgs,
  dateOnlyBoardDetailArgs,
} from "../../stories/dateOnlyBoardFixtures";
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
// くわしく表示のfixture（ポジション3つ、必要人数あり、熟練度あり）
// 期間は 2026-06-02(火)〜06-08(月)、06-07(日)は定休日。
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#a78bfa", isDefault: false };
const detailPositions = [hall, kitchen, register];

// 田中さんは、ホールではリーダー、キッチンでは見習い。山田さんは、レジで見習い。吉田さんは、キッチンが担当外。
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
  shift("staff1", "2026-06-02", hall),
  shift("staff1", "2026-06-04", hall),
  shift("staff1", "2026-06-05", null),
  shift("staff2", "2026-06-02", kitchen),
  shift("staff2", "2026-06-03", kitchen),
  shift("staff2", "2026-06-06", kitchen),
  shift("staff3", "2026-06-03", hall),
  shift("staff3", "2026-06-04", register),
  shift("staff4", "2026-06-02", hall),
  shift("staff4", "2026-06-06", hall),
  // 6/2(火)のホールは、必要人数より1人多い。
  shift("staff5", "2026-06-02", hall),
  shift("staff5", "2026-06-03", null),
  shift("staff5", "2026-06-06", register),
  // 未提出者へ入れた勤務。
  shift("staff6", "2026-06-04", kitchen, { requestedTime: null, requestedTimes: [] }),
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

// 曜日の設定で当たるテンプレート。土日（6/6、6/7）は土日のテンプレート、ほかは平日のテンプレート。
const weekdayDays = mockDateOnlyDates.map((date) =>
  templateDay(date, date === "2026-06-06" || date === "2026-06-07" ? weekendTemplate : weekdayTemplate),
);
// 6/4(木)だけ、曜日のテンプレートではなくイベント日のテンプレートを当てる。
const detailDays = weekdayDays.map((day) =>
  day.date === "2026-06-04" ? templateDay(day.date, eventTemplate, "dateTemplate") : day,
);
const detailStaffing = buildStaffing({ templates, days: detailDays });

const noopStaffingActions = {
  onApplyTemplate: async () => true,
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
const harnessRender = (args: ShiftFormArgs) => <StaffingHarness {...args} templates={templates} />;

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/PC Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 依頼の画像と同じ週。ポジションの色のピル、日ごとの「配置/必要」、週の充足率、連絡事項の列、たたんだ「希望なし」を1画面で確かめる。 */
export const Board: Story = {
  args: dateOnlyBoardDetailArgs,
  globals: desktopGlobals,
};

/** 複数ポジション、必要人数（足りない人数、多い人数、見習いだけの印、その日だけのテンプレート）、未提出者の勤務を1画面で確かめる。 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** 連絡事項の列は右端に置き、残りの横幅を使う。日付の列の幅は、連絡事項の有無で変わらない。 */
export const DetailWithDateNotes: Story = {
  name: "Detail With Date Notes",
  args: { ...detailArgs, dateNotes: dateOnlyDateNotesArgs.dateNotes },
  globals: desktopGlobals,
};

const toPosition =
  (target: PositionType) =>
  (item: ShiftData): ShiftData => ({
    ...item,
    positions: item.positions.map((position) => ({
      ...position,
      positionId: target.id,
      positionName: target.name,
      color: target.color,
    })),
  });

/** ポジションが1つの店舗では、ピルを「○」のままにし、人数だけを足す。ポジションの名前と色は出さない。 */
export const DetailSinglePosition: Story = {
  name: "Detail Single Position",
  args: {
    ...detailArgs,
    positions: [hall],
    initialShifts: detailShifts.map(toPosition(hall)),
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

// 店舗を作ったときにできる、名前を付けていない最初のポジション。
const unsplit: PositionType = { id: "default", name: "シフト", color: "#60a5fa", isDefault: true };

/** ポジションを分けていない店舗では、仮の名前「シフト」を出さず、「○」と人数だけを出す。 */
export const DetailUnsplitPosition: Story = {
  name: "Detail Unsplit Position",
  args: {
    ...detailArgs,
    positions: [unsplit],
    initialShifts: detailShifts.map(toPosition(unsplit)),
    staffing: buildStaffing({
      templates,
      days: detailDays.map((day) => ({
        ...day,
        requirements: { kind: "dateOnly" as const, counts: staffingCounts([[unsplit, 3]]) },
      })),
    }),
  },
  globals: desktopGlobals,
};

/** テンプレートを設定していない店舗では、入っている人数だけを出し、充足率を出さない。 */
export const DetailWithoutDayTemplates: Story = {
  name: "Detail Without Day Templates",
  args: { ...detailArgs, staffing: buildStaffing({ days: mockDateOnlyDates.map(unsetDay) }) },
  globals: desktopGlobals,
};

/**
 * ポジションの人数のない日（テンプレートなし）があっても、テンプレートは見出しの下端にそろえる。
 * 人数の行の有無や数で、テンプレートの高さがずれないようにする。
 */
export const DetailDayWithoutTemplate: Story = {
  name: "Detail Day Without Template",
  args: dateOnlyBoardDayWithoutTemplateArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByRole("button", { name: /12\/2\(水\)のテンプレート/ });
    const gaps = Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-day-template]")).map((template) => {
      const cell = template.closest("th") as HTMLElement;
      return Math.round(cell.getBoundingClientRect().bottom - template.getBoundingClientRect().bottom);
    });
    // 1週目の開いている日（12/1、12/2、12/4〜12/6）のテンプレートの下端と、見出しの下端の間が、すべて同じになる。
    await expect(gaps).toHaveLength(5);
    await expect(new Set(gaps).size).toBe(1);
  },
};

/** 管理者の閲覧専用でも、ポジションと人数は出す。テンプレートは名前だけを出す。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...detailArgs, isReadOnly: true },
  globals: desktopGlobals,
};

/** スタッフ向けの確定シフト表示では、ポジションだけを足す。希望の輪、点、人数は出さない。 */
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

/** その日の見出しの中から、ポジションの「配置/必要」を探す。titleは「ホール 1/2」の形である。 */
const findDayCount = async (canvas: ReturnType<typeof within>, date: string, title: string) => {
  const headers: HTMLElement[] = await canvas.findAllByRole("columnheader");
  const header = headers.find((item) => item.dataset.dateHeader === date);
  await expect(header).toBeDefined();
  return within(header as HTMLElement).findByTitle(title);
};

/**
 * 空きのセルを押すと、最後に選んだポジション（選んでいなければ先頭のポジション）で入る。
 * 割り当て済みのピルを押すと、その場にメニューが開き、ポジションを変えると、その日の見出しの分数が変わる。
 */
export const PositionMenuInteractive: Story = {
  name: "Position Menu Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    localStorage.removeItem(lastPositionStorageKey(detailArgs.shopId));
    const canvas = within(canvasElement);
    const body = within(document.body);
    const cellName = (state: string) => `山田 一郎 6/3(水) ${state}`;
    await expect(await findDayCount(canvas, "2026-06-03", "ホール 1/2")).toBeInTheDocument();

    // 時間指定の「ドラッグで設定する内容」（休憩を含む）は出さない。空きのセルを押すと、先頭のポジションで入る。
    await expect(canvas.queryByRole("radiogroup", { name: "ドラッグで設定する内容" })).not.toBeInTheDocument();
    const initialPicker = await canvas.findByRole("radiogroup", { name: "入れるポジション" });
    await expect(within(initialPicker).getByRole("radio", { name: "ホール" })).toHaveAttribute("aria-checked", "true");
    const row = (await canvas.findByRole("button", { name: cellName("勤務なし") })).closest("tr") as HTMLElement;
    const rowHeight = row.getBoundingClientRect().height;
    await userEvent.click(await canvas.findByRole("button", { name: cellName("勤務なし") }));
    const hallPill = await canvas.findByRole("button", { name: cellName("勤務あり、ホール") });
    await expect(hallPill).toHaveTextContent("ホール");
    await expect(await findDayCount(canvas, "2026-06-03", "ホール 2/2")).toBeInTheDocument();
    // 希望のない日に入れたため、橙の点が付く。割り当ての前後で、行の高さは変わらない。
    await expect(hallPill.querySelector('[data-assignment-dot="orange"]')).not.toBeNull();
    await expect(hallPill).toHaveAccessibleDescription("希望時間外に勤務あり");
    await expect(row.getBoundingClientRect().height).toBe(rowHeight);

    // 割り当て済みのピルを押すと、いまのポジションにチェックの付いたメニューが開く。
    await userEvent.click(hallPill);
    const menu = await body.findByRole("menu");
    await expect(within(menu).getByRole("menuitemradio", { name: /ホール/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: /レジ/ }));
    const registerPill = await canvas.findByRole("button", { name: cellName("勤務あり、レジ") });
    await expect(await findDayCount(canvas, "2026-06-03", "ホール 1/2")).toBeInTheDocument();
    // レジで見習いの山田さんだけが入ったため、見習いだけの印が付く。
    await expect(await findDayCount(canvas, "2026-06-03", "レジ 1、見習いだけ")).toBeInTheDocument();

    // 次の空きのセルには、最後に選んだポジションで入る。
    await userEvent.click(await canvas.findByRole("button", { name: "鈴木 次郎 6/3(水) 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: "鈴木 次郎 6/3(水) 勤務あり、レジ" })).toBeInTheDocument();

    // 数字キーでも選べる。1は先頭のポジション。
    await userEvent.click(registerPill);
    await body.findByRole("menu");
    await userEvent.keyboard("1");
    await expect(await canvas.findByRole("button", { name: cellName("勤務あり、ホール") })).toBeInTheDocument();
    await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument());

    // Escは、何も変えずに閉じる。
    await userEvent.click(await canvas.findByRole("button", { name: cellName("勤務あり、ホール") }));
    await body.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument());
    await expect(await canvas.findByRole("button", { name: cellName("勤務あり、ホール") })).toBeInTheDocument();

    // 「削除」で外れ、見出しの分数が戻る。
    await userEvent.click(await canvas.findByRole("button", { name: cellName("勤務あり、ホール") }));
    await userEvent.click(await body.findByRole("menuitem", { name: "削除" }));
    await expect(await canvas.findByRole("button", { name: cellName("勤務なし") })).toBeInTheDocument();
    await expect(await findDayCount(canvas, "2026-06-03", "ホール 1/2")).toBeInTheDocument();
    // 週の見出しのポジションを押すと選んだ状態になり、空きのセルはそのポジションで入る。
    const picker = await canvas.findByRole("radiogroup", { name: "入れるポジション" });
    await userEvent.click(within(picker).getByRole("radio", { name: "レジ" }));
    await expect(within(picker).getByRole("radio", { name: "レジ" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(await canvas.findByRole("button", { name: cellName("勤務なし") }));
    await expect(await canvas.findByRole("button", { name: cellName("勤務あり、レジ") })).toBeInTheDocument();
  },
};

/** 週の見出しの充足率は、割り当てを変えると変わる。見出しには、合計と「▲1」「＋1」の表記を出さない。 */
export const FulfillmentInteractive: Story = {
  name: "Fulfillment Interactive",
  args: dateOnlyBoardDetailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    clearRememberedDateOnlyBoardPosition();
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("充足 41%")).toBeInTheDocument();
    await expect(await findDayCount(canvas, "2026-12-05", "販売 2/4")).toBeInTheDocument();

    // 希望だけの日へ入れると、その日の分数と、週の充足率が変わる。
    await userEvent.click(await canvas.findByRole("button", { name: "山口 美月 12/5(土) 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: "山口 美月 12/5(土) 勤務あり、販売" })).toBeInTheDocument();
    await expect(await findDayCount(canvas, "2026-12-05", "販売 3/4")).toBeInTheDocument();
    await expect(await canvas.findByText("充足 44%")).toBeInTheDocument();

    const headText = canvasElement.querySelector("thead")?.textContent ?? "";
    await expect(headText).not.toMatch(/[▲＋+]/);
    await expect(canvasElement.querySelector("tbody")?.textContent ?? "").not.toMatch(/[×−-]/);
  },
};

/** 日ごとの見出しのテンプレートの名前を押すと、その日のテンプレートのメニューが開き、テンプレートを当てられる。元のテンプレートも、同じメニューから選び直せる。 */
export const DetailDayTemplateInteractive: Story = {
  name: "Detail Day Template Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "6/3(水)のテンプレート: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));
    await expect(
      await canvas.findByRole("button", { name: "6/3(水)のテンプレート: イベント日（この日だけ）" }),
    ).toBeInTheDocument();
    await expect(await findDayCount(canvas, "2026-06-03", "ホール 1/3")).toBeInTheDocument();
    await expect(await findDayCount(canvas, "2026-06-03", "キッチン 1/2")).toBeInTheDocument();
    await expect(await findDayCount(canvas, "2026-06-03", "レジ 0/1")).toBeInTheDocument();

    // 平日を選び直す。メニューから当てたテンプレートは、その日だけの指定として出る。
    await userEvent.click(
      await canvas.findByRole("button", { name: "6/3(水)のテンプレート: イベント日（この日だけ）" }),
    );
    await userEvent.click(await body.findByRole("menuitem", { name: "平日" }));
    await expect(
      await canvas.findByRole("button", { name: "6/3(水)のテンプレート: 平日（この日だけ）" }),
    ).toBeInTheDocument();
    await expect(await findDayCount(canvas, "2026-06-03", "ホール 1/2")).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: ["2026-06-03"], templateId: "event" },
      { mutation: "applyDayTemplateToDates", dates: ["2026-06-03"], templateId: "weekday" },
    ]);
  },
};
