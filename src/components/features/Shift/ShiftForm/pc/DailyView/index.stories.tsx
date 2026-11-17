import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { timeToMinutes } from "@/src/domains/shift/time";
import type { PositionType, ShiftData, StaffType } from "@/src/domains/shift/types";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import { ShiftForm } from "../..";
import { TIME_AXIS_PADDING_PX } from "../../constants";
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
  onSaveCustom: async () => true,
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

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Daily Detail",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * 複数ポジション、バーの内側の休憩、熟練度、仮の勤務と、表の下の人数の帯を1画面で確かめる。
 * 帯は、足りない時間（▲）、多い時間（＋）、見習いだけの時間（見）、未設定のポジション（レジ）を含む。
 * 日付の一覧には、不足のある日と多い時間のある日の印が出る。
 */
export const Detail: Story = {
  args: detailArgs,
  globals: desktopGlobals,
};

/** テンプレートが当たらない日は、帯に人数だけを出し、必要人数が未設定であることを伝える。 */
export const DetailWithoutDayTemplateForDate: Story = {
  name: "Detail Without Day Template For Date",
  args: { ...detailArgs, dates: [SATURDAY], initialShifts: buildShifts(SATURDAY) },
  globals: desktopGlobals,
};

/** その日だけ人数を変えた日は、テンプレートの名前の代わりに「この日だけ変更」と出す。 */
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

// 確定済みの募集。確定した時点の必要人数だけを持ち、テンプレートの当て直しとその日だけの変更ができない。
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

/** 勤務のバーを押すと開く欄で、勤務区間のポジションを変えると、バーの色と人数の帯が変わる。 */
export const DetailChangePositionInteractive: Story = {
  name: "Detail Change Position Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const body = within(document.body);
    const row = await findRow(canvasElement, "staff1");
    const staffing = within(await findStaffingSection(canvasElement));
    await expect(getWorkBarColors(row)).toEqual([HALL_RGB]);
    // Aさんが抜ける前は、14:00〜18:00のホールはちょうど1人。
    await expect(await staffing.findByRole("button", { name: "ホール 14:00〜18:00 1/1" })).toBeInTheDocument();

    await userEvent.click(getWorkBars(row)[0]);
    const positionGroup = await body.findByRole("radiogroup", { name: "10:00〜18:00のポジション" });
    await expect(within(positionGroup).getByRole("radio", { name: "ホール" })).toBeChecked();
    await userEvent.click(within(positionGroup).getByRole("radio", { name: "キッチン" }));

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]));
    // ホールはAさんが抜けて14:00以降が不足になり、キッチンは増える。
    await expect(await staffing.findByRole("button", { name: "ホール 14:00〜22:00 0/1 ▲1" })).toBeInTheDocument();
    await expect(await staffing.findByRole("button", { name: "キッチン 14:00〜17:00 3/1 ＋2" })).toBeInTheDocument();
    // ポジションを変えても、入れてあった休憩は残る。
    await expect(getBreakBars(row)).toHaveLength(1);
  },
};

/** 勤務のバーを押すと開く欄の「休憩を変更」から、休憩を足し、消せる。 */
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
    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：なし")).toBeInTheDocument();
    await userEvent.click(await body.findByRole("button", { name: "休憩を変更" }));
    const addDialog = within(await body.findByRole("dialog"));
    await userEvent.click(await addDialog.findByRole("button", { name: "休憩を追加" }));
    await expect(await addDialog.findByRole("group", { name: "休憩1" })).toBeInTheDocument();
    await userEvent.click(addDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(1));

    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：15:30〜16:30")).toBeInTheDocument();

    // 消す。
    await userEvent.click(await body.findByRole("button", { name: "休憩を変更" }));
    const removeDialog = within(await body.findByRole("dialog"));
    await userEvent.click(await removeDialog.findByRole("button", { name: "休憩1を削除" }));
    await userEvent.click(removeDialog.getByRole("button", { name: "変更する" }));
    await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(getBreakBars(row)).toHaveLength(0));

    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：なし")).toBeInTheDocument();
  },
};

