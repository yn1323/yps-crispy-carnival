import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createDailyExportFixture, createExportFixture } from "./fixtures";
import { ShiftExportPage } from "./index";
import { buildExportSchedule } from "./script";
import { ShiftExportView } from "./View";

const schedule = buildExportSchedule(createExportFixture());
const download = { generate: async () => {}, isGenerating: false, generatingFormat: null, download: null, error: null };
const meta = {
  title: "features/ShiftExport",
  component: ShiftExportView,
  parameters: { layout: "fullscreen" },
  args: {
    schedule,
    download,
    onViewChange: () => {},
    onSplitPeriodChange: () => {},
    includeNotes: false,
    onIncludeNotesChange: () => {},
  },
} satisfies Meta<typeof ShiftExportView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Time31Days: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "2026/08/01~08/31 シフトリ駅前店" })).toBeVisible();
    await expect(canvas.getAllByRole("columnheader")).toHaveLength(32);
    await expect(canvas.getByRole("cell", { name: "09:00 17:00" })).toBeVisible();
    await expect(canvas.queryByRole("navigation")).not.toBeInTheDocument();
  },
};

export const Mobile31Days: Story = {
  ...Time31Days,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "PDF" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Excel" })).toBeVisible();
    const preview = canvas.getByRole("region", { name: "シフト表プレビュー" });
    await expect(preview.scrollWidth).toBeGreaterThan(preview.clientWidth);
  },
};

const dateOnly = createExportFixture();
dateOnly.recruitment.submissionPattern = { kind: "dateOnly" };
dateOnly.recruitment.periodEnd = "2026-08-07";
dateOnly.staffs = Array.from({ length: 60 }, (_, index) => ({
  id: `staff-${index}`,
  name: `スタッフ ${index + 1}`,
  isRemoved: false,
}));
export const DateOnlyMultiplePages: Story = {
  args: { schedule: buildExportSchedule(dateOnly) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("table")).toHaveLength(3);
    await expect(canvas.getAllByRole("rowheader")).toHaveLength(60);
    await expect(canvas.getByRole("cell", { name: "○" })).toBeVisible();
  },
};

const emptyTenDays = createExportFixture({
  staffs: dateOnly.staffs.slice(0, 50),
  assignments: [],
});
emptyTenDays.recruitment.periodEnd = "2026-08-10";
emptyTenDays.recruitment.shopClosedDates = ["2026-08-01"];
export const MobileEmptyTenDays: Story = {
  args: { schedule: buildExportSchedule(emptyTenDays) },
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

const shiftTypes = createExportFixture();
shiftTypes.staffs[0].name = "とても長いスタッフ名の表示を確認するための名前";
shiftTypes.recruitment.submissionPattern = {
  kind: "shiftType",
  options: [
    { id: "early", name: "開店準備を含む早番", startTime: "09:00", endTime: "13:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "17:00", endTime: "22:00", sortOrder: 1 },
  ],
};
shiftTypes.assignments = ["late", "early"].map((optionId) => ({ ...shiftTypes.assignments[0], optionId }));
export const LongShiftTypeNames: Story = { args: { schedule: buildExportSchedule(shiftTypes) } };

export const SplitShiftTypePeriod: Story = { args: { schedule: buildExportSchedule(shiftTypes, true) } };

export const MobileSplitShiftTypePeriod: Story = {
  ...SplitShiftTypePeriod,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
};

const splitTime = createExportFixture();
splitTime.assignments.push({ ...splitTime.assignments[0], startTime: "19:00", endTime: "22:00" });
export const SplitWorkingHours: Story = {
  args: { schedule: buildExportSchedule(splitTime) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("cell", { name: "09:00 17:00 19:00 22:00" })).toBeVisible();
    await expect(canvas.queryByText(/下書き|確定済み|通知状況/)).not.toBeInTheDocument();
  },
};

const multiplePageTime = createExportFixture({ staffs: dateOnly.staffs.slice(0, 20) });
export const ToggleSplitPeriod: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={multiplePageTime} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "一覧を分割して表示する" });
    await expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);

    await expect(checkbox).toBeChecked();
    await waitFor(() => expect(canvas.getAllByRole("table")).toHaveLength(4));
    const splitTables = canvas.getAllByRole("table");
    await expect(splitTables.map((table) => within(table).getAllByRole("columnheader").length)).toEqual([
      17, 17, 16, 16,
    ]);
    await expect(canvas.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "2026/08/01~08/16 シフトリ駅前店",
      "2026/08/17~08/31 シフトリ駅前店",
    ]);
    const staffNames = multiplePageTime.staffs.map(({ name }) => name);
    for (const periodTables of [splitTables.slice(0, 2), splitTables.slice(2)]) {
      await expect(
        periodTables.flatMap((table) =>
          within(table)
            .getAllByRole("rowheader")
            .map((header) => header.textContent),
        ),
      ).toEqual(staffNames);
    }

    await userEvent.click(checkbox);

    await expect(checkbox).not.toBeChecked();
    await waitFor(() => expect(canvas.getAllByRole("table")).toHaveLength(2));
    await expect(
      canvas.getAllByRole("table").map((table) => within(table).getAllByRole("columnheader").length),
    ).toEqual([32, 32]);
    await expect(canvas.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "2026/08/01~08/31 シフトリ駅前店",
    ]);
  },
};

