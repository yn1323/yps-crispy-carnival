import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { timeDetailArgs } from "../sp/detailStoryFixtures";
import { desktopGlobals, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ポジションごとの熟練度の印を、時間指定の日別表示で確かめる。シフト表には、名前の横の「担当外」だけを出す。
// Aさんは、ホールではリーダー、キッチンでは見習い。Dさんは、キッチンとレジで見習い。Eさんは、ホールが担当外。
// Aさんはホール（10:00〜14:00）からキッチン（14:00〜18:00）へ移り、Dさんはレジに入る。Eさんは勤務がない。
const meta = {
  title: "Features/Shift/ShiftForm/Position Skills",
  component: ShiftForm,
  parameters: { ...fullscreenParameters, screenshot: { skip: true } },
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const readOnlyArgs = { ...timeDetailArgs, isReadOnly: true } satisfies ShiftFormArgs;
// スタッフ向けの確定シフト表示。熟練度がデータに入っていても出さないことを確かめるため、スタッフの値は残す。
const confirmedForStaffArgs = {
  ...timeDetailArgs,
  isReadOnly: true,
  displayMode: "confirmed",
  currentStaffId: "staff1",
  onDetailModeChange: undefined,
} satisfies ShiftFormArgs;

const findRow = async (canvasElement: HTMLElement, staffId: string) => {
  const selector = `[data-tour="shift-row-${staffId}"]`;
  await waitFor(() => expect(canvasElement.querySelector(selector)).not.toBeNull());
  return within(canvasElement.querySelector(selector) as HTMLElement);
};

const selectTool = async (canvasElement: HTMLElement, name: string) => {
  const palette = await within(canvasElement).findByRole("radiogroup", { name: "入れるもの" });
  await userEvent.click(within(palette).getByRole("radio", { name }));
};

/** 名前の横の印を、文字で返す。シフト表に出すのは「担当外」だけで、リーダーと見習いは出さない。 */
const nameBadges = (row: ReturnType<typeof within>) =>
  ["リーダー", "見習い", "担当外"].filter((label) => row.queryByText(label) !== null);

/** 画面のどこにも、リーダーの印（名前の横の「リーダー」、勤務の側の「リ」）がない。 */
const expectNoLeaderMarks = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await expect(canvas.queryByText("リーダー")).not.toBeInTheDocument();
  await expect(canvas.queryByText("リ")).not.toBeInTheDocument();
};

/**
 * 「入れるもの」を切り替えると、名前の横の担当外の印が、選んだポジションでの値に変わる。
 * Aさんはホールでリーダーだが、名前の横にも勤務の側にも、リーダーの印は出さない。
 */
const expectNameMarkFollowsTool = async (canvasElement: HTMLElement) => {
  const rowA = await findRow(canvasElement, "staff1");
  const rowD = await findRow(canvasElement, "staff4");
  const rowE = await findRow(canvasElement, "staff5");

  // 選んでいなければ、既定のポジション（ホール）での値を出す。
  await expect(await rowE.findByText("担当外")).toHaveAttribute("title", "ホールは担当外です");
  await expect([rowA, rowD].map(nameBadges)).toEqual([[], []]);
  await expectNoLeaderMarks(canvasElement);

  // 見習いは名前の横に出さない。キッチンでは、AさんとDさんが見習い、Eさんが一人前。
  await selectTool(canvasElement, "キッチン");
  await waitFor(() => expect([rowA, rowD, rowE].map(nameBadges)).toEqual([[], [], []]));

  await selectTool(canvasElement, "ホール");
  await expect(await rowE.findByText("担当外")).toHaveAttribute("title", "ホールは担当外です");
  await expect([rowA, rowD].map(nameBadges)).toEqual([[], []]);

  // 休憩を選んでいる間は、根拠にするポジションがないため、名前の横の印を出さない。
  await selectTool(canvasElement, "休憩");
  await waitFor(() => expect([rowA, rowD, rowE].map(nameBadges)).toEqual([[], [], []]));
  await expectNoLeaderMarks(canvasElement);
};

/** 閲覧専用と、スタッフ向けの確定シフト表示では、名前の横にも勤務の側にも、熟練度の印を出さない。 */
const expectNoSkillMarks = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  // ポジションの色分けは出る。その勤務が出たあとで、印がないことを確かめる。
  await waitFor(() => expect(canvas.queryAllByText("キッチン").length).toBeGreaterThan(0));
  await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();
  for (const label of ["リーダー", "見習い", "担当外", "リ", "見"]) {
    await expect(canvas.queryByText(label)).not.toBeInTheDocument();
  }
};

