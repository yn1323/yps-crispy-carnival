import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import { ShiftForm } from "../..";
import { TIME_AXIS_PADDING_PX } from "../../constants";
import { lastPositionStorageKey } from "../../lastPositionStorage";
import { RANGE_ASSIGN_HINT_STORAGE_KEY } from "../../rangeAssignHintStorage";
import { mockStaffs, mockTimeRange, withPositionSkills } from "../../stories/fixtures";
import { desktopGlobals, fullscreenParameters, shiftFormDecorators } from "../../stories/shared";
import {
  buildStaffing,
  customDay,
  readStaffingCalls,
  StaffingHarness,
  type StoryTemplate,
  templateDay,
  timeRequirements,
  unsetDay,
} from "../../stories/staffingHarness";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ==========================================
// くわしく表示のfixture（ポジション3つ、必要人数あり、休憩あり、熟練度あり、仮の勤務あり）
// 2026-01-21は水曜、22は木曜（平日のテンプレートが当たる）。24は土曜、25は日曜（テンプレートが当たらない）。
// ==========================================
const hall: PositionType = { id: "hall", name: "ホール", color: "#60a5fa", isDefault: true };
const kitchen: PositionType = { id: "kitchen", name: "キッチン", color: "#fb923c", isDefault: false };
const register: PositionType = { id: "register", name: "レジ", color: "#a78bfa", isDefault: false };
const HALL_RGB = "rgb(96, 165, 250)";
const KITCHEN_RGB = "rgb(251, 146, 60)";
const REGISTER_RGB = "rgb(167, 139, 250)";

const WEEKDAY = "2026-01-21";
const THURSDAY = "2026-01-22";
const SATURDAY = "2026-01-24";
const SUNDAY = "2026-01-25";

