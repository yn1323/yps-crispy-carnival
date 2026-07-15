import type { Meta, StoryObj } from "@storybook/react-vite";
import dayjs from "dayjs";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { StepperDialog } from "@/src/components/ui/StepperDialog";
import { CreateRecruitmentForm } from "./index.tsx";

const meta = {
  title: "Features/CreateRecruitmentForm",
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

const STORY_TODAY = "2026-05-01";
const LONG_WEEKDAYS = ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"] as const;
const storyToday = () => dayjs(STORY_TODAY);

const DoubleSubmitGuardHarness = () => {
  const [submitCount, setSubmitCount] = useState(0);

  return (
    <>
      <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
        <CreateRecruitmentForm
          today={STORY_TODAY}
          onSubmit={async () => {
            setSubmitCount((current) => current + 1);
            await delay(100);
          }}
          onCancel={() => {}}
        />
      </StepperDialog>
      <output data-testid="submit-call-count">{submitCount}</output>
    </>
  );
};

export const InDialog: Story = {
  render: () => (
    <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <CreateRecruitmentForm today={STORY_TODAY} onSubmit={() => {}} onCancel={() => {}} />
    </StepperDialog>
  ),
};

export const MobileFullScreen: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  render: () => (
    <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <CreateRecruitmentForm today={STORY_TODAY} onSubmit={() => {}} onCancel={() => {}} />
    </StepperDialog>
  ),
};

export const InteractiveBasicFlow: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const today = storyToday();
    const periodStart = today.add(3, "day");
    const periodEnd = today.add(5, "day");
    const deadline = periodStart.subtract(1, "day");

    expectDateDisabled(root, today, "期間カレンダーで今日以前は選択不可");
    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("お店のお休みを選択");
    await clickButton(root, "次へ");

    await canvas.findByText("提出締切日を選択");
    await clickDate(root, deadline);
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("お店のお休み")).toBeTruthy();
    expect(canvas.getByText("なし")).toBeTruthy();
    expect(canvas.getAllByText("提出締切").length).toBeGreaterThan(0);
    expect(canvas.getByText("通知")).toBeTruthy();
    expect(await canvas.findByText("スタッフにシフト提出案内を送ります")).toBeTruthy();
  },
};

export const InteractiveHolidayEdgeCases: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = storyToday().add(3, "day");
    const holidays = [0, 1, 2, 3, 4].map((offset) => periodStart.add(offset, "day"));
    const periodEnd = holidays.at(-1);
    if (!periodEnd) throw new Error("テスト用の期間終了日を作成できませんでした");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("お店のお休みを選択");
    for (const holiday of holidays) {
      await clickDate(root, holiday);
    }
    await clickButton(root, "次へ");

    await canvas.findByText("シフト期間のすべてをお休みにはできません");
    await clickDate(root, periodEnd, false);
    await clickButton(root, "次へ");

    await canvas.findByText("提出締切日を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("4日")).toBeTruthy();
    expect(await canvas.findByText(/ほか1日/)).toBeTruthy();
  },
};

export const InteractiveDefaultRegularClosedDays: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => (
    <StepperDialog title="新しい募集をつくる" isOpen={true} onOpenChange={() => {}} onClose={() => {}}>
      <CreateRecruitmentForm today={STORY_TODAY} regularClosedDays={["mon"]} onSubmit={() => {}} onCancel={() => {}} />
    </StepperDialog>
  ),
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = nextWeekday(storyToday().add(3, "day"), 1);
    const periodEnd = periodStart.add(2, "day");
    const deadline = periodStart.subtract(1, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("お店のお休みを選択");
    await clickButton(root, "次へ");

    await canvas.findByText("提出締切日を選択");
    await clickDate(root, deadline);
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("1日")).toBeTruthy();
    expect(await canvas.findByText(formatDatePreview(periodStart))).toBeTruthy();
  },
};

export const InteractiveDeadlineRestriction: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = storyToday().add(5, "day");
    const periodEnd = storyToday().add(7, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("お店のお休みを選択");
    await clickButton(root, "次へ");

    await canvas.findByText("提出締切日を選択");
    expectDateDisabled(root, periodStart, "提出期限カレンダーで開始日当日は選択不可");
    await clickButton(root, "確認へ");
    await canvas.findByText("提出締切日を選択してください");

    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");
    await canvas.findByText("内容を確認");
  },
};

