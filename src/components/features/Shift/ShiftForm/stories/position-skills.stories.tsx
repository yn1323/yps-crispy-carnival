import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { timeDetailArgs } from "../sp/detailStoryFixtures";
import { desktopGlobals, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ポジションごとの熟練度の印を、時間指定の日別表示で確かめる。シフト表では、名前の横にも勤務の側にも熟練度の印を出さない。
// 担当外のポジションへ入れた場合だけ、確認事項で知らせる。
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
  const palette = await within(canvasElement).findByRole("radiogroup", { name: "ドラッグで設定する内容" });
  await userEvent.click(within(palette).getByRole("radio", { name }));
};

/** 名前の横の印を、文字で返す。シフト表には、どの熟練度の印も出さない。 */
const nameBadges = (row: ReturnType<typeof within>) =>
  ["リーダー", "見習い", "担当外"].filter((label) => row.queryByText(label) !== null);

/**
 * 編集できるくわしく表示でも、名前の横に熟練度の印を出さない。
 * Eさんはホールが担当外、AさんとDさんはキッチンで見習いだが、「ドラッグで設定する内容」を切り替えても印は出ない。
 */
const expectNoNameMarks = async (canvasElement: HTMLElement, { switchesTool }: { switchesTool: boolean }) => {
  const rows = await Promise.all(["staff1", "staff4", "staff5"].map((id) => findRow(canvasElement, id)));
  await expect(rows.map(nameBadges)).toEqual([[], [], []]);
  if (!switchesTool) return;
  for (const tool of ["キッチン", "ホール", "休憩"]) {
    await selectTool(canvasElement, tool);
    await expect(rows.map(nameBadges)).toEqual([[], [], []]);
  }
  await expect(within(canvasElement).queryByText("リ")).not.toBeInTheDocument();
};

/** 閲覧専用と、スタッフ向けの確定シフト表示では、名前の横にも勤務の側にも、熟練度の印を出さない。 */
const expectNoSkillMarks = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  // ポジションの色分けは出る。その勤務が出たあとで、印がないことを確かめる。
  await waitFor(() => expect(canvas.queryAllByText("キッチン").length).toBeGreaterThan(0));
  await expect(canvas.queryByRole("radiogroup", { name: "ドラッグで設定する内容" })).not.toBeInTheDocument();
  for (const label of ["リーダー", "見習い", "担当外", "リ", "見"]) {
    await expect(canvas.queryByText(label)).not.toBeInTheDocument();
  }
};

// ==========================================
// PC
// ==========================================
export const NoNameMarksOnDesktop: Story = {
  name: "No Name Marks On Desktop",
  args: timeDetailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNoNameMarks(canvasElement, { switchesTool: true }),
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
export const NoNameMarksOnMobile: Story = {
  name: "No Name Marks On Mobile",
  args: timeDetailArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => expectNoNameMarks(canvasElement, { switchesTool: false }),
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