/** 「入れるもの」で休憩を選んでいる間は、勤務のある行を押すと休憩の編集が開き、勤務は増えない。 */
export const DetailBreakToolInteractive: Story = {
  name: "Detail Break Tool Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));
    // ドラッグの開始、移動、終了を分けて送る。ボタンを押している状態を引き継ぐため、同じ操作者で送る。
    // 押した時点で休憩の編集が開いて背面を押せなくなっても、ドラッグの続きを送って、勤務が入らないことを確かめる。
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const drag = async (target: HTMLElement, from: { clientX: number; clientY: number }, to: typeof from) => {
      await user.pointer({ keys: "[MouseLeft>]", target, coords: from });
      await user.pointer({ target, coords: to });
      await user.pointer({ keys: "[/MouseLeft]", target, coords: to });
    };

    // 勤務のない行をドラッグしても、勤務は入らず、休憩の編集も開かない。
    const emptyRow = await findRow(canvasElement, "staff5");
    await drag(emptyRow.lastElementChild as HTMLElement, pointAt(emptyRow, "18:00"), pointAt(emptyRow, "21:00"));
    await expect(getWorkBars(emptyRow)).toHaveLength(0);
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();

    // 勤務のある行は、勤務の外の時間をドラッグしても、勤務は増えず、その日の休憩の編集が開く。
    const row = await findRow(canvasElement, "staff2");
    await drag(row.lastElementChild as HTMLElement, pointAt(row, "09:30"), pointAt(row, "11:30"));
    await expect(await body.findByRole("dialog")).toHaveTextContent("Bさんの休憩");
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);
    await expect(row).toHaveTextContent("12:00–20:00");
  },
};

/** 休憩を選んでいる間に勤務のバーを押しても、休憩の編集だけが開き、勤務の欄を重ねて開かない。 */
export const DetailBreakToolOnBarInteractive: Story = {
  name: "Detail Break Tool On Bar Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await userEvent.click(await canvas.findByRole("radio", { name: "休憩" }));

    const row = await findRow(canvasElement, "staff2");
    await userEvent.click(getWorkBars(row)[0]);

    await expect(await body.findByRole("dialog")).toHaveTextContent("Bさんの休憩");
    // 勤務の欄は「休憩：…」と「休憩を変更」を持つ。休憩の編集と同時には開かない。
    await expect(body.queryByText(/^休憩：/)).not.toBeInTheDocument();
    await expect(body.queryByRole("button", { name: "休憩を変更" })).not.toBeInTheDocument();
  },
};

/** 「入れるもの」で選んだポジションで、ドラッグした時間に勤務が入り、人数の帯が変わる。 */
export const DetailPaintInteractive: Story = {
  name: "Detail Paint Interactive",
  args: detailArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = await findRow(canvasElement, "staff5");
    const timeline = row.lastElementChild as HTMLElement;
    const staffing = within(await findStaffingSection(canvasElement));
    await expect(await staffing.findByRole("button", { name: "キッチン 20:00〜21:00 0/1 ▲1" })).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    // ドラッグの開始、移動、終了を分けて送り、移動を受け取る準備ができてから次へ進む。
    // ボタンを押している状態を引き継ぐため、同じ操作者で送る。
    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft>]", target: timeline, coords: pointAt(row, "17:00") });
    await user.pointer({ target: timeline, coords: pointAt(row, "22:00") });
    await user.pointer({ keys: "[/MouseLeft]", target: timeline, coords: pointAt(row, "22:00") });

    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]));
    await expect(row).toHaveTextContent("17:00–22:00");
    // 入れた勤務の分だけ、足りなかった時間がちょうどになり、必要人数のない21:00以降は多くなる。
    await expect(await staffing.findByRole("button", { name: "キッチン 20:00〜21:00 1/1" })).toBeInTheDocument();
    await expect(await staffing.findByRole("button", { name: "キッチン 21:00〜22:00 1/0 ＋1" })).toBeInTheDocument();
    await expect(staffing.queryByRole("button", { name: "キッチン 20:00〜21:00 0/1 ▲1" })).not.toBeInTheDocument();
  },
};

