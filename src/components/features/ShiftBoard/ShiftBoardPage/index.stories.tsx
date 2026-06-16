import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftBoardData } from "../types";
import { ShiftBoardPage } from "./index";

const mockData: ShiftBoardData = {
  shopId: "shop-1" as Id<"shops">,
  recruitment: {
    _id: "recruitment-1" as Id<"recruitments">,
    periodStart: "2026-01-20",
    periodEnd: "2026-01-26",
    deadline: "2026-01-17",
    shopClosedDates: [],
    status: "open",
    confirmedAt: null,
    reminderScheduledAt: Date.UTC(2099, 0, 16, 8),
    lastReminderSentAt: null,
    draftSavedAt: null,
  },
  submissionPattern: { kind: "time", startTime: "09:00", endTime: "22:00" },
  staffs: [
    { _id: "s1" as Id<"staffs">, name: "鈴木太郎", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s2" as Id<"staffs">, name: "佐藤花子", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s3" as Id<"staffs">, name: "田中次郎", isSubmitted: false, wasSubmittedAtDraft: false },
    { _id: "s4" as Id<"staffs">, name: "山田美咲", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s5" as Id<"staffs">, name: "高橋翔太", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s6" as Id<"staffs">, name: "渡辺優子", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s7" as Id<"staffs">, name: "伊藤健一", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s8" as Id<"staffs">, name: "中村真理", isSubmitted: true, wasSubmittedAtDraft: false },
    { _id: "s9" as Id<"staffs">, name: "小林大輔", isSubmitted: false, wasSubmittedAtDraft: false },
    { _id: "s10" as Id<"staffs">, name: "加藤美穂", isSubmitted: true, wasSubmittedAtDraft: false },
  ],
  requestedSlots: [
    { staffId: "s1" as Id<"staffs">, date: "2026-01-20", startTime: "09:00", endTime: "14:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-20", startTime: "15:00", endTime: "21:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "18:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-22", startTime: "10:00", endTime: "18:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "14:00" },
    { staffId: "s1" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "18:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-21", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-22", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-24", startTime: "11:00", endTime: "19:00" },
    { staffId: "s2" as Id<"staffs">, date: "2026-01-26", startTime: "11:00", endTime: "19:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-20", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-22", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-23", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-24", startTime: "14:00", endTime: "21:00" },
    { staffId: "s4" as Id<"staffs">, date: "2026-01-26", startTime: "14:00", endTime: "21:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "15:00" },
    { staffId: "s5" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "15:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-20", startTime: "09:00", endTime: "17:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-22", startTime: "09:00", endTime: "17:00" },
    { staffId: "s6" as Id<"staffs">, date: "2026-01-24", startTime: "09:00", endTime: "17:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-21", startTime: "12:00", endTime: "20:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-23", startTime: "12:00", endTime: "20:00" },
    { staffId: "s7" as Id<"staffs">, date: "2026-01-25", startTime: "12:00", endTime: "20:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-20", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-21", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-22", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-23", startTime: "10:00", endTime: "16:00" },
    { staffId: "s8" as Id<"staffs">, date: "2026-01-24", startTime: "10:00", endTime: "16:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-20", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-22", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-24", startTime: "11:00", endTime: "18:00" },
    { staffId: "s10" as Id<"staffs">, date: "2026-01-26", startTime: "11:00", endTime: "18:00" },
  ],
  requestedDates: [],
  shiftAssignments: [],
  positions: [{ _id: "position-1" as Id<"positions">, name: "シフト", color: "#3b82f6", isDefault: true }],
  timeRange: { start: 9, end: 22, unit: 30 },
};

const meta = {
  title: "Features/ShiftBoard/ShiftBoardPage",
  component: ShiftBoardPage,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    data: mockData,
    recruitmentId: "recruitment-1" as Id<"recruitments">,
  },
} satisfies Meta<typeof ShiftBoardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

const waitForElement = async <T extends Element>(find: () => T | null, message: string, timeout = 2000): Promise<T> => {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeout) {
    const element = find();
    if (element) return element;
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  throw new Error(message);
};

const clickButtonByText = async (root: ParentNode, text: string) => {
  const button = await waitForElement(
    () =>
      Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]')).find(
        (candidate) => candidate.textContent?.includes(text) && isElementVisible(candidate),
      ) ?? null,
    `${text} ボタンが見つかりませんでした`,
  );
  button.click();
  return button;
};

const isElementVisible = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const getPointBlockingElement = (element: Element) => {
  const rect = element.getBoundingClientRect();
  const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  return !target || (!element.contains(target) && !target.contains(element)) ? target : null;
};

const waitForPointToHitElement = async (element: Element, label: string) => {
  await waitForElement(
    () => (getPointBlockingElement(element) ? null : element),
    `${label} が別のレイヤーに覆われています: ${describeElement(getPointBlockingElement(element))}`,
  );
};

const describeElement = (element: Element | null) => {
  if (!element) return "elementFromPoint=null";
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = element.className ? `.${String(element.className).replace(/\s+/g, ".")}` : "";
  const scope = element.getAttribute("data-scope");
  const part = element.getAttribute("data-part");
  const attrs = [scope ? `data-scope=${scope}` : "", part ? `data-part=${part}` : ""].filter(Boolean).join(" ");
  return `${tag}${id}${classes}${attrs ? ` ${attrs}` : ""}`;
};

export const PC: Story = {};

export const SP: Story = {
  tags: ["vrt-mobile2"],
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
  play: async ({ canvasElement }) => {
    await clickButtonByText(canvasElement, "鈴木太郎");

    await waitForElement(() => document.querySelector('[role="dialog"]'), "スタッフのシフトDialogが開きませんでした");

    const closeButton = await waitForElement(
      () => document.querySelector<HTMLButtonElement>('button[aria-label="閉じる"]'),
      "Dialogの閉じるボタンが見つかりませんでした",
    );
    closeButton.click();

    const overviewTab = await waitForElement(
      () =>
        Array.from(canvasElement.querySelectorAll<HTMLElement>('[role="tab"]')).find(
          (candidate) => candidate.textContent?.includes("一覧") && isElementVisible(candidate),
        ) ?? null,
      "一覧タブが見つかりませんでした",
    );
    await waitForElement(
      () => (document.querySelector('[role="dialog"]') ? null : overviewTab),
      "Dialogが閉じませんでした",
    );
    if (document.body.style.pointerEvents === "none") {
      throw new Error("Dialogを閉じた後も body に pointer-events: none が残っています");
    }

    await waitForPointToHitElement(overviewTab, "Dialogを閉じた後の一覧タブ");
    overviewTab.click();
    await waitForElement(
      () => (overviewTab.getAttribute("aria-selected") === "true" ? overviewTab : null),
      "Dialogを閉じた後に一覧タブを選択できませんでした",
    );
  },
};

export const Confirmed: Story = {
  args: {
    data: {
      ...mockData,
      recruitment: {
        ...mockData.recruitment,
        status: "confirmed",
        confirmedAt: new Date("2026-03-28T23:15:00").getTime(),
      },
    },
  },
};
