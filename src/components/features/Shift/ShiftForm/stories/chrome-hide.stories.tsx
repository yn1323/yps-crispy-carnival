import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import type { StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "..";
import { dateOnlyBoardDetailArgs } from "./dateOnlyBoardFixtures";
import {
  allPatternsArgs,
  dateOnlyArgs,
  desktopGlobals,
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
  shiftTypeArgs,
} from "./shared";
import { shiftTypeBoardDetailArgs } from "./shiftTypeBoardFixtures";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// 内側の入れ物を下へスクロールすると上の行を隠し、上端まで戻しきったときに表示する動きを確かめる。
// 入れ物が画面より十分に長くなるよう、スタッフを30人にする。
// 提出済みで希望のない人は下にたたまれるため、たたまれない未提出の人にする。
const manyStaffs: StaffType[] = Array.from({ length: 30 }, (_, index) => ({
  id: `staff-${index + 1}`,
  name: `スタッフ${index + 1}`,
  isSubmitted: false,
}));

/** 上の行を隠した・表示したの通知を、画面に出して確かめるためのハーネス。 */
const ChromeHarness = (args: ShiftFormArgs) => {
  const [calls, setCalls] = useState<boolean[]>([]);
  return (
    <>
      <output aria-label="上の行の通知">通知：{calls.join("、") || "なし"}</output>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ShiftForm {...args} onChromeHiddenChange={(isHidden) => setCalls((current) => [...current, isHidden])} />
      </div>
    </>
  );
};

const meta = {
  title: "Features/Shift/ShiftForm/Chrome Hide On Scroll",
  component: ShiftForm,
  parameters: { ...fullscreenParameters, screenshot: { skip: true } },
  decorators: shiftFormDecorators,
  args: {
    ...allPatternsArgs,
    staffs: manyStaffs,
    initialShifts: [],
    header: {
      shopName: "テスト店舗",
      periodTitle: "1/20 〜 26",
      backLabel: "前の画面へ戻る",
      backAriaLabel: "前の画面へ戻る",
    },
  },
  render: (args) => <ChromeHarness {...args} />,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/** 縦にいちばん長くスクロールできる入れ物を返す。 */
const findMainScroller = async (canvasElement: HTMLElement) => {
  let scroller: HTMLElement | undefined;
  await waitFor(() => {
    scroller = Array.from(canvasElement.querySelectorAll<HTMLElement>("*"))
      .filter(
        (element) => getComputedStyle(element).overflowY === "auto" && !element.closest("[data-chrome-scroll-ignore]"),
      )
      .sort((a, b) => b.scrollHeight - b.clientHeight - (a.scrollHeight - a.clientHeight))[0];
    expect(scroller && scroller.scrollHeight - scroller.clientHeight).toBeGreaterThan(400);
  });
  return scroller as HTMLElement;
};

/** 下へスクロールすると、上の行を隠し、置く側へ伝える。 */
const expectHides = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const notification = await canvas.findByRole("status", { name: "上の行の通知" });
  const chromeRow = canvasElement.querySelector<HTMLElement>("[data-chrome-row]");
  if (!chromeRow) throw new Error("上の行が見つかりません");
  const scroller = await findMainScroller(canvasElement);
  await expect(chromeRow).not.toHaveAttribute("data-chrome-hidden");

  scroller.scrollTop = 120;
  await nextFrame();
  scroller.scrollTop = 320;
  await waitFor(() => expect(chromeRow).toHaveAttribute("data-chrome-hidden"));
  await waitFor(() => expect(chromeRow.getBoundingClientRect().height).toBe(0));
  await expect(notification).toHaveTextContent("通知：true");
  return { scroller, chromeRow, notification };
};

/**
 * PCでもスマートフォンでも、表の途中で上へ戻しても上の行を出さない。
 * 少し戻しても、大きく戻しても隠したままにし、上端まで戻しきったときに表示する。
 */
const expectRevealsOnlyAtTop = async (canvasElement: HTMLElement) => {
  const { scroller, chromeRow, notification } = await expectHides(canvasElement);
  scroller.scrollTop = 700;
  await nextFrame();

  scroller.scrollTop = 670;
  await nextFrame();
  await expect(chromeRow).toHaveAttribute("data-chrome-hidden");

  scroller.scrollTop = 300;
  await nextFrame();
  await expect(chromeRow).toHaveAttribute("data-chrome-hidden");
  await expect(notification).toHaveTextContent("通知：true");

  // 上端の近くまで戻しても、上端まで戻しきるまでは上の行を出さない。
  scroller.scrollTop = 40;
  await nextFrame();
  await expect(chromeRow).toHaveAttribute("data-chrome-hidden");

  scroller.scrollTop = 0;
  await waitFor(() => expect(chromeRow).not.toHaveAttribute("data-chrome-hidden"));
  await expect(notification).toHaveTextContent("通知：true、false");
  return { scroller };
};

/** PCでは、勤務の表を下へスクロールすると、戻る・日別と一覧・保存の行を隠し、上端まで戻しきったときに表示する。 */
export const HidesOnDesktop: Story = {
  name: "Hides On Desktop",
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    await expectRevealsOnlyAtTop(canvasElement);
  },
};