// Aさんは、ホールでリーダー。Cさんは、ホールで見習い。Dさんは、キッチンで見習いで、レジが担当外（ホールでは一人前）。
const detailStaffs: StaffType[] = withPositionSkills(mockStaffs, {
  staff1: { [hall.id]: "lead" },
  staff3: { [hall.id]: "newcomer" },
  staff4: { [kitchen.id]: "newcomer", [register.id]: "unavailable" },
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

const buildShifts = (date: string): ShiftData[] => [
  // Aさん（ホールでリーダー）: 時刻で入れた休憩がバーの内側に出る。
  shift("staff1", date, [[hall, "10:00", "18:00"]], {
    requestedTime: { start: "10:00", end: "18:00" },
    breaks: [{ start: "13:00", end: "14:00" }],
  }),
  // Bさん: 休憩のない勤務。
  shift("staff2", date, [[kitchen, "12:00", "20:00"]], { requestedTime: { start: "12:00", end: "20:00" } }),
  // Cさん（ホールで見習い、未提出）: 前回の勤務を仮で入れた日。
  shift("staff3", date, [[hall, "10:00", "14:00"]], { isProvisional: true }),
  // Dさん: 1日の中でポジションを変える。キッチンの区間にだけ「見」の印が出る。
  shift(
    "staff4",
    date,
    [
      [hall, "09:00", "13:00"],
      [kitchen, "13:00", "17:00"],
    ],
    { requestedTime: { start: "09:00", end: "17:00" } },
  ),
  // Eさん（未提出）: 勤務なし。
];

// 平日のテンプレート。ホールは昼に2人、キッチンは昼に2人が必要で、レジにはバーを置かない（未設定）。
const weekdayTemplate: StoryTemplate = {
  id: "weekday",
  name: "平日",
  requirements: timeRequirements([
    [hall, "09:00", "22:00"],
    [hall, "11:00", "14:00"],
    [kitchen, "11:00", "21:00"],
    [kitchen, "12:00", "14:00"],
  ]),
};
// 繁忙日のテンプレート。1日を通して、ホールとキッチンに2人ずつが必要。
const busyTemplate: StoryTemplate = {
  id: "busy",
  name: "繁忙日",
  requirements: timeRequirements([
    [hall, "09:00", "22:00", 2],
    [kitchen, "09:00", "22:00", 2],
  ]),
};
const templates = [weekdayTemplate, busyTemplate];

// 水曜と木曜は平日のテンプレートが当たり、土曜と日曜はテンプレートが当たらない。勤務を入れているのは水曜だけ。
const detailDates = [WEEKDAY, THURSDAY, SATURDAY, SUNDAY];
const weekdayDays = [
  templateDay(WEEKDAY, weekdayTemplate),
  templateDay(THURSDAY, weekdayTemplate),
  unsetDay(SATURDAY),
  unsetDay(SUNDAY),
];
const detailStaffing = buildStaffing({ templates, days: weekdayDays });

const noopStaffingActions = {
  onApplyTemplate: async () => true,
  isPending: false,
};

const detailArgs = {
  shopId: "shop1",
  staffs: detailStaffs,
  positions: [hall, kitchen, register],
  initialShifts: buildShifts(WEEKDAY),
  dates: detailDates,
  timeRange: mockTimeRange,
  holidays: [],
  submissionPattern: DEFAULT_TIME_PATTERN,
  staffing: detailStaffing,
  initialDetailMode: true,
  onDetailModeChange: () => {},
  detailActions: { onOpenSetup: () => {}, dayStaffingActions: noopStaffingActions },
  // 13:00〜14:00のホールは、リーダーが休憩に入り、見習いだけになる。確認事項として日付の件数へ足す。
  newcomerOnlyPeriods: [
    { date: WEEKDAY, positionId: hall.id, scope: { kind: "time" as const, start: "13:00", end: "14:00" } },
  ],
} satisfies ShiftFormArgs;

const LAST_POSITION_KEY = lastPositionStorageKey(detailArgs.shopId);
const clearRememberedState = () => {
  localStorage.removeItem(RANGE_ASSIGN_HINT_STORAGE_KEY);
  localStorage.removeItem(LAST_POSITION_KEY);
};

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Daily Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
  // 案内を出すかどうかと、最後に選んだポジションは、端末に覚える。前のStoryの操作を引き継がない。
  beforeEach: () => {
    clearRememberedState();
    return clearRememberedState;
  },
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 複数ポジション、バーの内側の休憩、熟練度、仮の勤務と、表の下の人数の帯を1画面で確かめる。
 * 帯は、足りない時間（−◯）、多い時間（+◯）、見習いだけの時間（注意のアイコン）、未設定のポジション（レジ）を含む。
 * その日のテンプレートは、人数の帯の見出しに出る。
 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** テンプレートが当たらない日は、帯に人数だけを出し、帯の見出しのテンプレートに「未設定」と出す。 */
export const DetailWithoutDayTemplateForDate: Story = {
  name: "Detail Without Day Template For Date",
  args: { ...detailArgs, dates: [SATURDAY], initialShifts: buildShifts(SATURDAY) },
  globals: desktopGlobals,
};

/** その日だけの必要人数を持つ日は、帯の見出しに、テンプレートの名前の代わりに「この日だけ変更」と出す。 */
export const DetailCustomDay: Story = {
  name: "Detail Custom Day",
  args: {
    ...detailArgs,
    staffing: buildStaffing({
      templates,
      days: [
        customDay(
          WEEKDAY,
          timeRequirements([
            [hall, "10:00", "18:00", 2],
            [register, "09:00", "13:00"],
          ]),
        ),
        ...weekdayDays.slice(1),
      ],
    }),
  },
  globals: desktopGlobals,
};

// ポジションが5つの店舗。過不足があるのはホールとキッチンだけで、洗い場はちょうど、レジとデリバリーは未設定。
const dish: PositionType = { id: "dish", name: "洗い場", color: "#14b8a6", isDefault: false };
const delivery: PositionType = { id: "delivery", name: "デリバリー", color: "#78bd14", isDefault: false };
const manyPositionsTemplate: StoryTemplate = {
  ...weekdayTemplate,
  requirements: timeRequirements([
    [hall, "09:00", "22:00"],
    [hall, "11:00", "14:00"],
    [kitchen, "11:00", "21:00"],
    [kitchen, "12:00", "14:00"],
    [dish, "18:00", "21:00"],
  ]),
};
const manyPositionsArgs = {
  ...detailArgs,
  positions: [hall, kitchen, register, dish, delivery],
  initialShifts: [
    ...buildShifts(WEEKDAY).filter((item) => item.staffId !== "staff5"),
    shift("staff5", WEEKDAY, [[dish, "18:00", "21:00"]]),
  ],
  staffing: buildStaffing({
    templates: [manyPositionsTemplate, busyTemplate],
    days: [templateDay(WEEKDAY, manyPositionsTemplate), ...weekdayDays.slice(1)],
  }),
} satisfies ShiftFormArgs;

/** ポジションが4つ以上の日は、過不足のあるポジションだけを出し、残りを「ほか3つは過不足なし」にまとめる。 */
export const DetailManyPositions: Story = {
  name: "Detail Many Positions",
  args: manyPositionsArgs,
  globals: desktopGlobals,
};

// 確定済みの募集。確定した時点の必要人数だけを持ち、テンプレートを当て直せない。
const lockedArgs = {
  ...detailArgs,
  isConfirmed: true,
  staffing: buildStaffing({
    isLocked: true,
    days: [
      templateDay(WEEKDAY, weekdayTemplate, "confirmed"),
      templateDay(THURSDAY, weekdayTemplate, "confirmed"),
      unsetDay(SATURDAY),
      unsetDay(SUNDAY),
    ].map((day) => ({ ...day, source: "confirmed" as const })),
  }),
  detailActions: { onOpenSetup: () => {} },
} satisfies ShiftFormArgs;

// ==========================================
// 操作の補助
// ==========================================
const findRow = async (canvasElement: HTMLElement, staffId: string) => {
  const selector = `[data-tour="shift-row-${staffId}"]`;
  await waitFor(() => expect(canvasElement.querySelector(selector)).not.toBeNull());
  return canvasElement.querySelector(selector) as HTMLElement;
};

// 勤務のバーと、時刻で入れた休憩の帯は、名前を持たない色の面なので、塗り方で見分ける。
const getWorkBars = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>('div[style^="background: rgb"]'));
const getBreakBars = (row: HTMLElement) =>
  Array.from(row.querySelectorAll<HTMLElement>('div[style^="background-color"]'));
const getWorkBarColors = (row: HTMLElement) => getWorkBars(row).map((bar) => getComputedStyle(bar).backgroundColor);
// ドラッグ中の仮のバーは、押した操作を受け取らない面として描く。
const getDragPreviewColors = (row: HTMLElement) =>
  Array.from((row.lastElementChild as HTMLElement).children)
    .filter((element) => getComputedStyle(element).pointerEvents === "none" && getComputedStyle(element).zIndex === "5")
    .map((element) => getComputedStyle(element).backgroundColor);

/** 行の時間軸の上で、その時刻にあたる位置を返す。 */
const pointAt = (row: HTMLElement, time: string) => {
  const rect = (row.lastElementChild as HTMLElement).getBoundingClientRect();
  const hourWidth = (rect.width - TIME_AXIS_PADDING_PX * 2) / (mockTimeRange.end - mockTimeRange.start);
  const minutesFromStart = timeToMinutes(time) - mockTimeRange.start * 60;
  return {
    clientX: rect.left + TIME_AXIS_PADDING_PX + (minutesFromStart / 60) * hourWidth,
    clientY: rect.top + rect.height / 2,
  };
};

const findStaffingSection = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("region", { name: "人数" });

// ドラッグの開始、移動、終了を分けて送り、移動を受け取る準備ができてから次へ進む。
// ボタンを押している状態を引き継ぐため、同じ操作者で送る。
const dragOnRow = async (row: HTMLElement, from: string, to: string) => {
  const user = userEvent.setup();
  const target = row.lastElementChild as HTMLElement;
  await user.pointer({ keys: "[MouseLeft>]", target, coords: pointAt(row, from) });
  await user.pointer({ target, coords: pointAt(row, to) });
  await user.pointer({ keys: "[/MouseLeft]", target, coords: pointAt(row, to) });
};

const clickOnRow = async (row: HTMLElement, time: string) => {
  const user = userEvent.setup();
  await user.pointer({ keys: "[MouseLeft]", target: row.lastElementChild as HTMLElement, coords: pointAt(row, time) });
};

/** 勤務のバーの範囲を選ぶと開くメニュー。名前に、選んだ時間が入る。 */
const findRangeMenu = async (timeLabel: string, subject: "ポジション" | "勤務" = "ポジション") =>
  within(await within(document.body).findByRole("menu", { name: `${timeLabel}の${subject}と休憩` }));
const expectNoRangeMenu = () =>
  waitFor(() => expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument());
const getSelections = (row: HTMLElement) => Array.from(row.querySelectorAll("[data-range-selection]"));

const HINT_TEXT = "バーをなぞると ポジションを変えられます";

/** 日付の見出しの「入れるもの」。次に新しく入れるポジション、または休憩を選ぶ。 */
const findPalette = async (canvasElement: HTMLElement) =>
  within(await within(canvasElement).findByRole("radiogroup", { name: "入れるもの" }));
/** 「入れるもの」で、いま選んでいる項目。 */
const findNextPositionChip = async (canvasElement: HTMLElement) =>
  (await findPalette(canvasElement)).findByRole("radio", { checked: true });

/**
 * 勤務のバーの一部をなぞると、その範囲を選び、メニューでキッチンを選ぶと区間が分かれる。
 * 入れてあった休憩は残る。一度入れると、日付の見出しの案内が消える。
 */
export const DetailRangeAssignInteractive: Story = {
  name: "Detail Range Assign Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = await findRow(canvasElement, "staff1");
    const staffing = within(await findStaffingSection(canvasElement));
    await expect(getWorkBarColors(row)).toEqual([HALL_RGB]);
    await expect(await canvas.findByText(HINT_TEXT)).toBeInTheDocument();
    // まだ選んでいない端末では、一覧の先頭のホールが、次に入れるポジションになる。
    await expect(await findNextPositionChip(canvasElement)).toHaveTextContent("ホール");
    // Aさんが抜ける前は、14:00〜18:00のホールはちょうど1人。
    await expect(await staffing.findByRole("button", { name: "ホール 14:00〜18:00 1/1" })).toBeInTheDocument();

    // Aさんはホールの10:00〜18:00で、13:00〜14:00が休憩。
    await dragOnRow(row, "15:00", "17:00");
    const menu = await findRangeMenu("15:00〜17:00");
    await expect(getSelections(row)).toHaveLength(1);
    await expect(menu.getByRole("menuitemradio", { name: "ホール" })).toBeChecked();
    await expect(menu.getByRole("menuitemradio", { name: "キッチン" })).not.toBeChecked();
    await userEvent.click(menu.getByRole("menuitemradio", { name: "キッチン" }));

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([HALL_RGB, KITCHEN_RGB, HALL_RGB]));
    await expectNoRangeMenu();
    await expect(getSelections(row)).toHaveLength(0);
    await expect(row).toHaveTextContent("10:00–18:00");
    // ホールは15:00〜17:00にAさんが抜けて不足になり、キッチンは増える。
    await expect(await staffing.findByRole("button", { name: "ホール 15:00〜17:00 0/1 ▲1" })).toBeInTheDocument();
    await expect(await staffing.findByRole("button", { name: "キッチン 15:00〜17:00 3/1 ＋2" })).toBeInTheDocument();
    // ポジションを変えても、入れてあった休憩は残る。
    await expect(getBreakBars(row)).toHaveLength(1);
    await waitFor(() => expect(canvas.queryByText(HINT_TEXT)).not.toBeInTheDocument());

    // 選んだキッチンを覚え、次に新しく入れる勤務にも使う。日付の見出しの選択もキッチンに変わる。
    await expect(await findNextPositionChip(canvasElement)).toHaveTextContent("キッチン");
    const emptyRow = await findRow(canvasElement, "staff5");
    await dragOnRow(emptyRow, "18:00", "21:00");
    await waitFor(() => expect(getWorkBarColors(emptyRow)).toEqual([KITCHEN_RGB]));
    await expect(localStorage.getItem(LAST_POSITION_KEY)).toBe(kitchen.id);

    // メニューで休憩を選んでも、覚えたポジションは変わらない。
    await dragOnRow(emptyRow, "19:00", "20:00");
    await userEvent.click((await findRangeMenu("19:00〜20:00")).getByRole("menuitemradio", { name: "休憩" }));
    await waitFor(() => expect(getBreakBars(emptyRow)).toHaveLength(1));
    await expect(await findNextPositionChip(canvasElement)).toHaveTextContent("キッチン");
  },
};