// ==========================================
// 人数の帯と、その日のテンプレートの操作
// ==========================================
const harnessRender = (args: ShiftFormArgs) => (
  <StaffingHarness {...args} templates={templates} weekdayDays={weekdayDays} />
);

const openTemplateMenu = async (canvasElement: HTMLElement, label: string) => {
  const staffing = within(await findStaffingSection(canvasElement));
  await userEvent.click(await staffing.findByRole("button", { name: `この日のテンプレート: ${label}` }));
  return within(document.body);
};

/** 帯の区間を押すと、人数、必要人数、足りない人数、見習いだけであることを全文で読める。 */
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
    await expect(popover.getByText("人数 1人 / 必要 2人")).toBeInTheDocument();
    await expect(popover.getByText("1人足りません")).toBeInTheDocument();
    await expect(popover.getByText("見習いだけの時間です")).toBeInTheDocument();
    // 見習いだけの時間帯は、確認事項として、その日の件数に入る。人数の印（▲と＋）とは別のバッジで出る。
    const dateChip = canvasElement.querySelector(`[data-date-chip="${WEEKDAY}"]`) as HTMLElement;
    await expect(within(dateChip).getByLabelText("確認事項1件")).toBeInTheDocument();
    await expect(Array.from(dateChip.querySelectorAll("[data-staffing-mark]")).map((mark) => mark.textContent)).toEqual(
      ["▲不足あり", "＋多い時間あり"],
    );
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
 * テンプレートのメニューからテンプレートを当てると、その日とテンプレートを1回で送り、帯の必要人数が変わる。
 * 当て直しても、保存していない勤務は消えない。その日だけの指定は、曜日の設定へ戻せる。
 */
export const DetailApplyTemplateInteractive: Story = {
  name: "Detail Apply Template Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const staffing = within(await findStaffingSection(canvasElement));

    // 保存していない勤務を入れる（Eさんに、キッチンの17:00〜22:00）。
    const row = await findRow(canvasElement, "staff5");
    const timeline = row.lastElementChild as HTMLElement;
    await userEvent.click(await canvas.findByRole("radio", { name: "キッチン" }));
    const user = userEvent.setup();
    await user.pointer({ keys: "[MouseLeft>]", target: timeline, coords: pointAt(row, "17:00") });
    await user.pointer({ target: timeline, coords: pointAt(row, "22:00") });
    await user.pointer({ keys: "[/MouseLeft]", target: timeline, coords: pointAt(row, "22:00") });
    await waitFor(() => expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]));

    // 繁忙日を当てる。いま当たっている平日には、選択中の印が付いている。
    const menu = await openTemplateMenu(canvasElement, "平日");
    await expect(
      within(await menu.findByRole("menuitem", { name: /平日/ })).getByLabelText("選択中"),
    ).toBeInTheDocument();
    await userEvent.click(await menu.findByRole("menuitem", { name: "繁忙日" }));

    await expect(await staffing.findByRole("button", { name: "この日のテンプレート: 繁忙日" })).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [WEEKDAY], templateId: "busy" },
    ]);
    // 必要人数が1日を通して2人になり、9:00〜10:00のホールが不足になる。
    await expect(await staffing.findByRole("button", { name: "ホール 09:00〜10:00 1/2 ▲1" })).toBeInTheDocument();
    // 入れた勤務は残る。
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);
    await expect(row).toHaveTextContent("17:00–22:00");

    // 曜日の設定に戻す。
    const resetMenu = await openTemplateMenu(canvasElement, "繁忙日");
    await userEvent.click(await resetMenu.findByRole("menuitem", { name: "曜日の設定に戻す" }));

    await expect(await staffing.findByRole("button", { name: "この日のテンプレート: 平日" })).toBeInTheDocument();
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [WEEKDAY], templateId: "busy" },
      { mutation: "applyDayTemplateToDates", dates: [WEEKDAY], templateId: null },
    ]);
    await expect(getWorkBarColors(row)).toEqual([KITCHEN_RGB]);
  },
};

