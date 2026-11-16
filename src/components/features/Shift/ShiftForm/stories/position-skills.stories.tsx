import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { timeDetailArgs } from "../sp/detailStoryFixtures";
import { desktopGlobals, fullscreenParameters, mobileGlobals, shiftFormDecorators } from "./shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

// ポジションごとの熟練度の印を、時間指定の日別表示で確かめる。
// Aさんは、ホールでは責任者、キッチンでは新人。Dさんは、キッチンとレジで新人。Eさんは、ホールに入れない。
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

/** 名前の横の印と、勤務の区間の印を、文字で返す。印は「新人」「責任者」「入れない」と「新」「責」。 */
const nameBadges = (row: ReturnType<typeof within>) =>
  ["責任者", "新人", "入れない"].filter((label) => row.queryByText(label) !== null);
const segmentMarks = (row: ReturnType<typeof within>) => [
  ...row.queryAllByText("責").map(() => "責"),
  ...row.queryAllByText("新").map(() => "新"),
];

/** 「入れるもの」を切り替えると、名前の横の印が、選んだポジションでの値に変わる。勤務の区間の印は変わらない。 */
const expectNameMarkFollowsTool = async (canvasElement: HTMLElement) => {
  const rowA = await findRow(canvasElement, "staff1");
  const rowD = await findRow(canvasElement, "staff4");
  const rowE = await findRow(canvasElement, "staff5");

  // 選んでいなければ、既定のポジション（ホール）での値を出す。
  await expect(await rowA.findByText("責任者")).toHaveAttribute("title", "ホールでは責任者です");
  await expect(rowE.getByText("入れない")).toHaveAttribute("title", "ホールには入れません");
  await expect(nameBadges(rowD)).toEqual([]);
  // 勤務の区間には、その区間のポジションでの値が出る。Aさんはホールで「責」、キッチンで「新」。
  await expect(segmentMarks(rowA)).toEqual(["責", "新"]);

  await selectTool(canvasElement, "キッチン");
  await expect(await rowA.findByText("新人")).toHaveAttribute("title", "キッチンでは新人です");
  await expect(rowD.getByText("新人")).toHaveAttribute("title", "キッチンでは新人です");
  await expect(nameBadges(rowA)).toEqual(["新人"]);
  await expect(nameBadges(rowE)).toEqual([]);
  await expect(segmentMarks(rowA)).toEqual(["責", "新"]);

  await selectTool(canvasElement, "レジ");
  await expect(await rowD.findByText("新人")).toHaveAttribute("title", "レジでは新人です");
  await waitFor(() => expect(nameBadges(rowA)).toEqual([]));

  // 休憩を選んでいる間は、根拠にするポジションがないため、名前の横の印を出さない。
  await selectTool(canvasElement, "休憩");
  await waitFor(() => expect([rowA, rowD, rowE].map(nameBadges)).toEqual([[], [], []]));
  await expect(segmentMarks(rowA)).toEqual(["責", "新"]);
};

/** 閲覧専用では「入れるもの」がないため、名前の横の印を出さない。勤務の区間の印は出す。 */
const expectReadOnlyShowsSegmentMarksOnly = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  const rowA = await findRow(canvasElement, "staff1");

  await waitFor(() => expect(segmentMarks(rowA)).toEqual(["責", "新"]));
  await expect(canvas.queryByRole("radiogroup", { name: "入れるもの" })).not.toBeInTheDocument();
  for (const label of ["責任者", "新人", "入れない"]) {
    await expect(canvas.queryByText(label)).not.toBeInTheDocument();
  }
};

/** スタッフ向けの確定シフト表示では、名前の横にも勤務の区間にも、熟練度の印を出さない。 */
const expectNoSkillMarks = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  // ポジションの色分けは出る。その勤務が出たあとで、印がないことを確かめる。
  await waitFor(() => expect(canvas.queryAllByText("キッチン").length).toBeGreaterThan(0));
  for (const label of ["責任者", "新人", "入れない", "責", "新"]) {
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

/** シンプル表示へ切り替えると、名前の横の印も勤務の区間の印も消え、くわしく表示へ戻すと出る。 */
export const HiddenInSimpleOnDesktop: Story = {
  name: "Hidden In Simple On Desktop",
  args: timeDetailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rowA = await findRow(canvasElement, "staff1");
    const detailMode = within(await canvas.findByRole("radiogroup", { name: "表示の詳しさ" }));
    await expect(await rowA.findByText("責任者")).toBeInTheDocument();
    await expect(segmentMarks(rowA)).toEqual(["責", "新"]);

    await userEvent.click(detailMode.getByRole("radio", { name: "シンプル" }));
    await waitFor(() => expect(nameBadges(rowA)).toEqual([]));
    await expect(segmentMarks(rowA)).toEqual([]);

    await userEvent.click(detailMode.getByRole("radio", { name: "くわしく" }));
    await expect(await rowA.findByText("責任者")).toBeInTheDocument();
    await expect(segmentMarks(rowA)).toEqual(["責", "新"]);
  },
};