/**
 * 日付の見出しのポジションを押すと、次に新しく入れる勤務のポジションが変わり、端末にも覚える。
 * 「休憩」を押している間は、勤務のバーの上をなぞった範囲が、メニューを開かずに15分単位で休憩になる。
 * 勤務の外をなぞっても、何も入らない。休憩の選択は端末に覚えない。
 */
export const DetailPaletteInteractive: Story = {
  name: "Detail Palette Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const palette = await findPalette(canvasElement);
    const emptyRow = await findRow(canvasElement, "staff5");
    await expect(await findNextPositionChip(canvasElement)).toHaveTextContent("ホール");

    // ポジションを押すと、次に入れる勤務がそのポジションになる。
    await userEvent.click(palette.getByRole("radio", { name: "キッチン" }));
    await expect(palette.getByRole("radio", { name: "キッチン" })).toBeChecked();
    await expect(localStorage.getItem(LAST_POSITION_KEY)).toBe(kitchen.id);
    await dragOnRow(emptyRow, "17:00", "20:00");
    await waitFor(() => expect(getWorkBarColors(emptyRow)).toEqual([KITCHEN_RGB]));

    // 休憩を押している間は、勤務の外をなぞっても何も入らない。休憩の選択は端末に覚えない。
    await userEvent.click(palette.getByRole("radio", { name: "休憩" }));
    await expect(palette.getByRole("radio", { name: "休憩" })).toBeChecked();
    await expect(localStorage.getItem(LAST_POSITION_KEY)).toBe(kitchen.id);
    await dragOnRow(emptyRow, "10:00", "12:00");
    await expect(getWorkBarColors(emptyRow)).toEqual([KITCHEN_RGB]);
    await expect(emptyRow).toHaveTextContent("17:00–20:00");

    // 勤務のバーの上をなぞると、メニューを開かずに、15分単位で休憩が入る。Bさんはキッチンの12:00〜20:00。
    const row = await findRow(canvasElement, "staff2");
    await dragOnRow(row, "14:00", "14:45");
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));
    await expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument();
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);

    // なぞらずに押した場合は、休憩を選んでいる間も、押した区間のメニューが開く。
    await clickOnRow(row, "14:20");
    const menu = await findRangeMenu("14:00〜14:45");
    await expect(menu.getByRole("menuitemradio", { name: "休憩" })).toBeChecked();

    // メニューでポジションを選ぶと、休憩の選択が外れ、そのポジションが次に入れるものになる。
    await userEvent.click(menu.getByRole("menuitemradio", { name: "ホール" }));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));
    await expect(await findNextPositionChip(canvasElement)).toHaveTextContent("ホール");
  },
};

/**
 * 前にこの店舗で最後に選んだポジションを端末から読み、日付の見出しで選んだ状態にする。
 * 空いている時間をドラッグすると、そのポジションで勤務が入る。
 */
export const DetailRememberedPosition: Story = {
  name: "Detail Remembered Position",
  args: detailArgs,
  globals: desktopGlobals,
  beforeEach: () => {
    localStorage.setItem(LAST_POSITION_KEY, kitchen.id);
  },
  play: async ({ canvasElement }) => {
    await waitFor(async () => expect(await findNextPositionChip(canvasElement)).toHaveTextContent("キッチン"));

    const row = await findRow(canvasElement, "staff5");
    await dragOnRow(row, "17:00", "22:00");
    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]));
  },
};