/** PCのパターン選択の日別の表でも、同じように隠し、上端まで戻しきったときに表示する。 */
export const HidesOnDesktopShiftType: Story = {
  name: "Hides On Desktop Shift Type",
  globals: desktopGlobals,
  args: { ...shiftTypeArgs, staffs: manyStaffs, initialShifts: [] },
  play: async ({ canvasElement }) => {
    await expectRevealsOnlyAtTop(canvasElement);
  },
};

/** PCの日付選択の週の表でも、同じように隠し、上端まで戻しきったときに表示する。 */
export const HidesOnDesktopDateOnly: Story = {
  name: "Hides On Desktop Date Only",
  globals: desktopGlobals,
  args: { ...dateOnlyArgs, staffs: manyStaffs, initialShifts: [] },
  play: async ({ canvasElement }) => {
    await expectRevealsOnlyAtTop(canvasElement);
  },
};

/**
 * スマートフォンでは、上の行に加えて、日付の一覧もスクロールで上へ流れる。
 * 日付の見出し（◯月◯日）は、上端に留まる。
 */
export const HidesOnMobile: Story = {
  name: "Hides On Mobile",
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const { scroller } = await expectRevealsOnlyAtTop(canvasElement);
    const dateChip = canvasElement.querySelector<HTMLElement>("[data-date-chip]");
    const heading = within(canvasElement).getByText(/^\d+月\d+日$/);
    if (!dateChip) throw new Error("日付の一覧が見つかりません");

    scroller.scrollTop = 400;

    const topOf = (element: HTMLElement) => Math.round(element.getBoundingClientRect().top);
    await waitFor(() => expect(dateChip.getBoundingClientRect().bottom).toBeLessThanOrEqual(topOf(scroller)));
    // 見出しの行は、入れ物の上端に留まる。
    const headingRow = heading.parentElement?.parentElement as HTMLElement;
    await waitFor(() => expect(topOf(headingRow)).toBe(topOf(scroller)));
  },
};

/**
 * 日付選択とパターン選択のスマートフォンでは、日付の一覧が表の外にあるため、上の行と一緒に縮めて隠す。
 * 日付の見出しは残す。日付の一覧も、表の途中で上へ戻しても出さず、上端まで戻しきったときに上の行と一緒に表示する。
 */
const expectDateRailHidesWithChrome = async (canvasElement: HTMLElement) => {
  const { scroller } = await expectRevealsOnlyAtTop(canvasElement);
  const chromeRow = canvasElement.querySelector<HTMLElement>("[data-chrome-row]");
  const dateChip = canvasElement.querySelector<HTMLElement>("[data-date-chip]");
  const dateRail = dateChip?.closest<HTMLElement>("[data-chrome-collapse]");
  if (!chromeRow || !dateRail) throw new Error("隠す行の中に日付の一覧が見つかりません");
  // 日付の一覧のすぐ下の行が、日付の見出し（日付、テンプレート、表示設定）である。
  const dateHeading = dateRail.nextElementSibling;
  if (!(dateHeading instanceof HTMLElement)) throw new Error("日付の見出しが見つかりません");

  scroller.scrollTop = 200;
  await nextFrame();
  scroller.scrollTop = 700;
  await waitFor(() => expect(dateRail).toHaveAttribute("data-chrome-hidden"));
  await waitFor(() => expect(dateRail.getBoundingClientRect().height).toBe(0));
  await expect(dateHeading).toBeVisible();
  await expect(dateHeading.getBoundingClientRect().height).toBeGreaterThan(0);

  // 1人目のスタッフが見える前に日付の一覧が出ないよう、表の途中と上端の近くでは隠したままにする。
  scroller.scrollTop = 300;
  await nextFrame();
  await expect(dateRail).toHaveAttribute("data-chrome-hidden");
  scroller.scrollTop = 40;
  await nextFrame();
  await expect(dateRail).toHaveAttribute("data-chrome-hidden");

  scroller.scrollTop = 0;
  await waitFor(() => expect(dateRail).not.toHaveAttribute("data-chrome-hidden"));
  await waitFor(() => expect(dateRail.getBoundingClientRect().height).toBeGreaterThan(0));
  await expect(chromeRow).not.toHaveAttribute("data-chrome-hidden");
};

