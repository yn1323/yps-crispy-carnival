import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { createExportFixture } from "./fixtures";
import { ShiftExportPage } from "./index";
import { buildExportSchedule } from "./script";
import { ShiftExportView } from "./View";

const schedule = buildExportSchedule(createExportFixture());
const download = { generate: async () => {}, isGenerating: false, generatingFormat: null, download: null, error: null };
const meta = {
  title: "features/ShiftExport",
  component: ShiftExportView,
  parameters: { layout: "fullscreen" },
  args: { schedule, download, onSplitPeriodChange: () => {} },
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

const multiplePageTime = createExportFixture({ staffs: dateOnly.staffs.slice(0, 20) });
export const ToggleSplitPeriod: Story = {
  parameters: { screenshot: { skip: true } },
  render: () => <ShiftExportPage data={multiplePageTime} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const checkbox = canvas.getByRole("checkbox", { name: "期間を前半・後半に分ける" });
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
    await userEvent.click(canvas.getByRole("checkbox", { name: "期間を前半・後半に分ける" }));

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
      within(canvasElement).queryByRole("checkbox", { name: "期間を前半・後半に分ける" }),
    ).not.toBeInTheDocument();
  },
};

export const Generating: Story = {
  args: { download: { ...download, isGenerating: true, generatingFormat: "pdf" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const button of canvas.getAllByRole("button")) await expect(button).toBeDisabled();
    await expect(canvas.getByRole("checkbox", { name: "期間を前半・後半に分ける" })).toBeDisabled();
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