/** 覚えたポジションが削除済みの店舗では、一覧の先頭のポジションを次に入れるポジションにする。 */
export const DetailRememberedPositionDeleted: Story = {
  name: "Detail Remembered Position Deleted",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  beforeEach: () => {
    localStorage.setItem(LAST_POSITION_KEY, "deleted-position");
  },
  play: async ({ canvasElement }) => {
    const row = await findRow(canvasElement, "staff5");
    await dragOnRow(row, "17:00", "22:00");

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([HALL_RGB]));
    await expect(await findNextPositionChip(canvasElement)).toHaveTextContent("ホール");
  },
};

/** なぞらずに区間を押すと、その区間の全体を選ぶ。ホールへ変えると、隣のホールの区間とまとまる。 */
export const DetailRangeAssignByClickInteractive: Story = {
  name: "Detail Range Assign By Click Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Dさんはホールの9:00〜13:00と、キッチンの13:00〜17:00。
    const row = await findRow(canvasElement, "staff4");
    await expect(getWorkBarColors(row)).toEqual([HALL_RGB, KITCHEN_RGB]);

    await clickOnRow(row, "15:00");
    const menu = await findRangeMenu("13:00〜17:00");
    await expect(menu.getByRole("menuitemradio", { name: "キッチン" })).toBeChecked();
    await userEvent.click(menu.getByRole("menuitemradio", { name: "ホール" }));

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([HALL_RGB]));
    await expect(row).toHaveTextContent("09:00–17:00");
  },
};

/** Esc、メニューの外を押す、のどちらでも、何も変えずにメニューを閉じる。 */
export const DetailRangeAssignCancelInteractive: Story = {
  name: "Detail Range Assign Cancel Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Bさんはキッチンの12:00〜20:00。
    const row = await findRow(canvasElement, "staff2");

    await dragOnRow(row, "14:00", "16:00");
    await findRangeMenu("14:00〜16:00");
    await userEvent.keyboard("{Escape}");
    await expectNoRangeMenu();
    await expect(getSelections(row)).toHaveLength(0);

    await dragOnRow(row, "14:00", "16:00");
    await findRangeMenu("14:00〜16:00");
    await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
    await waitFor(() =>
      expect(within(document.body).queryByRole("menu", { name: /のポジションと休憩$/ })).not.toBeInTheDocument(),
    );
    await expect(getSelections(row)).toHaveLength(0);

    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);
    await expect(getBreakBars(row)).toHaveLength(0);
    await expect(row).toHaveTextContent("12:00–20:00");
    // 何も入れていないため、案内は出たままにする。
    await expect(canvas.getByText(HINT_TEXT)).toBeInTheDocument();
  },
};

/** メニューを開いている間は、数字のキーで、表示順のポジションを選べる。 */
export const DetailRangeAssignByKeyInteractive: Story = {
  name: "Detail Range Assign By Key Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Bさんはキッチンの12:00〜20:00。ポジションは、ホール、キッチン、レジの順。
    const row = await findRow(canvasElement, "staff2");

    // バーの端は時間の変更になるため、端から少し内側を押す。選ぶ範囲は30分単位にそろう。
    await dragOnRow(row, "12:14", "14:00");
    await findRangeMenu("12:00〜14:00");
    await userEvent.keyboard("3");

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([REGISTER_RGB, KITCHEN_RGB]));
    await expectNoRangeMenu();
  },
};

/** バーの端のドラッグは、くわしく表示でも、今までどおり時間の変更になる。範囲選択のメニューは開かない。 */
export const DetailResizeInteractive: Story = {
  name: "Detail Resize Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Bさんはキッチンの12:00〜20:00。
    const row = await findRow(canvasElement, "staff2");
    await expect(row).toHaveTextContent("12:00–20:00");

    await dragOnRow(row, "20:00", "21:00");

    await waitFor(() => expect(row).toHaveTextContent("12:00–21:00"));
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);
    await expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument();
  },
};

/**
 * 休憩の開始と終了の近くをつまむと、15分単位で休憩の時間を動かせる。動かしている間も、休憩はバーに出たままにする。
 * 勤務の長さを変えている間も、休憩は消えない。
 */
export const DetailBreakResizeInteractive: Story = {
  name: "Detail Break Resize Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Aさんはホールの10:00〜18:00で、13:00〜14:00が休憩。
    const row = await findRow(canvasElement, "staff1");
    const timeline = row.lastElementChild as HTMLElement;
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));
    const user = userEvent.setup();

    // 休憩の終了をつまんで、14:45まで伸ばす。動かしている間も休憩が出ている。
    await user.pointer({ keys: "[MouseLeft>]", target: timeline, coords: pointAt(row, "14:00") });
    await user.pointer({ target: timeline, coords: pointAt(row, "14:45") });
    await expect(getBreakBars(row)).toHaveLength(1);
    await user.pointer({ keys: "[/MouseLeft]", target: timeline, coords: pointAt(row, "14:45") });
    await clickOnRow(row, "13:30");
    await findRangeMenu("13:00〜14:45");
    await userEvent.keyboard("{Escape}");
    await expectNoRangeMenu();

    // 休憩の開始をつまんで、12:30まで早める。
    await dragOnRow(row, "13:00", "12:30");
    await clickOnRow(row, "13:30");
    await findRangeMenu("12:30〜14:45");
    await userEvent.keyboard("{Escape}");
    await expectNoRangeMenu();
    await expect(row).toHaveTextContent("10:00–18:00");

    // 勤務の終了を縮めている間も、休憩は消えない。
    await user.pointer({ keys: "[MouseLeft>]", target: timeline, coords: pointAt(row, "18:00") });
    await user.pointer({ target: timeline, coords: pointAt(row, "17:00") });
    await expect(getBreakBars(row)).toHaveLength(1);
    await user.pointer({ keys: "[/MouseLeft]", target: timeline, coords: pointAt(row, "17:00") });
    await waitFor(() => expect(row).toHaveTextContent("10:00–17:00"));
    await expect(getBreakBars(row)).toHaveLength(1);
  },
};

/** 休憩の端を、反対の端まで（15分より短く）動かすと、その休憩を削除する。 */
export const DetailBreakResizeDeleteInteractive: Story = {
  name: "Detail Break Resize Delete Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Aさんはホールの10:00〜18:00で、13:00〜14:00が休憩。
    const row = await findRow(canvasElement, "staff1");
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));

    // 15分までは縮められる。
    await dragOnRow(row, "14:00", "13:15");
    await clickOnRow(row, "13:07");
    await findRangeMenu("13:00〜13:15");
    await userEvent.keyboard("{Escape}");
    await expectNoRangeMenu();

    // 終了を開始まで動かすと、休憩がなくなる。勤務は変わらない。
    await dragOnRow(row, "13:15", "13:00");
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));
    await expect(getWorkBarColors(row)).toEqual([HALL_RGB]);
    await expect(row).toHaveTextContent("10:00–18:00");
  },
};