// ==========================================
// PC
// ==========================================
export const NameMarkFollowsToolOnDesktop: Story = {
  name: "Name Mark Follows Tool On Desktop",
  args: timeDetailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNameMarkFollowsTool(canvasElement),
};

/** 「表示設定」でシンプル表示へ切り替えると、名前の横の担当外の印が消え、くわしく表示へ戻すと出る。 */
export const HiddenInSimpleOnDesktop: Story = {
  name: "Hidden In Simple On Desktop",
  args: timeDetailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const selectDetailMode = async (name: "シンプル" | "くわしく") => {
      await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
      await userEvent.click(await body.findByRole("menuitemradio", { name }));
    };
    const rowE = await findRow(canvasElement, "staff5");
    await expect(await rowE.findByText("担当外")).toBeInTheDocument();

    await selectDetailMode("シンプル");
    await waitFor(() => expect(nameBadges(rowE)).toEqual([]));

    await selectDetailMode("くわしく");
    await expect(await rowE.findByText("担当外")).toBeInTheDocument();
  },
};

export const ReadOnlyOnDesktop: Story = {
  name: "Read Only On Desktop",
  args: readOnlyArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNoSkillMarks(canvasElement),
};

export const ConfirmedForStaffOnDesktop: Story = {
  name: "Confirmed For Staff On Desktop",
  args: confirmedForStaffArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNoSkillMarks(canvasElement),
};

/**
 * 帯の「見」は、ポジションごとに判定する。
 * Bさんが休憩に入る15:00〜15:30のキッチンは、キッチンで見習いのAさんだけになる。
 * 同じAさんが1人でいる10:00〜12:00のホールは、ホールではリーダーなので、見習いだけにならない。
 */
export const NewcomerOnlyBandFollowsPositionOnDesktop: Story = {
  name: "Newcomer Only Band Follows Position On Desktop",
  args: timeDetailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const staffing = within(await within(canvasElement).findByRole("region", { name: "人数" }));
    const kitchenSegment = await staffing.findByRole("button", { name: "キッチン 15:00〜15:30 1/2 ▲1、見習いだけ" });
    await expect(staffing.getByRole("button", { name: "ホール 10:00〜12:00 1/2 ▲1" })).toBeInTheDocument();

    await userEvent.click(kitchenSegment);

    const popover = within(await within(document.body).findByRole("dialog", { name: "キッチンの人数" }));
    await expect(popover.getByText("スキル見習いのみ")).toBeInTheDocument();
  },
};

// ==========================================
// スマートフォン
// ==========================================
export const NameMarkFollowsToolOnMobile: Story = {
  name: "Name Mark Follows Tool On Mobile",
  args: timeDetailArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => expectNameMarkFollowsTool(canvasElement),
};

/** 「表示設定」でシンプル表示へ切り替えると、名前の横の担当外の印が消える。 */
export const HiddenInSimpleOnMobile: Story = {
  name: "Hidden In Simple On Mobile",
  args: timeDetailArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rowE = await findRow(canvasElement, "staff5");
    await expect(await rowE.findByText("担当外")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitemradio", { name: "シンプル" }),
    );

    await waitFor(() => expect(nameBadges(rowE)).toEqual([]));
  },
};

export const ReadOnlyOnMobile: Story = {
  name: "Read Only On Mobile",
  args: readOnlyArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => expectNoSkillMarks(canvasElement),
};

export const ConfirmedForStaffOnMobile: Story = {
  name: "Confirmed For Staff On Mobile",
  args: confirmedForStaffArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => expectNoSkillMarks(canvasElement),
};