/** 「ほかの日もまとめて変える」で、複数の日をチェックで選び、同じテンプレートを1回で当てる。 */
export const DetailBulkApplyInteractive: Story = {
  name: "Detail Bulk Apply Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const menu = await openTemplateMenu(canvasElement, "平日");
    await userEvent.click(await menu.findByRole("menuitem", { name: "ほかの日もまとめて変える" }));

    const dialog = within(await menu.findByRole("dialog", { name: "テンプレートをまとめて変える" }));
    const submit = dialog.getByRole("button", { name: "変更する" });
    // メニューを開いた日だけが選ばれている。テンプレートを選ぶまでは変更できない。
    await expect(dialog.getByRole("checkbox", { name: "1/21(水)" })).toBeChecked();
    await expect(dialog.getByText("1日を選択中")).toBeInTheDocument();
    await expect(submit).toBeDisabled();

    await userEvent.click(dialog.getByRole("combobox", { name: "当てるテンプレート" }));
    await userEvent.click(await dialog.findByRole("option", { name: "繁忙日" }));
    // 土日をまとめて選び、木曜を足す。
    await userEvent.click(dialog.getByRole("button", { name: "土日" }));
    await expect(dialog.getByRole("checkbox", { name: "1/21(水)" })).not.toBeChecked();
    await userEvent.click(dialog.getByRole("checkbox", { name: "1/22(木)" }));
    await expect(dialog.getByText("3日を選択中")).toBeInTheDocument();
    await userEvent.click(submit);

    await waitFor(() =>
      expect(menu.queryByRole("dialog", { name: "テンプレートをまとめて変える" })).not.toBeInTheDocument(),
    );
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      { mutation: "applyDayTemplateToDates", dates: [THURSDAY, SATURDAY, SUNDAY], templateId: "busy" },
    ]);
    // テンプレートを当てた日は、だれも入っていないため不足の印が付く。
    const rail = within(canvasElement).getByRole("tablist", { name: "日付選択" });
    await waitFor(() =>
      expect(
        Array.from(rail.querySelectorAll("[data-date-chip]")).map((chip) => [
          chip.getAttribute("data-date-chip"),
          Array.from(chip.querySelectorAll("[data-staffing-mark]")).map((mark) =>
            mark.getAttribute("data-staffing-mark"),
          ),
        ]),
      ).toEqual([
        [WEEKDAY, ["shortage", "excess"]],
        [THURSDAY, ["shortage"]],
        [SATURDAY, ["shortage"]],
        [SUNDAY, ["shortage"]],
      ]),
    );
  },
};

