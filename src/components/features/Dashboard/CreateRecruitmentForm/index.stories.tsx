import type { Meta, StoryObj } from "@storybook/react-vite";
import { findByText, getByRole, getByText } from "@testing-library/dom";
import dayjs from "dayjs";
import { expect } from "storybook/test";
import { Dialog } from "@/src/components/ui/Dialog";
import { CreateRecruitmentForm } from "./index.tsx";

const meta = {
  title: "Features/Dashboard/CreateRecruitmentForm",
  component: CreateRecruitmentForm,
  parameters: {
    layout: "padded",
  },
  args: {
    onSubmit: () => {},
  },
} satisfies Meta<typeof CreateRecruitmentForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InDialog: Story = {
  render: () => (
    <Dialog
      title="新しい募集をつくる"
      isOpen={true}
      onOpenChange={() => {}}
      onClose={() => {}}
      hideFooter
      maxW={{ base: "100vw", md: "760px" }}
      maxH={{ base: "100dvh", md: "90dvh" }}
      contentProps={{
        h: { base: "100dvh", md: "auto" },
        borderRadius: { base: 0, md: "l3" },
        my: { base: 0, md: "var(--dialog-base-margin)" },
      }}
      bodyProps={{ p: 0, display: "flex", flexDirection: "column", overflowY: "hidden" }}
    >
      <CreateRecruitmentForm onSubmit={() => {}} onCancel={() => {}} />
    </Dialog>
  ),
};

export const MobileFullScreen: Story = {
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => (
    <Dialog
      title="新しい募集をつくる"
      isOpen={true}
      onOpenChange={() => {}}
      onClose={() => {}}
      hideFooter
      maxW="100vw"
      maxH="100dvh"
      contentProps={{ h: "100dvh", borderRadius: 0, my: 0 }}
      bodyProps={{ p: 0, display: "flex", flexDirection: "column", overflowY: "hidden" }}
    >
      <CreateRecruitmentForm onSubmit={() => {}} onCancel={() => {}} />
    </Dialog>
  ),
};

export const InteractiveBasicFlow: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = getTestRoot(canvasElement);
    const periodStart = dayjs().add(3, "day");
    const periodEnd = dayjs().add(5, "day");
    const deadline = periodStart.subtract(1, "day");

    expectDateDisabled(root, dayjs(), "期間カレンダーで今日以前は選択不可");
    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    clickButton(root, "次へ");

    await findByText(root, "お店のお休みを選択");
    clickButton(root, "次へ");

    await findByText(root, "提出締切日を選択");
    await clickDate(root, deadline);
    clickButton(root, "確認へ");

    await findByText(root, "内容を確認");
    expect(getByText(root, "お店のお休み")).toBeTruthy();
    expect(getByText(root, "なし")).toBeTruthy();
    expect(getByText(root, "提出締切")).toBeTruthy();
  },
};

export const InteractiveHolidayEdgeCases: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = getTestRoot(canvasElement);
    const periodStart = dayjs().add(3, "day");
    const holidays = [0, 1, 2, 3, 4].map((offset) => periodStart.add(offset, "day"));
    const periodEnd = holidays.at(-1);
    if (!periodEnd) throw new Error("テスト用の期間終了日を作成できませんでした");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    clickButton(root, "次へ");

    await findByText(root, "お店のお休みを選択");
    for (const holiday of holidays) {
      await clickDate(root, holiday);
    }
    clickButton(root, "次へ");

    await findByText(root, "シフト期間のすべてをお休みにはできません");
    await clickDate(root, periodEnd);
    clickButton(root, "次へ");

    await findByText(root, "提出締切日を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    clickButton(root, "確認へ");

    await findByText(root, "内容を確認");
    expect(getByText(root, "4日")).toBeTruthy();
    expect(await findByText(root, /ほか1日/)).toBeTruthy();
  },
};

export const InteractiveDeadlineRestriction: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = getTestRoot(canvasElement);
    const periodStart = dayjs().add(5, "day");
    const periodEnd = dayjs().add(7, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    clickButton(root, "次へ");

    await findByText(root, "お店のお休みを選択");
    clickButton(root, "次へ");

    await findByText(root, "提出締切日を選択");
    expectDateDisabled(root, periodStart, "提出期限カレンダーで開始日当日は選択不可");
    clickButton(root, "確認へ");
    await findByText(root, "提出締切日を選択してください");

    await clickDate(root, periodStart.subtract(1, "day"));
    clickButton(root, "確認へ");
    await findByText(root, "内容を確認");
  },
};