const fifteenDayDateOnly = createExportFixture();
fifteenDayDateOnly.recruitment.periodEnd = "2026-08-15";
fifteenDayDateOnly.recruitment.submissionPattern = { kind: "dateOnly" };
export const SplitFifteenDayPeriod: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={fifteenDayDateOnly} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("checkbox", { name: "一覧を分割して表示する" }));

    await waitFor(() => expect(canvas.getAllByRole("table")).toHaveLength(2));
    await expect(
      canvas.getAllByRole("table").map((table) => within(table).getAllByRole("columnheader").length),
    ).toEqual([9, 8]);
    await expect(canvas.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "2026/08/01~08/08 シフトリ駅前店",
      "2026/08/09~08/15 シフトリ駅前店",
    ]);
  },
};

const fourteenDayPeriod = createExportFixture();
fourteenDayPeriod.recruitment.periodEnd = "2026-08-14";
export const FourteenDayPeriod: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={fourteenDayPeriod} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("checkbox", { name: "一覧を分割して表示する" }),
    ).not.toBeInTheDocument();
  },
};

export const Generating: Story = {
  args: { download: { ...download, isGenerating: true, generatingFormat: "pdf" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const button of canvas.getAllByRole("button")) await expect(button).toBeDisabled();
    await expect(canvas.getByRole("checkbox", { name: "一覧を分割して表示する" })).toBeDisabled();
  },
};

let requestedFormat: "pdf" | "xlsx" | null = null;
export const RetryAfterFailure: Story = {
  parameters: { screenshot: { skip: true } },
  beforeEach: () => {
    requestedFormat = null;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const button = canvas.getByRole("button", { name: "PDF" });
    await expect(canvas.getByRole("alert")).toHaveTextContent("もう一度お試しください");
    await userEvent.click(button);
    await expect(requestedFormat).toBe("pdf");
  },
  args: {
    download: {
      ...download,
      generate: async (format) => {
        requestedFormat = format;
      },
      error: "ファイルを作成できませんでした。もう一度お試しください。",
    },
  },
};

export const SaveLink: Story = {
  args: {
    download: {
      ...download,
      download: { schedule, url: "blob:story-export", fileName: "シフト表.pdf", format: "pdf" },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "ここ" })).toHaveAttribute("download", "シフト表.pdf");
  },
};

