import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "../..";
import { lastPositionStorageKey } from "../../lastPositionStorage";
import { shiftTypeDetailDays, shiftTypeDetailTemplates, shiftTypeWeekdayTemplate } from "../../sp/detailStoryFixtures";
import {
  mockShiftTypeDates,
  mockShiftTypePattern,
  mockShiftTypeStaffs,
  withPositionSkills,
} from "../../stories/fixtures";
import { desktopGlobals, fullscreenParameters, shiftFormDecorators, shiftTypeArgs } from "../../stories/shared";
import { clearRememberedBoardPosition, shiftTypeBoardDetailArgs } from "../../stories/shiftTypeBoardFixtures";
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
// くわしく表示のfixture（ポジション3つ、必要人数あり、熟練度あり、仮の勤務あり）
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#a78bfa", isDefault: false };
const detailPositions = [hall, kitchen, register];

const shiftTypeOptions = mockShiftTypePattern.kind === "shiftType" ? mockShiftTypePattern.options : [];

// 田中さんは、ホールではリーダー、キッチンでは見習い。山田さんは、キッチンとレジで見習い。鈴木さんは、ホールが担当外。
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
  // 早番と中番を続けて入る。
  shift("staff1", firstDate, [
    ["morning", hall],
    ["middle", hall],
  ]),
  shift("staff2", firstDate, [["middle", kitchen]]),
  shift("staff3", firstDate, [["late", hall]]),
  // レジでは見習い。
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
const harnessRender = (args: ShiftFormArgs) => <StaffingHarness {...args} templates={shiftTypeDetailTemplates} />;

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/PC/Daily Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 複数ポジション、必要人数（足りない人数、見習いだけの印）、熟練度、仮の勤務を1画面で確かめる。 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** ポジションが1つの店舗では「○」のまま、人数だけを足す。押すたびに付け外しし、メニューは出さない。 */
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

/** テンプレートを設定していない店舗では、人数だけを出し、充足率とテンプレートの選択を出さない。 */
export const DetailWithoutDayTemplates: Story = {
  name: "Detail Without Day Templates",
  args: { ...detailArgs, staffing: buildStaffing({ days: mockShiftTypeDates.map(unsetDay) }) },
  globals: desktopGlobals,
};

/** 管理者の閲覧専用でも、ポジションと人数は出す。押しても何も起きず、テンプレートは名前だけを出す。 */
export const DetailReadOnly: Story = {
  name: "Detail Read Only",
  args: { ...detailArgs, isReadOnly: true },
  globals: desktopGlobals,
};

/** スタッフ向けの確定シフト表示では、ポジションだけを足す。希望の輪、点、熟練度、人数は出さない。 */
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

/** 依頼の画像と同じ状態（希望どおり、希望だけ、希望外、時間の重なり、休み希望、未提出）を持つ代表例。 */
export const Board: Story = {
  args: shiftTypeBoardDetailArgs,
  globals: desktopGlobals,
  beforeEach: clearRememberedBoardPosition,
};

const headerOf = (canvas: ReturnType<typeof within>, name: string) =>
  canvas.findByRole("columnheader", { name: new RegExp(`^${name}`) });

/**
 * 見出しの「配置/必要」は、勤務パターンごとに並ぶポジションの数が違っても、列の中央に寄せる。
 * 必要人数がなく、だれも入っていないポジションは並べない。
 */
export const HeaderCountsCentered: Story = {
  name: "Header Counts Centered",
  args: {
    ...shiftTypeBoardDetailArgs,
    initialShifts: [],
  },
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await headerOf(canvas, "遅番");
    const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-position-counts]"));
    await expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const cell = row.closest("th") as HTMLElement;
      const items = Array.from(row.children) as HTMLElement[];
      // 空きとして残すポジションがない。
      for (const item of items) await expect(getComputedStyle(item).visibility).toBe("visible");
      const left = Math.min(...items.map((item) => item.getBoundingClientRect().left));
      const right = Math.max(...items.map((item) => item.getBoundingClientRect().right));
      const cellRect = cell.getBoundingClientRect();
      await expect(Math.abs((left + right) / 2 - (cellRect.left + cellRect.right) / 2)).toBeLessThanOrEqual(1);
    }
  },
};