export const InteractiveNextMonthOnlyFlow: Story = {
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = getTestRoot(canvasElement);
    const nextMonth = dayjs().add(1, "month").startOf("month");
    const followingMonth = nextMonth.add(1, "month");
    const periodStart = nextMonth.add(14, "day");
    const periodEnd = nextMonth.add(24, "day");
    const deadline = periodStart.subtract(1, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    clickButton(root, "次へ");

    await findByText(root, "お店のお休みを選択");
    expect(root.textContent).toContain(nextMonth.format("YYYY年M月"));
    expect(root.textContent).not.toContain(followingMonth.format("YYYY年M月"));
    clickButton(root, "次へ");

    await findByText(root, "提出締切日を選択");
    expectDateDisabled(root, periodStart, "提出期限カレンダーで開始日当日は選択不可");
    await clickDate(root, deadline);
    clickButton(root, "確認へ");

    await findByText(root, "内容を確認");
    expect(getByText(root, "なし")).toBeTruthy();
    expect(await findByText(root, formatDateRangePreview(periodStart, periodEnd))).toBeTruthy();
    expect(await findByText(root, formatDatePreview(deadline))).toBeTruthy();
  },
};

export const InteractiveMobileBasicFlow: Story = {
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  parameters: {
    chromatic: { disableSnapshot: true },
  },
  render: MobileFullScreen.render,
  play: async ({ canvasElement }) => {
    const root = getTestRoot(canvasElement);
    const periodStart = dayjs().add(2, "day");
    const periodEnd = dayjs().add(4, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    clickButton(root, "次へ");

    await findByText(root, "お店のお休みを選択");
    clickButton(root, "次へ");

    await findByText(root, "提出締切日を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    clickButton(root, "確認へ");

    await findByText(root, "内容を確認");
    expect(getByText(root, "なし")).toBeTruthy();
  },
};

function getTestRoot(canvasElement: HTMLElement): HTMLElement {
  return (document.querySelector('[role="dialog"]') as HTMLElement | null) ?? canvasElement;
}

function getDateButton(root: HTMLElement, date: dayjs.Dayjs): HTMLButtonElement {
  const iso = date.format("YYYY-MM-DD");
  const day = date.format("D");
  const monthLabel = date.format("YYYY年M月");
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-part="table-cell-trigger"]')).filter(
    (button) => button.textContent?.trim() === day,
  );

  const exactMatch = buttons.find((button) =>
    Array.from(button.attributes).some((attribute) => attribute.value.includes(iso)),
  );
  if (exactMatch) return exactMatch;

  const monthMatch = buttons.find((button) =>
    button.closest("table")?.parentElement?.textContent?.includes(monthLabel),
  );
  if (monthMatch) return monthMatch;

  if (buttons.length === 1) return buttons[0];
  expect(buttons, `${iso} の日付ボタン候補`).not.toHaveLength(0);
  throw new Error(`${iso} の日付ボタンが見つかりませんでした`);
}

async function clickDate(root: HTMLElement, date: dayjs.Dayjs) {
  await ensureMonthVisible(root, date);
  const button = getDateButton(root, date);
  expect(isDateDisabled(button), `${date.format("YYYY-MM-DD")} は選択可能であること`).toBe(false);
  button.click();
  await nextFrame();
}

function expectDateDisabled(root: HTMLElement, date: dayjs.Dayjs, context: string) {
  const button = getDateButton(root, date);
  expect(isDateDisabled(button), `${context}: ${date.format("YYYY-MM-DD")}`).toBe(true);
}

function isDateDisabled(button: HTMLButtonElement): boolean {
  return (
    button.disabled ||
    button.getAttribute("aria-disabled") === "true" ||
    button.hasAttribute("data-disabled") ||
    !!button.closest("[data-disabled]")
  );
}

async function ensureMonthVisible(root: HTMLElement, date: dayjs.Dayjs) {
  const monthLabel = date.format("YYYY年M月");
  for (let i = 0; i < 3; i += 1) {
    if (root.textContent?.includes(monthLabel)) return;
    const nextButton = root.querySelector<HTMLButtonElement>('[data-part="next-trigger"]');
    if (!nextButton || isDateDisabled(nextButton)) break;
    nextButton.click();
    await nextFrame();
  }
  throw new Error(`${monthLabel} がカレンダーに表示されませんでした`);
}

function clickButton(root: HTMLElement, text: string) {
  const button = getByRole(root, "button", { name: text });
  expect(button).toBeTruthy();
  button.click();
}

function formatDateRangePreview(start: dayjs.Dayjs, end: dayjs.Dayjs): string {
  return `${formatDatePreview(start)} 〜 ${formatDatePreview(end)}`;
}

function formatDatePreview(date: dayjs.Dayjs): string {
  return `${date.format("M/D")}(${getWeekdayLabel(date)})`;
}

function getWeekdayLabel(date: dayjs.Dayjs): string {
  return ["日", "月", "火", "水", "木", "金", "土"][date.day()] ?? "";
}

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
