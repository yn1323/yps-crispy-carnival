import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import type { StaffSortMode } from "@/src/domains/shift/types";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  dateOnlyArgs,
  desktopGlobals,
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
} from "./shared";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

/**
 * 表示設定の「スタッフ並び替え」を、置く側が保存して渡し直す流れを再現するハーネス。
 * argsに`detailActions.requestStaffSortModeChange`がある場合だけ、選んだ並び替えを受け取って渡し直す。
 */
const StaffSortHarness = (args: ShiftFormArgs) => {
  const [staffSortMode, setStaffSortMode] = useState<StaffSortMode>(args.staffSortMode ?? "fixed");
  const detailActions = args.detailActions?.requestStaffSortModeChange
    ? { ...args.detailActions, requestStaffSortModeChange: setStaffSortMode }
    : args.detailActions;
  return <ShiftForm {...args} staffSortMode={staffSortMode} detailActions={detailActions} />;
};

const meta = {
  title: "Features/Shift/ShiftForm/Staff Sort",
  component: ShiftForm,
  parameters: { ...fullscreenParameters, screenshot: { skip: true } },
  decorators: shiftFormDecorators,
  render: (args) => <StaffSortHarness {...args} />,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

// Aさん（10時から勤務）、Bさん（希望だけ）、Cさん（未提出で13時から勤務）、Dさん（9時から勤務）、Eさん（未提出）の1日。
const sortableArgs = {
  ...allPatternsArgs,
  detailActions: { requestStaffSortModeChange: () => {} },
} satisfies ShiftFormArgs;

const STAFF_NAME = /^[A-E]さん$/;

/** 画面に並んだスタッフの名前を、上から順に返す。同じ人の名前が続けて出る場合は1つにまとめる。 */
const readStaffOrder = (canvasElement: HTMLElement): string[] =>
  within(canvasElement)
    .getAllByText(STAFF_NAME)
    .map((element) => element.textContent ?? "")
    .filter((name, index, names) => name !== names[index - 1]);

const selectStaffSortMode = async (canvasElement: HTMLElement, name: "固定" | "勤務時間順") => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "表示設定" }));
  await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("menuitemradio", { name }));
};

const SAVED_ORDER = ["Aさん", "Bさん", "Cさん", "Dさん", "Eさん"];
// 勤務あり（Dさん9時 → Aさん10時 → Cさん13時）、出勤の希望あり（Bさん）、未提出（Eさん）の順。
const WORK_TIME_ORDER = ["Dさん", "Aさん", "Cさん", "Bさん", "Eさん"];
// スマートフォンの時間指定は「出勤あり」「出勤希望」「未提出」の見出しで分けて出す。「固定」では、見出しごとの中が決めた並び順になる。
const SAVED_ORDER_IN_SECTIONS = ["Aさん", "Cさん", "Dさん", "Bさん", "Eさん"];

const expectSortModeChangesOrder = async (canvasElement: HTMLElement, fixedOrder: string[]) => {
  await waitFor(() => expect(readStaffOrder(canvasElement)).toEqual(fixedOrder));

  await selectStaffSortMode(canvasElement, "勤務時間順");
  await waitFor(() => expect(readStaffOrder(canvasElement)).toEqual(WORK_TIME_ORDER));

  await selectStaffSortMode(canvasElement, "固定");
  await waitFor(() => expect(readStaffOrder(canvasElement)).toEqual(fixedOrder));
};

/** PCの時間指定で、「固定」は勤務のある人も決めた並び順のまま、「勤務時間順」は勤務の早い順に並ぶ。 */
export const ChangesOrderOnDesktop: Story = {
  name: "Changes Order On Desktop",
  args: sortableArgs,
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectSortModeChangesOrder(canvasElement, SAVED_ORDER),
};

/** スマートフォンの時間指定では、見出しごとの中の並びが変わる。 */
export const ChangesOrderOnMobile: Story = {
  name: "Changes Order On Mobile",
  args: sortableArgs,
  globals: mobileGlobals,
  play: async ({ canvasElement }) => expectSortModeChangesOrder(canvasElement, SAVED_ORDER_IN_SECTIONS),
};

const expectNoStaffSortInDisplaySettings = async (canvasElement: HTMLElement) => {
  const body = within(canvasElement.ownerDocument.body);
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "表示設定" }));
  await expect(await body.findByRole("menuitemcheckbox", { name: "連絡事項を表示" })).toBeInTheDocument();
  await expect(body.queryByRole("menuitemradio", { name: "勤務時間順" })).not.toBeInTheDocument();
};

/** 日付選択の勤務には時刻がないため、「スタッフ並び替え」を出さない。 */
export const HiddenOnDateOnly: Story = {
  name: "Hidden On Date Only",
  args: { ...dateOnlyArgs, detailActions: { requestStaffSortModeChange: () => {} } },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNoStaffSortInDisplaySettings(canvasElement),
};

/** 並び替えを受け付けない置き方（スタッフ向けの確定シフトなど）では、「スタッフ並び替え」を出さない。 */
export const HiddenWithoutHandler: Story = {
  name: "Hidden Without Handler",
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1", displayMode: "confirmed" },
  globals: desktopGlobals,
  play: async ({ canvasElement }) => expectNoStaffSortInDisplaySettings(canvasElement),
};