/** 勤務を縮めて休憩が勤務の外に出たあとで、勤務を伸ばし直しても、消えた休憩は戻らない。 */
export const DetailShrinkThenExtendInteractive: Story = {
  name: "Detail Shrink Then Extend Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Aさんはホールの10:00〜18:00で、13:00〜14:00が休憩。
    const row = await findRow(canvasElement, "staff1");
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));

    await dragOnRow(row, "10:00", "14:30");
    await waitFor(() => expect(row).toHaveTextContent("14:30–18:00"));
    await expect(getBreakBars(row)).toHaveLength(0);

    await dragOnRow(row, "14:30", "10:00");
    await waitFor(() => expect(row).toHaveTextContent("10:00–18:00"));
    await expect(getBreakBars(row)).toHaveLength(0);
  },
};

/**
 * 選んだ範囲を休憩にできる。入れた休憩を押して選び、ポジションを選ぶと、休憩が外れる。
 * 勤務の頭を選んで休憩にした場合は、休憩を残さず勤務を短くする。ひと続きの勤務の全体は、休憩にできない。
 */
export const DetailRangeBreakInteractive: Story = {
  name: "Detail Range Break Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Bさんはキッチンの12:00〜20:00で、休憩はない。
    const row = await findRow(canvasElement, "staff2");
    await expect(getBreakBars(row)).toHaveLength(0);

    // 押して全体を選んだ場合は、休憩を選べない。
    await clickOnRow(row, "17:00");
    const wholeMenu = await findRangeMenu("12:00〜20:00");
    await expect(wholeMenu.getByRole("menuitemradio", { name: /^休憩/ })).toHaveAttribute("aria-disabled", "true");
    await expect(wholeMenu.getByText("まるごと休憩にはできません")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expectNoRangeMenu();

    // 勤務の途中を選ぶと、休憩が入る。勤務は増えない。
    await dragOnRow(row, "14:00", "15:00");
    await userEvent.click((await findRangeMenu("14:00〜15:00")).getByRole("menuitemradio", { name: "休憩" }));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);
    await expect(row).toHaveTextContent("12:00–20:00");

    // 入れた休憩を押すと、その休憩を選ぶ。チェックの出ている「休憩」をもう一度選ぶと、休憩が外れる。
    await clickOnRow(row, "14:20");
    const breakMenu = await findRangeMenu("14:00〜15:00");
    await expect(breakMenu.getByRole("menuitemradio", { name: "休憩" })).toBeChecked();
    await userEvent.click(breakMenu.getByRole("menuitemradio", { name: "休憩" }));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);

    // 休憩を選んでポジションを選んだ場合も、休憩が外れる。
    await dragOnRow(row, "14:00", "15:00");
    await userEvent.click((await findRangeMenu("14:00〜15:00")).getByRole("menuitemradio", { name: "休憩" }));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));
    await clickOnRow(row, "14:20");
    await userEvent.click((await findRangeMenu("14:00〜15:00")).getByRole("menuitemradio", { name: "キッチン" }));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);

    // 勤務の頭を選んで休憩にすると、休憩は入らず、選んだ分だけ勤務が短くなる。
    // バーの端は時間の変更になるため、端から少し内側を押す。
    await dragOnRow(row, "12:14", "13:00");
    await userEvent.click((await findRangeMenu("12:00〜13:00")).getByRole("menuitemradio", { name: "休憩" }));
    await waitFor(() => expect(row).toHaveTextContent("13:00–20:00"));
    await expect(getBreakBars(row)).toHaveLength(0);
  },
};

/**
 * メニューから休憩の編集を開き、休憩を足し、消せる。
 * 項目の名前は、勤務を選んでいる間は「休憩を追加」、休憩を選んでいる間は「休憩を変更」になる。
 */
export const DetailEditBreaksInteractive: Story = {
  name: "Detail Edit Breaks Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const row = await findRow(canvasElement, "staff2");
    await expect(getBreakBars(row)).toHaveLength(0);

    // 足す: 勤務の中央に1時間の休憩が入る。
    await clickOnRow(row, "17:00");
    await userEvent.click((await findRangeMenu("12:00〜20:00")).getByRole("menuitem", { name: "休憩を追加" }));
    const addDialog = within(await body.findByRole("dialog"));
    await userEvent.click(await addDialog.findByRole("button", { name: "休憩を追加" }));
    await expect(await addDialog.findByRole("group", { name: "休憩1" })).toBeInTheDocument();
    await userEvent.click(addDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));

    // 消す。入った休憩（15:30〜16:30）を押して選ぶと、項目の名前が「変更」になり、同じ編集が開く。
    await clickOnRow(row, "16:00");
    await userEvent.click((await findRangeMenu("15:30〜16:30")).getByRole("menuitem", { name: "休憩を変更" }));
    const removeDialog = within(await body.findByRole("dialog"));
    await userEvent.click(await removeDialog.findByRole("button", { name: "休憩1を削除" }));
    await userEvent.click(removeDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));
  },
};

/**
 * 勤務のある行で、離れた時間に勤務を入れると、間の空きを休憩として持つ。
 * バーは最初の開始から最後の終了までの1つの勤務になり、休憩の編集にも、その空きが休憩として出る。
 */
export const DetailSeparateWorkBecomesBreakInteractive: Story = {
  name: "Detail Separate Work Becomes Break Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    // Cさんはホールの10:00〜14:00。15:00〜17:00に、離して勤務を入れる。
    const row = await findRow(canvasElement, "staff3");
    await expect(getBreakBars(row)).toHaveLength(0);

    await dragOnRow(row, "15:00", "17:00");

    await waitFor(() => expect(row).toHaveTextContent("10:00–17:00"));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));

    // 休憩の編集には、勤務が1つにつながって出て、空きが休憩として入っている。
    await clickOnRow(row, "14:30");
    await userEvent.click((await findRangeMenu("14:00〜15:00")).getByRole("menuitem", { name: "休憩を変更" }));
    const dialog = within(await body.findByRole("dialog"));
    await expect(dialog.getByText("勤務：10:00〜17:00")).toBeInTheDocument();
    await expect(await dialog.findByRole("group", { name: "休憩1" })).toBeInTheDocument();
    await expect(dialog.queryByRole("group", { name: "休憩2" })).not.toBeInTheDocument();
  },
};