export const HidesDateRailOnMobileDateOnly: Story = {
  name: "Hides Date Rail On Mobile Date Only",
  globals: mobileGlobals,
  args: { ...dateOnlyArgs, staffs: manyStaffs, initialShifts: [] },
  play: async ({ canvasElement }) => {
    await expectDateRailHidesWithChrome(canvasElement);
  },
};

export const HidesDateRailOnMobileShiftType: Story = {
  name: "Hides Date Rail On Mobile Shift Type",
  globals: mobileGlobals,
  args: { ...shiftTypeArgs, staffs: manyStaffs, initialShifts: [] },
  play: async ({ canvasElement }) => {
    await expectDateRailHidesWithChrome(canvasElement);
  },
};

// 未提出の帯。スマートフォンは表を隠さないよう、画面の下に留めず、表のスクロールするいちばん下に置く。
const unsubmittedArgs = {
  reminderStatus: { kind: "none", label: "自動催促の予定はありません" },
  onOpenUnsubmittedDetails: () => {},
} satisfies Partial<ShiftFormArgs>;

const expectUnsubmittedStripAtScrollEnd = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const strip = await canvas.findByRole("button", { name: /未提出 30人/ });
  const scroller = await findMainScroller(canvasElement);
  await expect(scroller.contains(strip)).toBe(true);

  // 表の上端では、帯は画面の下に留まらず、表の外（下）にある。
  const bottomOf = (element: HTMLElement) => Math.round(element.getBoundingClientRect().bottom);
  await expect(strip.getBoundingClientRect().top).toBeGreaterThanOrEqual(bottomOf(scroller));

  // 表の最後までスクロールすると、帯がいちばん下に出る。
  scroller.scrollTop = scroller.scrollHeight;
  await waitFor(() => expect(Math.abs(bottomOf(strip) - bottomOf(scroller))).toBeLessThanOrEqual(1));
};

export const UnsubmittedStripOnMobileTime: Story = {
  name: "Unsubmitted Strip On Mobile Time",
  globals: mobileGlobals,
  args: unsubmittedArgs,
  play: async ({ canvasElement }) => {
    await expectUnsubmittedStripAtScrollEnd(canvasElement);
  },
};

export const UnsubmittedStripOnMobileShiftType: Story = {
  name: "Unsubmitted Strip On Mobile Shift Type",
  globals: mobileGlobals,
  args: { ...shiftTypeArgs, staffs: manyStaffs, initialShifts: [], ...unsubmittedArgs },
  play: async ({ canvasElement }) => {
    await expectUnsubmittedStripAtScrollEnd(canvasElement);
  },
};

export const UnsubmittedStripOnMobileDateOnly: Story = {
  name: "Unsubmitted Strip On Mobile Date Only",
  globals: mobileGlobals,
  args: { ...dateOnlyArgs, staffs: manyStaffs, initialShifts: [], ...unsubmittedArgs },
  play: async ({ canvasElement }) => {
    await expectUnsubmittedStripAtScrollEnd(canvasElement);
  },
};

/** PCは、これまでどおり未提出の帯を表の下に留める。表と一緒にはスクロールしない。 */
export const UnsubmittedStripOnDesktop: Story = {
  name: "Unsubmitted Strip On Desktop",
  globals: desktopGlobals,
  args: unsubmittedArgs,
  play: async ({ canvasElement }) => {
    const label = (await within(canvasElement).findAllByText("未提出 30人")).find(
      (element) => element.getBoundingClientRect().height > 0,
    ) as HTMLElement;
    const scroller = await findMainScroller(canvasElement);
    await expect(scroller.contains(label)).toBe(false);
    await expect(label.getBoundingClientRect().top).toBeGreaterThanOrEqual(scroller.getBoundingClientRect().bottom - 1);
  },
};