/** 「この日だけ人数を変える」で、いまの必要人数に人数を入れて保存すると、その日だけの必要人数として送る。 */
export const DetailCustomRequirementsInteractive: Story = {
  name: "Detail Custom Requirements Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const staffing = within(await findStaffingSection(canvasElement));
    const menu = await openTemplateMenu(canvasElement, "平日");
    await userEvent.click(await menu.findByRole("menuitem", { name: "この日だけ人数を変える" }));

    const dialogElement = await menu.findByRole("dialog", { name: "1月21日（水）の必要人数" });
    const dialog = within(dialogElement);
    await expect(dialog.getByText("この日だけの変更です。テンプレート「平日」は変わりません。")).toBeInTheDocument();

    // レジの10:00〜13:00に、2人を入れる。人数を選ぶ欄は、Dialogの上に重ねず、帯のすぐ下に出る。
    const registerBand = within(await dialog.findByRole("group", { name: "レジの必要人数" }));
    await userEvent.click(registerBand.getByRole("button", { name: "時間を選んで入れる" }));
    const countForm = within(await dialog.findByRole("group", { name: "レジの必要人数を入れる" }));
    await userEvent.selectOptions(countForm.getByRole("combobox", { name: "開始" }), "10:00");
    await userEvent.selectOptions(countForm.getByRole("combobox", { name: "終了" }), "13:00");
    await userEvent.click(countForm.getByRole("button", { name: "2人" }));
    await waitFor(() =>
      expect(dialog.queryByRole("group", { name: "レジの必要人数を入れる" })).not.toBeInTheDocument(),
    );

    await userEvent.click(dialog.getByRole("button", { name: "保存する" }));

    await waitFor(() =>
      expect(menu.queryByRole("dialog", { name: "1月21日（水）の必要人数" })).not.toBeInTheDocument(),
    );
    // 入れた2人は、同じ時間に重ねた2本のバーとして保存の引数に入る。
    const bar = (positionId: string, startTime: string, endTime: string) => ({ positionId, startTime, endTime });
    await expect((await readStaffingCalls(canvasElement)).calls).toEqual([
      {
        mutation: "saveDayCustomRequirements",
        date: WEEKDAY,
        requirements: {
          kind: "time",
          bars: [
            bar("hall", "09:00", "22:00"),
            bar("hall", "11:00", "14:00"),
            bar("kitchen", "11:00", "21:00"),
            bar("kitchen", "12:00", "14:00"),
            bar("register", "10:00", "13:00"),
            bar("register", "10:00", "13:00"),
          ],
        },
      },
    ]);
    // その日だけ変えた日として出て、レジの必要人数が帯に出る。
    await expect(
      await staffing.findByRole("button", { name: "この日のテンプレート: この日だけ変更" }),
    ).toBeInTheDocument();
    await expect(await staffing.findByRole("button", { name: "レジ 10:00〜13:00 0/2 ▲2" })).toBeInTheDocument();
  },
};

/** 「この日だけ人数を変える」の導線から設定ページを開くと、Dialogを閉じてから移る。 */
export const DetailCustomRequirementsOpenSetupInteractive: Story = {
  name: "Detail Custom Requirements Open Setup Interactive",
  args: detailArgs,
  render: harnessRender,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const menu = await openTemplateMenu(canvasElement, "平日");
    await userEvent.click(await menu.findByRole("menuitem", { name: "この日だけ人数を変える" }));
    const dialogElement = await menu.findByRole("dialog", { name: "1月21日（水）の必要人数" });

    await userEvent.click(within(dialogElement).getByRole("button", { name: "シフト作成の設定を開く" }));

    await waitFor(() =>
      expect(menu.queryByRole("dialog", { name: "1月21日（水）の必要人数" })).not.toBeInTheDocument(),
    );
    await expect(await readStaffingCalls(canvasElement)).toEqual({ calls: [], setupOpenCount: 1 });
  },
};

/** テンプレートが当たらない日は、テンプレートのメニューに「未設定」と出て、その日だけの人数と設定ページへの導線を選べる。 */
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
    await expect(await menu.findByRole("menuitem", { name: "この日だけ人数を変える" })).toBeInTheDocument();
    // その日だけの指定がない日には「曜日の設定に戻す」を出さない。
    await expect(menu.queryByRole("menuitem", { name: "曜日の設定に戻す" })).not.toBeInTheDocument();
    await userEvent.click(await menu.findByRole("menuitem", { name: "シフト作成の設定を開く" }));

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
    await expect(staffing.queryByRole("button", { name: /この日のテンプレート/ })).not.toBeInTheDocument();
  },
};