// 勤務を離して入れた日。Bさんはキッチンの12:00〜15:00と16:00〜20:00で、間の15:00〜16:00は休憩として見せる。
const gapArgs = {
  ...detailArgs,
  initialShifts: [
    ...buildShifts(WEEKDAY).filter((item) => item.staffId !== "staff2"),
    shift("staff2", WEEKDAY, [
      [kitchen, "12:00", "15:00"],
      [kitchen, "16:00", "20:00"],
    ]),
  ],
} satisfies ShiftFormArgs;

/**
 * 勤務を離して入れてできた休憩も、押して選べる。「休憩」にチェックが出て、もう一度選ぶと、前の勤務と同じポジションで埋まる。
 * ポジションを選ぶと、そのポジションの勤務で埋まる。
 */
export const DetailGapBreakInteractive: Story = {
  name: "Detail Gap Break Interactive",
  args: gapArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const row = await findRow(canvasElement, "staff2");
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB, KITCHEN_RGB]);

    // 空きを押すと、空きの全体を選ぶ。ポジションを選ぶと、そのポジションの勤務で埋まる。
    await clickOnRow(row, "15:30");
    const menu = await findRangeMenu("15:00〜16:00");
    await expect(menu.getByRole("menuitemradio", { name: "休憩" })).toBeChecked();
    await userEvent.click(menu.getByRole("menuitemradio", { name: "ホール" }));
    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB, HALL_RGB, KITCHEN_RGB]));
    await expect(row).toHaveTextContent("12:00–20:00");
  },
};

/** 勤務を離して入れてできた休憩で、チェックの出ている「休憩」をもう一度選ぶと、前の勤務と同じポジションで埋まり、1つの勤務になる。 */
export const DetailGapBreakRemoveInteractive: Story = {
  name: "Detail Gap Break Remove Interactive",
  args: gapArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const row = await findRow(canvasElement, "staff2");
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB, KITCHEN_RGB]);

    await clickOnRow(row, "15:30");
    await userEvent.click((await findRangeMenu("15:00〜16:00")).getByRole("menuitemradio", { name: "休憩" }));

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]));
    await expect(row).toHaveTextContent("12:00–20:00");
  },
};

/** メニューの削除は、選んだ範囲にかかる勤務の区間を、区間ごと削除する。項目には削除する時間を書く。 */
export const DetailRangeDeleteInteractive: Story = {
  name: "Detail Range Delete Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Dさんはホールの9:00〜13:00と、キッチンの13:00〜17:00。
    const row = await findRow(canvasElement, "staff4");

    await dragOnRow(row, "14:00", "15:00");
    await userEvent.click((await findRangeMenu("14:00〜15:00")).getByRole("menuitem", { name: "削除" }));

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([HALL_RGB]));
    await expect(row).toHaveTextContent("09:00–13:00");
  },
};

/** メニューを開いた状態の見た目。選んだ範囲は、白の半透明の面と枠線で示す。 */
export const DetailRangeMenuOpen: Story = {
  name: "Detail Range Menu Open",
  args: detailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const row = await findRow(canvasElement, "staff4");
    await dragOnRow(row, "11:00", "15:00");
    await findRangeMenu("11:00〜15:00");
  },
};

// シンプル表示。ポジションの色分けと「入れるもの」は出さず、休憩は出す。
const simpleArgs = { ...detailArgs, initialDetailMode: false } satisfies ShiftFormArgs;

/** シンプル表示でも、時刻で入れた休憩を勤務のバーに出す。 */
export const Simple: Story = {
  args: simpleArgs,
  globals: desktopGlobals,
};

/**
 * シンプル表示でも、勤務のバーの範囲を選ぶと同じメニューが開き、休憩を入れられる。
 * ポジションは出さず、代わりに「勤務」を出す。休憩を選んで「勤務」を選ぶと、休憩が外れる。
 * 削除は、ポジションの違う区間もまとめて、ひと続きの勤務を対象にする。
 */
export const SimpleRangeBreakInteractive: Story = {
  name: "Simple Range Break Interactive",
  args: simpleArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    // Aさんは10:00〜18:00で、13:00〜14:00が休憩。シンプル表示でも休憩が出る。
    const rowA = await findRow(canvasElement, "staff1");
    await waitFor(() => expect(getBreakBars(rowA)).toHaveLength(1));
    await expect(within(canvasElement).queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();

    // Bさんは12:00〜20:00で、休憩はない。範囲を選ぶと、ポジションの代わりに「勤務」が出る。
    const row = await findRow(canvasElement, "staff2");
    await dragOnRow(row, "14:00", "15:00");
    const menu = await findRangeMenu("14:00〜15:00", "勤務");
    await expect(menu.getByRole("menuitemradio", { name: "勤務" })).toBeChecked();
    await expect(menu.queryByRole("menuitemradio", { name: "キッチン" })).not.toBeInTheDocument();
    await userEvent.click(menu.getByRole("menuitemradio", { name: "休憩" }));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));
    await expect(row).toHaveTextContent("12:00–20:00");

    // 入れた休憩を押して「勤務」を選ぶと、休憩が外れる。
    await clickOnRow(row, "14:20");
    const breakMenu = await findRangeMenu("14:00〜15:00", "勤務");
    await expect(breakMenu.getByRole("menuitemradio", { name: "休憩" })).toBeChecked();
    await userEvent.click(breakMenu.getByRole("menuitemradio", { name: "勤務" }));
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));

    // Dさんはホールの9:00〜13:00と、キッチンの13:00〜17:00。シンプル表示では、続いた1つの勤務としてまとめて削除する。
    const rowD = await findRow(canvasElement, "staff4");
    // 押すと、ポジションの境目で区切らず、9:00〜17:00の全体を選ぶ。
    await clickOnRow(rowD, "15:00");
    await userEvent.click((await findRangeMenu("09:00〜17:00", "勤務")).getByRole("menuitem", { name: "削除" }));
    await waitFor(() => expect(getWorkBars(rowD)).toHaveLength(0));
  },
};