export const InteractiveNextMonthOnlyFlow: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: InDialog.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const nextMonth = storyToday().add(1, "month").startOf("month");
    const followingMonth = nextMonth.add(1, "month");
    const periodStart = nextMonth.add(14, "day");
    const periodEnd = nextMonth.add(24, "day");
    const deadline = periodStart.subtract(1, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("お店のお休みを選択");
    expect(root.textContent).toContain(nextMonth.format("YYYY年M月"));
    expect(root.textContent).not.toContain(followingMonth.format("YYYY年M月"));
    await clickButton(root, "次へ");

    await canvas.findByText("提出締切日を選択");
    await clickDate(root, deadline);
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("なし")).toBeTruthy();
    expect(await canvas.findByText(formatDateRangePreview(periodStart, periodEnd))).toBeTruthy();
    expect(await canvas.findByText(formatDeadlinePreview(deadline))).toBeTruthy();
  },
};

export const InteractiveMobileBasicFlow: Story = {
  tags: ["vrt-mobile1"],
  globals: {
    viewport: { value: "mobile1", isRotated: false },
  },
  parameters: {
    screenshot: { skip: true },
  },
  render: MobileFullScreen.render,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const periodStart = storyToday().add(2, "day");
    const periodEnd = storyToday().add(4, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("お店のお休みを選択");
    await clickButton(root, "次へ");

    await canvas.findByText("提出締切日を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    expect(canvas.getByText("なし")).toBeTruthy();
  },
};

export const InteractiveDoubleSubmitGuard: Story = {
  parameters: {
    screenshot: { skip: true },
  },
  render: () => <DoubleSubmitGuardHarness />,
  play: async ({ canvasElement }) => {
    const root = await getTestRoot(canvasElement);
    const canvas = within(root);
    const story = within(canvasElement);
    const periodStart = storyToday().add(2, "day");
    const periodEnd = storyToday().add(4, "day");

    await clickDate(root, periodStart);
    await clickDate(root, periodEnd);
    await clickButton(root, "次へ");

    await canvas.findByText("お店のお休みを選択");
    await clickButton(root, "次へ");

    await canvas.findByText("提出締切日を選択");
    await clickDate(root, periodStart.subtract(1, "day"));
    await clickButton(root, "確認へ");

    await canvas.findByText("内容を確認");
    const submitButton = canvas.getByRole("button", { name: "募集をつくる" });
    await userEvent.dblClick(submitButton);

    await waitFor(() => expect(story.getByTestId("submit-call-count")).toHaveTextContent("1"));
  },
};

async function getTestRoot(canvasElement: HTMLElement): Promise<HTMLElement> {
  return within(canvasElement.ownerDocument.body).findByRole("dialog");
}

function getDateButton(root: HTMLElement, date: dayjs.Dayjs): HTMLButtonElement {
  const iso = date.format("YYYY-MM-DD");
  const day = date.format("D");
  const monthLabel = date.format("YYYY年M月");
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-part="table-cell-trigger"]')).filter(
    (button) => button.textContent?.trim() === day,
  );

  const ariaMatch = buttons.find((button) => button.getAttribute("aria-label") === `Choose ${formatAriaDate(date)}`);
  if (ariaMatch) return ariaMatch;

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

async function clickDate(root: HTMLElement, date: dayjs.Dayjs, selected = true) {
  await ensureMonthVisible(root, date);
  const button = getDateButton(root, date);
  expect(isDateDisabled(button), `${date.format("YYYY-MM-DD")} は選択可能であること`).toBe(false);
  await userEvent.click(button);
  await waitFor(() => expect(button.hasAttribute("data-selected")).toBe(selected));
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
    const previousCalendarText = root.textContent;
    await userEvent.click(nextButton);
    await waitFor(() => expect(root.textContent).not.toBe(previousCalendarText));
  }
  throw new Error(`${monthLabel} がカレンダーに表示されませんでした`);
}

async function clickButton(root: HTMLElement, text: string) {
  const button = within(root).getByRole("button", { name: text });
  expect(button).toBeTruthy();
  await userEvent.click(button);
}

function formatDateRangePreview(start: dayjs.Dayjs, end: dayjs.Dayjs): string {
  return `${formatDatePreview(start)} 〜 ${formatDatePreview(end)}`;
}

function formatDatePreview(date: dayjs.Dayjs): string {
  return `${date.format("M/D")}(${getWeekdayLabel(date)})`;
}

function formatDeadlinePreview(date: dayjs.Dayjs): string {
  return `${formatDatePreview(date)} 23:59`;
}

function getWeekdayLabel(date: dayjs.Dayjs): string {
  return ["日", "月", "火", "水", "木", "金", "土"][date.day()] ?? "";
}

function formatAriaDate(date: dayjs.Dayjs): string {
  return `${date.year()}年${date.month() + 1}月${date.date()}日${LONG_WEEKDAYS[date.day()]}`;
}

function nextWeekday(from: dayjs.Dayjs, weekday: number): dayjs.Dayjs {
  const offset = (weekday - from.day() + 7) % 7;
  return from.add(offset, "day");
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