const withNotes = createExportFixture({
  dateNotes: [
    { staffId: "staff-1", date: "2026-08-03", note: "17時以降なら入れます" },
    {
      staffId: "staff-2",
      date: "2026-08-03",
      note: "火曜は授業が16時半に終わるので17時以降なら入れます。ゼミの発表準備があるため、できれば遅番だけにしてもらえると助かります。",
    },
    { staffId: "staff-2", date: "2026-08-01", note: "テスト期間のため休みたいです" },
  ],
});
export const NotesList: Story = {
  args: { schedule: buildExportSchedule(withNotes, false, true), includeNotes: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("checkbox", { name: "連絡事項も出力する" })).toBeChecked();
    await expect(canvas.getByRole("heading", { name: "2026/08/01~08/31 シフトリ駅前店 連絡事項" })).toBeVisible();
    const notesTable = canvas.getByRole("table", { name: "連絡事項" });
    await expect(
      within(notesTable)
        .getAllByRole("rowheader")
        .map((header) => header.textContent),
    ).toEqual(["田中 花子", "田中 花子", "鈴木 太郎"]);
    await expect(within(notesTable).getByText("17時以降なら入れます")).toHaveAttribute("data-clarity-mask", "true");
    await expect(canvas.getByText("2 / 2")).toBeInTheDocument();
  },
};

export const ToggleNotesList: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={withNotes} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "連絡事項も出力する" });
    await expect(checkbox).not.toBeChecked();
    await expect(canvas.queryByRole("table", { name: "連絡事項" })).not.toBeInTheDocument();

    await userEvent.click(checkbox);
    await waitFor(() => expect(canvas.getByRole("table", { name: "連絡事項" })).toBeVisible());

    await userEvent.click(checkbox);
    await waitFor(() => expect(canvas.queryByRole("table", { name: "連絡事項" })).not.toBeInTheDocument());
  },
};

export const WithoutNotesHidesNotesOption: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={createExportFixture()} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("checkbox", { name: "連絡事項も出力する" })).not.toBeInTheDocument();
  },
};

const dailyData = createDailyExportFixture({
  dateNotes: [{ staffId: "staff-1", date: "2026-08-01", note: "17時以降なら入れます" }],
});

export const DailyBars: Story = {
  args: { schedule: buildExportSchedule(dailyData, false, false, "daily") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "日別" })).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "一覧" })).toHaveAttribute("aria-pressed", "false");
    await expect(canvas.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "2026/08/01(土) シフトリ駅前店",
      "2026/08/03(月) シフトリ駅前店",
    ]);
    await expect(canvas.getByText("出勤 5人")).toBeVisible();
    await expect(canvas.getByText("出勤 1人")).toBeVisible();
    const [firstDay] = canvas.getAllByRole("table", { name: "勤務" });
    const rowHeaders = within(firstDay).getAllByRole("rowheader");
    // 勤務のある5人のあとは、書き込み用の空行にする。
    await expect(rowHeaders.slice(0, 6).map((header) => header.textContent)).toEqual([
      "佐藤 一郎",
      "鈴木 太郎",
      "高橋 美咲",
      "田中 花子",
      "伊藤 健",
      "",
    ]);
    const takahashi = within(firstDay).getByRole("row", { name: /高橋 美咲/ });
    await expect(
      within(takahashi)
        .getAllByRole("img")
        .map((segment) => segment.getAttribute("aria-label")),
    ).toEqual(["ホール 11:00-14:00", "キッチン 14:00-16:00", "休憩 16:00-16:30", "キッチン 16:30-20:00"]);
    await expect(within(takahashi).getByRole("img", { name: "休憩 16:00-16:30" })).toHaveTextContent("休");
    // バーは、ポジションの色を薄めた地に黒い文字にする。
    await expect(within(takahashi).getByRole("img", { name: "ホール 11:00-14:00" })).toHaveStyle({
      backgroundColor: "rgb(191, 219, 253)",
      color: "rgb(17, 17, 17)",
    });
    const [counts] = canvas.getAllByRole("table", { name: "時間ごとの人数" });
    await expect(
      within(counts)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual(["ホール12101", "キッチン1012121"]);
    // 日別では、期間を分ける項目とExcelを出さない。
    await expect(canvas.queryByRole("button", { name: "Excel" })).not.toBeInTheDocument();
    await expect(canvas.getAllByRole("checkbox")).toHaveLength(1);
    await expect(canvas.getByRole("checkbox", { name: "連絡事項も出力する" })).toBeVisible();
  },
};

export const MobileDailyBars: Story = {
  ...DailyBars,
  tags: ["vrt-mobile1"],
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "日別" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "PDF" })).toBeVisible();
    const preview = canvas.getByRole("region", { name: "シフト表プレビュー" });
    await expect(preview.scrollWidth).toBeGreaterThan(preview.clientWidth);
  },
};