/** まだポジションを選んでいない端末では、空いている時間をドラッグすると、一覧の先頭のポジションで勤務が入り、人数の帯が変わる。 */
export const DetailPaintInteractive: Story = {
  name: "Detail Paint Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const row = await findRow(canvasElement, "staff5");
    const timeline = row.lastElementChild as HTMLElement;
    const staffing = within(await findStaffingSection(canvasElement));
    await expect(await staffing.findByRole("button", { name: "ホール 18:00〜22:00 0/1 ▲1" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft>]", target: timeline, coords: pointAt(row, "17:00") });
    await user.pointer({ target: timeline, coords: pointAt(row, "22:00") });
    // ドラッグ中の仮のバーも、入れるポジション（一覧の先頭のホール）の色で描く。
    await waitFor(() => expect(getDragPreviewColors(row)).toEqual([HALL_RGB]));
    await user.pointer({ keys: "[/MouseLeft]", target: timeline, coords: pointAt(row, "22:00") });

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([HALL_RGB]));
    await expect(getDragPreviewColors(row)).toEqual([]);
    await expect(row).toHaveTextContent("17:00–22:00");
    // 入れた勤務の分だけ、足りなかった時間がちょうどになる。新しく入れただけでは、メニューを開かない。
    await expect(await staffing.findByRole("button", { name: "ホール 18:00〜22:00 1/1" })).toBeInTheDocument();
    await expect(staffing.queryByRole("button", { name: "ホール 18:00〜22:00 0/1 ▲1" })).not.toBeInTheDocument();
    await expect(within(document.body).queryByRole("menu")).not.toBeInTheDocument();
  },
};

// ==========================================
// 人数の帯と、その日のテンプレートの操作
// ==========================================
const harnessRender = (args: ShiftFormArgs) => <StaffingHarness {...args} templates={templates} />;

// テンプレートのメニューのボタンは、日付の見出しではなく、人数の帯の見出しにある。
const findTemplateButton = async (canvasElement: HTMLElement, label: string) =>
  within(await findStaffingSection(canvasElement)).findByRole("button", { name: `この日のテンプレート: ${label}` });

const openTemplateMenu = async (canvasElement: HTMLElement, label: string) => {
  await userEvent.click(await findTemplateButton(canvasElement, label));
  return within(document.body);
};

/** 帯を必要人数の見せ方にした状態。テンプレートと同じく、ポジションの色の濃さと人数で示す。 */
export const DetailRequiredMode: Story = {
  name: "Detail Required Mode",
  args: detailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const staffing = within(await findStaffingSection(canvasElement));
    await userEvent.click(staffing.getByRole("button", { name: "必要人数で表示" }));
    // 押したあとのボタンは、過不足の見せ方へ戻すボタンになる。
    await expect(await staffing.findByRole("button", { name: "過不足で表示" })).toBeInTheDocument();
  },
};

/**
 * テンプレートの右のボタンで、帯を必要人数の見せ方へ切り替える。必要人数が変わる時刻だけで区切り、人数を出す。
 * ボタンは「過不足で表示」に変わり、もう一度押すと過不足の見せ方へ戻る。
 */
export const DetailRequiredModeInteractive: Story = {
  name: "Detail Required Mode Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const staffingSection = await findStaffingSection(canvasElement);
    const staffing = within(staffingSection);
    const requiredOf = (positionName: string) =>
      Array.from(
        staffing.getByRole("group", { name: `${positionName}の人数` }).querySelectorAll("[data-required-span]"),
      ).map((element) => element.getAttribute("title"));
    await userEvent.click(staffing.getByRole("button", { name: "必要人数で表示" }));

    // 押したあとのボタンは、過不足の見せ方へ戻すボタンになる。
    // 平日のホールは9:00〜22:00に1人、11:00〜14:00にもう1人。必要人数が変わる時刻だけで区切る。
    await waitFor(() =>
      expect(requiredOf("ホール")).toEqual([
        "ホール 09:00〜11:00 必要1人",
        "ホール 11:00〜14:00 必要2人",
        "ホール 14:00〜22:00 必要1人",
      ]),
    );
    // 過不足の区間は出さない。
    await expect(staffing.queryByRole("button", { name: /^ホール / })).not.toBeInTheDocument();

    await userEvent.click(staffing.getByRole("button", { name: "過不足で表示" }));

    await expect(await staffing.findByRole("button", { name: "必要人数で表示" })).toBeInTheDocument();
    await expect(await staffing.findByRole("button", { name: "ホール 18:00〜22:00 0/1 ▲1" })).toBeInTheDocument();
    await expect(requiredOf("ホール")).toEqual([]);
  },
};

/** 帯の区間を押すと、人数と必要人数、見習いだけであることを読める。 */
export const DetailBandSegmentInteractive: Story = {
  name: "Detail Band Segment Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const staffing = within(await findStaffingSection(canvasElement));
    // 13:00〜14:00のホールは、リーダーが休憩に入り、見習いのCさんだけが残る。
    const segment = await staffing.findByRole("button", { name: "ホール 13:00〜14:00 1/2 ▲1、見習いだけ" });
    await expect(segment).toHaveAttribute("data-staffing-tone", "shortage");

    await userEvent.click(segment);

    const popover = within(await body.findByRole("dialog", { name: "ホールの人数" }));
    await expect(popover.getByText("1/2人 担当")).toBeInTheDocument();
    await expect(popover.getByText("スキル見習いのみ")).toBeInTheDocument();
    // 見習いだけの時間帯は、確認事項として、その日の件数に入る。
    const dateChip = canvasElement.querySelector(`[data-date-chip="${WEEKDAY}"]`) as HTMLElement;
    await expect(within(dateChip).getByLabelText("確認事項1件")).toBeInTheDocument();
  },
};

/** 「ほか3つは過不足なし」を押すと全ポジションの行が出て、もう一度押すと過不足のある行だけに戻る。 */
export const DetailManyPositionsInteractive: Story = {
  name: "Detail Many Positions Interactive",
  args: manyPositionsArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const staffing = within(await findStaffingSection(canvasElement));
    const rowNames = () => staffing.getAllByRole("group").map((row) => row.getAttribute("aria-label"));
    const toggle = await staffing.findByRole("button", { name: "ほか3つは過不足なし" });
    await expect(rowNames()).toEqual(["ホールの人数", "キッチンの人数"]);

    await userEvent.click(toggle);
    await waitFor(() =>
      expect(rowNames()).toEqual(["ホールの人数", "キッチンの人数", "レジの人数", "洗い場の人数", "デリバリーの人数"]),
    );
    // 洗い場は必要人数どおりで、色を付けない。
    await expect(staffing.getByRole("button", { name: "洗い場 18:00〜21:00 1/1" })).toHaveAttribute(
      "data-staffing-tone",
      "even",
    );

    await userEvent.click(staffing.getByRole("button", { name: "過不足のあるポジションだけにする" }));
    await waitFor(() => expect(rowNames()).toEqual(["ホールの人数", "キッチンの人数"]));
  },
};

/**
 * 先頭の行で範囲を選ぶと、メニューは表の中で上に入りきらないため、選んだ範囲の下に出る。
 * 表の上に空きがあっても、表の上端を越えて、日付の見出しや画面のヘッダーの後ろに隠れない。
 */
