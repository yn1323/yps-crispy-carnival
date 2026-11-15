import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { Id } from "@/convex/_generated/dataModel";
import { ShiftViewPage } from "./index";

const mockStaffs = [
  { _id: "staff1" as Id<"staffs">, name: "田中太郎" },
  { _id: "staff2" as Id<"staffs">, name: "鈴木花子" },
  { _id: "staff3" as Id<"staffs">, name: "佐藤一郎" },
];

const defaultPositionId = "position-1" as Id<"positions">;
const mockPositions = [{ _id: defaultPositionId, name: "シフト", color: "#3b82f6", isDefault: true }];
const timePattern = { kind: "time" as const, startTime: "09:00", endTime: "23:00" };
const shiftTypePattern = {
  kind: "shiftType" as const,
  options: [
    { id: "morning", name: "早番", startTime: "09:00", endTime: "15:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "15:00", endTime: "22:00", sortOrder: 1 },
  ],
};

const mockAssignments = [
  {
    staffId: "staff1" as Id<"staffs">,
    date: "2026-01-20",
    startTime: "10:00",
    endTime: "18:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff1" as Id<"staffs">,
    date: "2026-01-22",
    startTime: "12:00",
    endTime: "21:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff2" as Id<"staffs">,
    date: "2026-01-20",
    startTime: "14:00",
    endTime: "22:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff2" as Id<"staffs">,
    date: "2026-01-21",
    startTime: "10:00",
    endTime: "18:00",
    positionId: defaultPositionId,
  },
  {
    staffId: "staff3" as Id<"staffs">,
    date: "2026-01-23",
    startTime: "10:00",
    endTime: "18:00",
    positionId: defaultPositionId,
  },
];

const meta = {
  title: "features/StaffView/ShiftViewPage",
  component: ShiftViewPage,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ShiftViewPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    shopClosedDates: [],
    submissionPattern: timePattern,
    staffs: mockStaffs,
    positions: mockPositions,
    assignments: mockAssignments,
    timeRange: { start: 9, end: 23, unit: 30 },
  },
};

export const Empty: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    shopClosedDates: [],
    submissionPattern: timePattern,
    staffs: [],
    positions: mockPositions,
    assignments: [],
    timeRange: { start: 9, end: 23, unit: 30 },
  },
};

export const DateOnly: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    shopClosedDates: ["2026-01-22"],
    submissionPattern: { kind: "dateOnly" },
    staffs: mockStaffs,
    positions: mockPositions,
    assignments: [
      {
        staffId: "staff1" as Id<"staffs">,
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "22:00",
        positionId: defaultPositionId,
      },
      {
        staffId: "staff2" as Id<"staffs">,
        date: "2026-01-21",
        startTime: "09:00",
        endTime: "22:00",
        positionId: defaultPositionId,
      },
    ],
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

export const ShiftType: Story = {
  args: {
    periodLabel: "1/20(月)〜1/26(日)",
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    shopClosedDates: [],
    submissionPattern: shiftTypePattern,
    staffs: mockStaffs,
    positions: mockPositions,
    assignments: [
      {
        staffId: "staff1" as Id<"staffs">,
        date: "2026-01-20",
        startTime: "09:00",
        endTime: "15:00",
        positionId: defaultPositionId,
        optionId: "morning",
      },
      {
        staffId: "staff1" as Id<"staffs">,
        date: "2026-01-21",
        startTime: "15:00",
        endTime: "22:00",
        positionId: defaultPositionId,
        optionId: "late",
      },
      {
        staffId: "staff2" as Id<"staffs">,
        date: "2026-01-20",
        startTime: "15:00",
        endTime: "22:00",
        positionId: defaultPositionId,
        optionId: "late",
      },
    ],
    timeRange: { start: 9, end: 22, unit: 30 },
  },
};

// ==========================================
// ポジションと休憩（スタッフ向けの表示）
// ==========================================
const hallPositionId = "position-hall" as Id<"positions">;
const kitchenPositionId = "position-kitchen" as Id<"positions">;
const twoPositions = [
  { _id: hallPositionId, name: "ホール", color: "#3b82f6", isDefault: true },
  { _id: kitchenPositionId, name: "キッチン", color: "#c2410c", isDefault: false },
];
const HALL_RGB = "rgb(59, 130, 246)";
// ポジションを塗り分けない表示の、勤務のバーの色（teal.600）。
const DEFAULT_BAR_RGB = "rgb(13, 148, 136)";

const desktopGlobals = { viewport: { value: "desktop", isRotated: false } };

const withPositionsAndBreaksArgs = {
  ...Basic.args,
  positions: twoPositions,
  assignments: [
    {
      staffId: "staff1" as Id<"staffs">,
      date: "2026-01-20",
      startTime: "10:00",
      endTime: "18:00",
      positionId: hallPositionId,
      breaks: [{ startTime: "13:00", endTime: "14:00" }],
    },
    {
      staffId: "staff2" as Id<"staffs">,
      date: "2026-01-20",
      startTime: "14:00",
      endTime: "22:00",
      positionId: kitchenPositionId,
    },
    {
      staffId: "staff1" as Id<"staffs">,
      date: "2026-01-22",
      startTime: "12:00",
      endTime: "21:00",
      positionId: kitchenPositionId,
      breaks: [{ startTime: "16:00", endTime: "16:45" }],
    },
    {
      staffId: "staff3" as Id<"staffs">,
      date: "2026-01-23",
      startTime: "10:00",
      endTime: "18:00",
      positionId: hallPositionId,
    },
  ],
} satisfies Story["args"];

const singlePositionWithBreaksArgs = {
  ...Basic.args,
  assignments: mockAssignments.map((assignment) =>
    assignment.staffId === "staff1" && assignment.date === "2026-01-20"
      ? { ...assignment, breaks: [{ startTime: "13:00", endTime: "14:00" }] }
      : assignment,
  ),
} satisfies Story["args"];