export const ToggleView: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={dailyData} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const overview = canvas.getByRole("button", { name: "一覧" });
    const daily = canvas.getByRole("button", { name: "日別" });
    await expect(overview).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("table", { name: "シフト表" })).toBeVisible();
    // 一覧には勤務の開始と終了だけを出す。ポジションと休憩は日別のバーで出す。
    await expect(canvas.getByTitle("11:00 20:00")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Excel" })).toBeVisible();
    await userEvent.click(canvas.getByRole("checkbox", { name: "連絡事項も出力する" }));

    await userEvent.click(daily);

    await expect(daily).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(canvas.getAllByRole("table", { name: "勤務" })).toHaveLength(2));
    await expect(canvas.queryByRole("table", { name: "シフト表" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Excel" })).not.toBeInTheDocument();
    // 連絡事項は、形を切り替えても選んだままにし、日別のページの後ろに付ける。
    await expect(canvas.getByRole("checkbox", { name: "連絡事項も出力する" })).toBeChecked();
    await expect(canvas.getByRole("table", { name: "連絡事項" })).toBeVisible();
    await expect(canvas.getByText("3 / 3")).toBeInTheDocument();

    await userEvent.click(overview);

    await waitFor(() => expect(canvas.getByRole("table", { name: "シフト表" })).toBeVisible());
    await expect(canvas.queryByRole("table", { name: "勤務" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Excel" })).toBeVisible();
  },
};

const dateOnlyWithPositions = createExportFixture({
  positions: [
    { id: "hall", name: "ホール", color: "#3b82f6" },
    { id: "kitchen", name: "キッチン", color: "#f97316" },
  ],
  isDetailMode: true,
});
dateOnlyWithPositions.recruitment.submissionPattern = { kind: "dateOnly" };
dateOnlyWithPositions.recruitment.periodEnd = "2026-08-07";
dateOnlyWithPositions.assignments = [
  { ...dateOnlyWithPositions.assignments[0], date: "2026-08-01", positionId: "hall" },
  { ...dateOnlyWithPositions.assignments[0], date: "2026-08-03", positionId: "kitchen" },
  { ...dateOnlyWithPositions.assignments[0], staffId: "staff-1", date: "2026-08-04", positionId: "hall" },
];

/** くわしく表示でポジションが2つ以上ある日付選択の募集は、「ポジション」を選ぶと、○の代わりにポジション名を出す。 */
export const DateOnlyPositions: Story = {
  args: { schedule: buildExportSchedule(dateOnlyWithPositions, false, false, "positions") },
};

/**
 * ポジションが2つ以上ある日付選択の募集では、「一覧」と「ポジション」を切り替えられる。
 * 日別と違い、「ポジション」でもExcelを出力できる。
 */
export const DateOnlyToggleView: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={dateOnlyWithPositions} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = await canvas.findByRole("group", { name: "出力する形" });
    await expect(
      within(group)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["一覧", "ポジション"]);
    await expect(canvas.queryByRole("cell", { name: "キッチン" })).not.toBeInTheDocument();

    await userEvent.click(within(group).getByRole("button", { name: "ポジション" }));

    await expect(within(group).getByRole("button", { name: "ポジション" })).toHaveAttribute("aria-pressed", "true");
    await expect(await canvas.findByRole("cell", { name: "キッチン" })).toBeVisible();
    await expect(canvas.queryByRole("cell", { name: "○" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Excel" })).toBeVisible();
  },
};

/** シンプル表示か、ポジションが1つ以下の日付選択の募集は、○だけなので、形の切り替えを出さない。 */
export const DateOnlyHidesViewToggle: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={dateOnly} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("group", { name: "出力する形" })).not.toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "PDF" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Excel" })).toBeVisible();
  },
};

export const DailyWithoutWork: Story = {
  args: { schedule: buildExportSchedule(createExportFixture({ assignments: [] }), false, false, "daily") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("勤務が入っている日がありません")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "PDF" })).toBeDisabled();
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
  },
};