export const ReadOnlyOnDesktop: Story = {
  name: "Read Only On Desktop",
  args: readOnlyArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectReadOnlyShowsSegmentMarksOnly(canvasElement),
};

export const ConfirmedForStaffOnDesktop: Story = {
  name: "Confirmed For Staff On Desktop",
  args: confirmedForStaffArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNoSkillMarks(canvasElement),
};

/**
 * 帯の「新」は、ポジションごとに判定する。
 * Bさんが休憩に入る15:00〜15:30のキッチンは、キッチンで新人のAさんだけになる。
 * 同じAさんが1人でいる10:00〜12:00のホールは、ホールでは責任者なので、新人だけにならない。
 */
export const NewcomerOnlyBandFollowsPositionOnDesktop: Story = {
  name: "Newcomer Only Band Follows Position On Desktop",
  args: timeDetailArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => {
    const staffing = within(await within(canvasElement).findByRole("region", { name: "人数" }));
    const kitchenSegment = await staffing.findByRole("button", { name: "キッチン 15:00〜15:30 1/2 ▲1、新人だけ" });
    await expect(staffing.getByRole("button", { name: "ホール 10:00〜12:00 1/2 ▲1" })).toBeInTheDocument();

    await userEvent.click(kitchenSegment);

    const popover = within(await within(document.body).findByRole("dialog", { name: "キッチンの人数" }));
    await expect(popover.getByText("新人だけの時間です")).toBeInTheDocument();
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

/** 「表示設定」でシンプル表示へ切り替えると、名前の横の印も勤務の区間の印も消える。 */
export const HiddenInSimpleOnMobile: Story = {
  name: "Hidden In Simple On Mobile",
  args: timeDetailArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const rowA = await findRow(canvasElement, "staff1");
    await expect(await rowA.findByText("責任者")).toBeInTheDocument();
    await expect(segmentMarks(rowA)).toEqual(["責", "新"]);

    await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("menuitemcheckbox", { name: "くわしく表示" }),
    );

    await waitFor(() => expect(nameBadges(rowA)).toEqual([]));
    await expect(segmentMarks(rowA)).toEqual([]);
  },
};

export const ReadOnlyOnMobile: Story = {
  name: "Read Only On Mobile",
  args: readOnlyArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => expectReadOnlyShowsSegmentMarksOnly(canvasElement),
};

export const ConfirmedForStaffOnMobile: Story = {
  name: "Confirmed For Staff On Mobile",
  args: confirmedForStaffArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => expectNoSkillMarks(canvasElement),
};

/** 人数のカードの「新人だけ」も、ポジションごとに判定する。 */
export const NewcomerOnlyCardFollowsPositionOnMobile: Story = {
  name: "Newcomer Only Card Follows Position On Mobile",
  args: timeDetailArgs,
  globals: mobileGlobals,
  tags: ["vrt-mobile2"],
  play: async ({ canvasElement }) => {
    const card = within(await within(canvasElement).findByRole("region", { name: "人数" }));
    const rowsOf = (positionName: string) =>
      within(card.getByRole("list", { name: `${positionName}の人数` }))
        .getAllByRole("listitem")
        .map((row) => row.textContent);

    await userEvent.click(await card.findByRole("button", { name: "すべて見る" }));

    // キッチンは、Bさんの休憩中だけ、キッチンで新人のAさんが1人になる。
    await waitFor(() =>
      expect(rowsOf("キッチン").filter((row) => row?.includes("新人だけ"))).toEqual(["15:00〜15:301/2 ▲1新人だけ"]),
    );
    // ホールは、ホールで責任者のAさんが1人でいる時間も、新人だけにならない。
    await expect(rowsOf("ホール").filter((row) => row?.includes("新人だけ"))).toEqual([]);
  },
};