/** 表の上で左右にフリックしたときの、日付の見出し（「1月20日」の形）の移り変わりを確かめる。 */
const expectSwipeChangesDate = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const heading = await canvas.findByText(/^\d+月\d+日$/);
  const before = heading.textContent;
  const scroller = await findMainScroller(canvasElement);
  // ブラウザのタッチの出来事は、本物の指の情報（Touch）を渡して作る。
  const touch = (clientX: number) => new Touch({ identifier: 1, target: scroller, clientX, clientY: 300 });
  const flick = (fromX: number, toX: number) => {
    const start = touch(fromX);
    scroller.dispatchEvent(
      new TouchEvent("touchstart", {
        bubbles: true,
        touches: [start],
        targetTouches: [start],
        changedTouches: [start],
      }),
    );
    const end = touch(toX);
    scroller.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [end] }));
  };

  // 左へフリックすると次の日、右へフリックすると前の日へ戻る。
  flick(300, 200);
  await waitFor(() => expect(canvas.getByText(/^\d+月\d+日$/).textContent).not.toBe(before));
  const next = canvas.getByText(/^\d+月\d+日$/).textContent;
  flick(200, 300);
  await waitFor(() => expect(canvas.getByText(/^\d+月\d+日$/).textContent).toBe(before));
  await expect(next).not.toBe(before);
};

export const SwipeDateOnMobileShiftType: Story = {
  name: "Swipe Date On Mobile Shift Type",
  globals: mobileGlobals,
  args: { ...shiftTypeArgs, staffs: manyStaffs, initialShifts: [] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expectSwipeChangesDate(canvasElement);
  },
};

export const SwipeDateOnMobileDateOnly: Story = {
  name: "Swipe Date On Mobile Date Only",
  globals: mobileGlobals,
  args: { ...dateOnlyArgs, staffs: manyStaffs, initialShifts: [] },
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expectSwipeChangesDate(canvasElement);
  },
};

const LONG_TEMPLATE_NAME = "金曜日の夜だけ使う、宴会のある日の必要人数";
/** テンプレートの名前を、すべての日で長い名前にする。 */
const withLongTemplateName = <T extends { staffing?: ShiftFormArgs["staffing"] }>(args: T): T => {
  const staffing = args.staffing;
  if (!staffing) return args;
  return {
    ...args,
    staffing: {
      ...staffing,
      templates: staffing.templates.map((template) => ({ ...template, name: LONG_TEMPLATE_NAME })),
      days: staffing.days.map((day) => (day.templateName ? { ...day, templateName: LONG_TEMPLATE_NAME } : day)),
    },
  };
};

/**
 * スマートフォンの日付の見出しは、テンプレートの名前が長くても日付を折り返さない。
 * テンプレートはアイコンを出さず、名前を「…」で縮めて、見出しの幅に収める。
 */
const expectHeadingFitsWithLongTemplate = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const template = await canvas.findByRole("button", { name: `この日のテンプレート: ${LONG_TEMPLATE_NAME}` });
  const date = canvas.getByText(/^\d+月\d+日$/);
  const heading = date.parentElement?.parentElement as HTMLElement;

  // 日付は1行に収まる。
  const lineHeight = Number.parseFloat(getComputedStyle(date).lineHeight);
  await expect(date.getBoundingClientRect().height).toBeLessThan(lineHeight * 1.5);
  // テンプレートのボタンは見出しの幅に収まり、アイコンを出さない。
  await expect(template.getBoundingClientRect().right).toBeLessThanOrEqual(heading.getBoundingClientRect().right);
  await expect(template.querySelector("svg + span, span > svg")).toBeNull();
  await expect(template.querySelectorAll("svg")).toHaveLength(1);
};

export const LongTemplateNameOnMobileShiftType: Story = {
  name: "Long Template Name On Mobile Shift Type",
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  args: withLongTemplateName(shiftTypeBoardDetailArgs),
  render: (args) => <ShiftForm {...args} />,
  play: async ({ canvasElement }) => {
    await expectHeadingFitsWithLongTemplate(canvasElement);
  },
};

export const LongTemplateNameOnMobileDateOnly: Story = {
  name: "Long Template Name On Mobile Date Only",
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  args: withLongTemplateName(dateOnlyBoardDetailArgs),
  render: (args) => <ShiftForm {...args} />,
  play: async ({ canvasElement }) => {
    await expectHeadingFitsWithLongTemplate(canvasElement);
  },
};
