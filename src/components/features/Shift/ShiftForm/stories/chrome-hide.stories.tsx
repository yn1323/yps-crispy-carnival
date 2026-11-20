import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import type { StaffType } from "@/src/domains/shift/types";
import { ShiftForm } from "..";
import { allPatternsArgs, desktopGlobals, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// 内側の入れ物を下へスクロールすると上の行を隠し、上へ戻すと表示する動きを確かめる。
// 入れ物が画面より十分に長くなるよう、スタッフを30人にする。
const manyStaffs: StaffType[] = Array.from({ length: 30 }, (_, index) => ({
  id: `staff-${index + 1}`,
  name: `スタッフ${index + 1}`,
  isSubmitted: true,
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
      desktopTitle: "テスト店舗：1/20 〜 26",
      mobileTitle: "1/20 〜 26",
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

const expectHidesAndReveals = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const notification = await canvas.findByRole("status", { name: "上の行の通知" });
  const chromeRow = canvasElement.querySelector<HTMLElement>("[data-chrome-row]");
  if (!chromeRow) throw new Error("上の行が見つかりません");
  const scroller = await findMainScroller(canvasElement);
  await expect(chromeRow).not.toHaveAttribute("data-chrome-hidden");

  // 下へスクロールすると、上の行を隠し、置く側へ伝える。
  scroller.scrollTop = 120;
  await nextFrame();
  scroller.scrollTop = 320;
  await waitFor(() => expect(chromeRow).toHaveAttribute("data-chrome-hidden"));
  await waitFor(() => expect(chromeRow.getBoundingClientRect().height).toBe(0));
  await expect(notification).toHaveTextContent("通知：true");

  // 上へ戻すと、表示する。
  scroller.scrollTop = 290;
  await waitFor(() => expect(chromeRow).not.toHaveAttribute("data-chrome-hidden"));
  await expect(notification).toHaveTextContent("通知：true、false");
  return { scroller };
};

/** PCでは、勤務の表を下へスクロールすると、戻る・日別と一覧・保存の行を隠し、上へ戻すと表示する。 */
export const HidesOnDesktop: Story = {
  name: "Hides On Desktop",
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    await expectHidesAndReveals(canvasElement);
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
    const { scroller } = await expectHidesAndReveals(canvasElement);
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