/** ポジションが2つ以上ある店舗では、勤務をポジションの色で塗り、休憩をバーの内側に出す。 */
export const WithPositionsAndBreaks: Story = {
  name: "With Positions And Breaks",
  args: withPositionsAndBreaksArgs,
  globals: desktopGlobals,
};

/** ポジションが1つの店舗でも、休憩を入れた勤務があれば、休憩をバーの内側に出す。 */
export const SinglePositionWithBreaks: Story = {
  name: "Single Position With Breaks",
  args: singlePositionWithBreaksArgs,
  globals: desktopGlobals,
};

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

/** 管理者だけが使う操作と、管理者だけに見せる情報は、スタッフ向けの表示に出さない。 */
const expectNoManagerOnlyParts = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(canvas.queryByRole("radiogroup", { name: "表示の詳しさ" })).not.toBeInTheDocument();
  await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();
  await expect(canvas.queryByRole("region", { name: "人数" })).not.toBeInTheDocument();
  await expect(canvas.queryByText("責任者")).not.toBeInTheDocument();
  await expect(canvas.queryByText("新人")).not.toBeInTheDocument();
};

/** ポジションが2つ以上ある店舗では、ポジション名と休憩が見える。管理者向けの操作と情報は出ない。 */
export const WithPositionsAndBreaksInteractive: Story = {
  name: "With Positions And Breaks Interactive",
  args: withPositionsAndBreaksArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const row = await findRow(canvasElement, "staff1");
    await expect(getWorkBars(row).map((bar) => getComputedStyle(bar).backgroundColor)).toEqual([HALL_RGB]);
    await expect(getBreakBars(row)).toHaveLength(1);
    await expectNoManagerOnlyParts(canvasElement);

    // 色がどのポジションを表すかは、凡例で分かる。
    const legend = within(canvas.getByRole("list", { name: "ポジション" }));
    await expect(legend.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["ホール", "キッチン"]);

    // 日別表示では、勤務のバーを押すと、ポジション名と休憩の時刻が出る。編集の操作は出ない。
    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：13:00〜14:00")).toBeInTheDocument();
    // 凡例に加えて、開いた欄にその勤務のポジション名が出る。別のポジションの名前は凡例だけに出る。
    await expect(body.getAllByText("ホール")).toHaveLength(2);
    await expect(body.queryByText("休憩を変更")).not.toBeInTheDocument();
    await expect(body.getAllByText("キッチン")).toHaveLength(1);
    await expect(body.queryByLabelText("時間帯を削除")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByText("休憩：13:00〜14:00")).not.toBeInTheDocument());

    // 一覧表示では、勤務時間の下にポジション名、横に休憩の印が出る。
    await userEvent.click(await canvas.findByRole("tab", { name: "一覧" }));
    await expect(await canvas.findByLabelText("休憩 13:00〜14:00")).toBeInTheDocument();
    await expect(canvas.getByLabelText("休憩 16:00〜16:45")).toBeInTheDocument();
    // 凡例の1件と、勤務の2件。
    await expect(canvas.getAllByText("ホール")).toHaveLength(3);
    await expect(canvas.getAllByText("キッチン")).toHaveLength(3);
    await expectNoManagerOnlyParts(canvasElement);
  },
};

/** ポジションが1つで休憩のある店舗では、休憩だけが見える。ポジション名は出ない。 */
export const SinglePositionWithBreaksInteractive: Story = {
  name: "Single Position With Breaks Interactive",
  args: singlePositionWithBreaksArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const row = await findRow(canvasElement, "staff1");
    await expect(getWorkBars(row).map((bar) => getComputedStyle(bar).backgroundColor)).toEqual([DEFAULT_BAR_RGB]);
    await expect(getBreakBars(row)).toHaveLength(1);
    await expectNoManagerOnlyParts(canvasElement);

    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("休憩：13:00〜14:00")).toBeInTheDocument();
    await expect(body.queryByText("シフト")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByText("休憩：13:00〜14:00")).not.toBeInTheDocument());

    await userEvent.click(await canvas.findByRole("tab", { name: "一覧" }));
    await expect(await canvas.findByLabelText("休憩 13:00〜14:00")).toBeInTheDocument();
    await expect(canvas.queryByText("シフト")).not.toBeInTheDocument();
  },
};

/** ポジションが1つで休憩もない店舗では、従来の表示のまま、ポジション名も休憩の印も出ない。 */
export const BasicStaysSimpleInteractive: Story = {
  name: "Basic Stays Simple Interactive",
  args: Basic.args,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    const row = await findRow(canvasElement, "staff1");
    await expect(getWorkBars(row).map((bar) => getComputedStyle(bar).backgroundColor)).toEqual([DEFAULT_BAR_RGB]);
    await expect(getBreakBars(row)).toHaveLength(0);
    await expectNoManagerOnlyParts(canvasElement);

    // 勤務のバーを押すと出る欄は、勤務時間だけを出す。
    await userEvent.click(getWorkBars(row)[0]);
    await expect(await body.findByText("10:00〜18:00")).toBeInTheDocument();
    await expect(body.queryByText(/^休憩：/)).not.toBeInTheDocument();
    await expect(body.queryByText("シフト")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(body.queryByText("10:00〜18:00")).not.toBeInTheDocument());

    await userEvent.click(await canvas.findByRole("tab", { name: "一覧" }));
    await expect(await canvas.findByText("12:00–21:00")).toBeInTheDocument();
    await expect(canvas.queryByLabelText(/^休憩 /)).not.toBeInTheDocument();
    await expect(canvas.queryByText("シフト")).not.toBeInTheDocument();
  },
};