/**
 * 空きのセルを押すと、最後に選んだポジションで入る。ピルを押して開くメニューでポジションを変えると、見出しの分数が変わる。
 * メニューは数字キーでも選べ、Escでは何も変えずに閉じる。「削除」で割り当てを外す。
 */
export const PositionMenuInteractive: Story = {
  name: "Position Menu Interactive",
  args: shiftTypeBoardDetailArgs,
  globals: desktopGlobals,
  beforeEach: clearRememberedBoardPosition,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const lateCell = (state: "勤務あり" | "勤務なし") =>
      canvas.findByRole("button", { name: `山本 拓海 遅番 ${state}` });
    await expect(await headerOf(canvas, "遅番")).toHaveTextContent("ホール3/2キッチン0/1");
    await expect(canvas.getByText("充足 66%")).toBeVisible();

    // 覚えたポジションがないため、店舗の先頭のポジション（ホール）で入る。
    await userEvent.click(await lateCell("勤務なし"));
    await expect(await lateCell("勤務あり")).toHaveTextContent("ホール");
    await expect(await headerOf(canvas, "遅番")).toHaveTextContent("ホール4/2キッチン0/1");

    // メニューでキッチンに変えると、見出しの分数と充足率が変わる。
    await userEvent.click(await lateCell("勤務あり"));
    const menu = await body.findByRole("menu");
    await expect(within(menu).getByRole("menuitemradio", { name: "ホール" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "キッチン" }));
    await expect(await lateCell("勤務あり")).toHaveTextContent("キッチン");
    await expect(await headerOf(canvas, "遅番")).toHaveTextContent("ホール3/2キッチン1/1");
    await expect(canvas.getByText("充足 77%")).toBeVisible();

    // 最後に選んだキッチンを覚え、次の空きのセルはキッチンで入る。
    await userEvent.click(await canvas.findByRole("button", { name: "山本 拓海 夜番 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: "山本 拓海 夜番 勤務あり" })).toHaveTextContent("キッチン");

    // Escでは何も変えずに閉じる。
    await userEvent.click(await lateCell("勤務あり"));
    await body.findByRole("menu");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument());
    await expect(await lateCell("勤務あり")).toHaveTextContent("キッチン");

    // 数字キーの3で、3つ目のポジション（ドリンク）を選ぶ。
    await userEvent.click(await lateCell("勤務あり"));
    await body.findByRole("menu");
    await userEvent.keyboard("3");
    await waitFor(async () => expect(await lateCell("勤務あり")).toHaveTextContent("ドリンク"));

    // 「削除」で割り当てを外すと、希望の輪だけが残る。
    await userEvent.click(await lateCell("勤務あり"));
    await userEvent.click(await body.findByRole("menuitem", { name: "削除" }));
    await expect(await lateCell("勤務なし")).toHaveTextContent("希望あり");
  },
};

/**
 * 見出しのポジションを押すと、選んだ状態になり、空きのセルはそのポジションで入る。
 * 割り当て済みのピルを押したときは、ポジションを自動で変えず、メニューを開く。
 */
export const WorkPositionPickerInteractive: Story = {
  name: "Work Position Picker Interactive",
  args: shiftTypeBoardDetailArgs,
  globals: desktopGlobals,
  beforeEach: clearRememberedBoardPosition,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const picker = await canvas.findByRole("radiogroup", { name: "入れるポジション" });
    // 覚えたポジションがないため、店舗の先頭のポジション（ホール）を選んだ状態で始まる。
    await expect(within(picker).getByRole("radio", { name: "ホール" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(within(picker).getByRole("radio", { name: "キッチン" }));
    await expect(within(picker).getByRole("radio", { name: "キッチン" })).toHaveAttribute("aria-checked", "true");
    await expect(within(picker).getByRole("radio", { name: "ホール" })).toHaveAttribute("aria-checked", "false");

    // 希望の輪のセルを押すと、選んだキッチンで入る。
    await userEvent.click(await canvas.findByRole("button", { name: "山本 拓海 遅番 勤務なし" }));
    const assigned = await canvas.findByRole("button", { name: "山本 拓海 遅番 勤務あり" });
    await expect(assigned).toHaveTextContent("キッチン");

    // ほかのポジションを選んでも、割り当て済みのピルを押すとメニューが開き、ポジションは変わらない。
    await userEvent.click(within(picker).getByRole("radio", { name: "ホール" }));
    await userEvent.click(assigned);
    await body.findByRole("menu");
    await expect(assigned).toHaveTextContent("キッチン");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByRole("menu")).not.toBeInTheDocument());
    await expect(within(picker).getByRole("radio", { name: "ホール" })).toHaveAttribute("aria-checked", "true");
  },
};

/** 担当外のポジションへ入れると、橙の点と理由が付く。名前の右にも確認事項のアイコンが出て、マウスを載せると勤務パターン名を付けた理由が出る。 */
export const DetailUnavailablePositionInteractive: Story = {
  name: "Detail Unavailable Position Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  beforeEach: () => localStorage.removeItem(lastPositionStorageKey(detailArgs.shopId)),
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 休み希望の鈴木さんは、ホールが担当外。まとまりを開いて、先頭のポジション（ホール）で入れる。
    await userEvent.click(await canvas.findByRole("button", { name: /^休み希望 1人/ }));
    await userEvent.click(await canvas.findByRole("button", { name: "鈴木 次郎 早番 勤務なし" }));

    const assigned = await canvas.findByRole("button", { name: "鈴木 次郎 早番 勤務あり" });
    await expect(assigned).toHaveAccessibleDescription("希望時間外に勤務あり、担当外のポジション");
    const row = assigned.closest("tr") as HTMLElement;
    await userEvent.hover(await within(row).findByRole("button", { name: "確認事項2件" }));
    const tooltip = await within(canvasElement.ownerDocument.body).findByRole("tooltip");
    await expect(tooltip).toHaveTextContent("早番：希望時間外に勤務あり");
    await expect(tooltip).toHaveTextContent("早番：担当外のポジション");
  },
};