export const RangeMenuStaysInsideGridInteractive: Story = {
  name: "Range Menu Stays Inside Grid Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await findRow(canvasElement, "staff1");
    // 先頭の行。Eさん以外は、12:00〜12:30にホールの勤務がある。
    const row = canvasElement.querySelector<HTMLElement>('[data-tour^="shift-row-"]');
    if (!row) throw new Error("先頭の行が見つかりません");
    await expect(row.getAttribute("data-tour")).not.toBe("shift-row-staff5");
    // 画面のヘッダーの分だけ、表の上に空きを作る。上の空きに入るだけで判断すると、メニューは表の外へ出る。
    const frame = row.closest<HTMLElement>('div[style*="100dvh"]');
    if (!frame) throw new Error("画面の高さを決めている入れ物が見つかりません");
    frame.style.marginTop = "300px";
    let scroller: HTMLElement | null = row.parentElement;
    while (scroller && getComputedStyle(scroller).overflowY !== "auto") scroller = scroller.parentElement;
    if (!scroller) throw new Error("表のスクロールする入れ物が見つかりません");

    await dragOnRow(row, "12:00", "12:30");
    await findRangeMenu("12:00〜12:30");
    const content = within(document.body).getByRole("menu", { name: "12:00〜12:30のポジションと休憩" });

    await waitFor(() =>
      expect(content.getBoundingClientRect().top).toBeGreaterThanOrEqual(scroller.getBoundingClientRect().top),
    );
    await expect(content.getBoundingClientRect().top).toBeGreaterThan(row.getBoundingClientRect().top);
  },
};

/**
 * テンプレートのメニューからテンプレートを当てると、その日とテンプレートを1回で送り、帯の必要人数が変わる。
 * 当て直しても、保存していない勤務は消えない。元のテンプレートも、同じメニューから選び直せる。
 */
export const DetailApplyTemplateInteractive: Story = {
  name: "Detail Apply Template Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const staffing = within(await findStaffingSection(canvasElement));

    // 保存していない勤務を入れる（Eさんに、既定のホールの17:00〜22:00）。
    const row = await findRow(canvasElement, "staff5");
    await dragOnRow(row, "17:00", "22:00");
    await waitFor(() => expect(getWorkBarColors(row)).toEqual([HALL_RGB]));

    // 繁忙日を当てる。いま当たっている平日には、選択中の印が付いている。
    const menu = await openTemplateMenu(canvasElement, "平日");
    await expect(
      within(await menu.findByRole("menuitem", { name: /平日/ })).getByLabelText("選択中"),
    ).toBeInTheDocument();
    await userEvent.click(await menu.findByRole("menuitem", { name: "繁忙日" }));

    await expect(await findTemplateButton(canvasElement, "繁忙日")).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [WEEKDAY], templateId: "busy" },
    ]);
    // 必要人数が1日を通して2人になり、9:00〜10:00のホールが不足になる。
    await expect(await staffing.findByRole("button", { name: "ホール 09:00〜10:00 1/2 ▲1" })).toBeInTheDocument();
    // 入れた勤務は残る。
    await expect(getWorkBarColors(row)).toEqual([HALL_RGB]);
    await expect(row).toHaveTextContent("17:00–22:00");

    // 平日を選び直す。必要人数が元に戻り、9:00〜10:00のホールはちょうどになる。
    const reselectMenu = await openTemplateMenu(canvasElement, "繁忙日");
    await userEvent.click(await reselectMenu.findByRole("menuitem", { name: "平日" }));

    await expect(await findTemplateButton(canvasElement, "平日")).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [WEEKDAY], templateId: "busy" },
      { mutation: "applyDayTemplateToDates", dates: [WEEKDAY], templateId: "weekday" },
    ]);
    await expect(await staffing.findByRole("button", { name: "ホール 09:00〜10:00 1/1" })).toBeInTheDocument();
    await expect(getWorkBarColors(row)).toEqual([HALL_RGB]);
  },
};

/**
 * メニューの「テンプレートなし」を選ぶと、その日にテンプレートを当てない指定を送り、帯は人数だけになる。
 * ボタンは「テンプレートなし」になり、メニューではその項目に選択中の印が付く。
 */
export const DetailApplyNoTemplateInteractive: Story = {
  name: "Detail Apply No Template Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const staffing = within(await findStaffingSection(canvasElement));
    const menu = await openTemplateMenu(canvasElement, "平日");
    await expect(menu.getByText("テンプレート")).toBeInTheDocument();
    await userEvent.click(await menu.findByRole("menuitem", { name: "テンプレートなし" }));

    await expect(await findTemplateButton(canvasElement, "テンプレートなし")).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [WEEKDAY], templateId: "none" },
    ]);
    // 必要人数がないため、過不足を出さずに人数だけを出す。
    await expect(await staffing.findByRole("button", { name: "ホール 10:00〜13:00 3" })).toHaveAttribute(
      "data-staffing-tone",
      "unset",
    );

    const reopened = await openTemplateMenu(canvasElement, "テンプレートなし");
    await expect(
      within(await reopened.findByRole("menuitem", { name: /テンプレートなし/ })).getByLabelText("選択中"),
    ).toBeInTheDocument();
  },
};

/** テンプレートが当たらない日は、テンプレートのメニューのボタンに「未設定」と出て、メニューから設定ページを開ける。 */
export const DetailUnsetDayMenuInteractive: Story = {
  name: "Detail Unset Day Menu Interactive",
  args: { ...detailArgs, dates: [SATURDAY, SUNDAY], initialShifts: buildShifts(SATURDAY) },
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const staffing = within(await findStaffingSection(canvasElement));
    // 必要人数がない日は、過不足を出さずに人数だけを出す。
    await expect(await staffing.findByRole("button", { name: "ホール 10:00〜13:00 3" })).toHaveAttribute(
      "data-staffing-tone",
      "unset",
    );

    const menu = await openTemplateMenu(canvasElement, "未設定");
    await userEvent.click(await menu.findByRole("menuitem", { name: "必要人数設定を開く" }));

    await expect(await readStaffingCalls(canvasElement)).toEqual({ calls: [], setupOpenCount: 1 });
  },
};

/** 確定済みの募集では、確定した時点のテンプレートの名前だけを出し、テンプレートのメニューを出さない。 */
export const DetailLocked: Story = {
  name: "Detail Locked",
  args: lockedArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const staffing = within(await findStaffingSection(canvasElement));
    // 確定時の必要人数で、過不足は出す。
    await expect(await staffing.findByRole("button", { name: "ホール 18:00〜22:00 0/1 ▲1" })).toBeInTheDocument();
    await expect(staffing.getByText("平日")).toBeInTheDocument();
    await expect(within(canvasElement).queryByRole("button", { name: /この日のテンプレート/ })).not.toBeInTheDocument();
  },
};