/** 日付の見出しにあるテンプレートのメニューからテンプレートを当てると、その日とテンプレートを送り、必要人数が変わる。元のテンプレートも選び直せる。 */
export const DetailDayTemplateInteractive: Story = {
  name: "Detail Day Template Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await expect(await headerOf(canvas, "早番")).toHaveTextContent("ホール1/2キッチン1/1");

    await userEvent.click(await canvas.findByRole("button", { name: "この日のテンプレート: 平日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "イベント日" }));
    await expect(await canvas.findByRole("button", { name: "この日のテンプレート: イベント日" })).toBeInTheDocument();
    // イベント日は早番のホールに3人が必要で、キッチンは必要人数がなくなり、人数だけを出す。
    await waitFor(async () => expect(await headerOf(canvas, "早番")).toHaveTextContent("ホール1/3キッチン1"));

    await userEvent.click(await canvas.findByRole("button", { name: "この日のテンプレート: イベント日" }));
    await userEvent.click(await body.findByRole("menuitem", { name: "平日" }));
    await expect(await canvas.findByRole("button", { name: "この日のテンプレート: 平日" })).toBeInTheDocument();
    await waitFor(async () => expect(await headerOf(canvas, "早番")).toHaveTextContent("ホール1/2キッチン1/1"));
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [firstDate], templateId: "event" },
      { mutation: "applyDayTemplateToDates", dates: [firstDate], templateId: "weekday" },
    ]);
  },
};
