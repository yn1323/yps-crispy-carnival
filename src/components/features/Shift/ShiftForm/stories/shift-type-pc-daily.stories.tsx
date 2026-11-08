import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  desktopGlobals,
  fullscreenParameters,
  hideDateNotes,
  shiftFormDecorators,
  shiftTypeArgs,
  shiftTypeDateNotesArgs,
  shiftTypeValidationWarningArgs,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Shift Type/PC/Daily",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const findVisibleByLabelText = async (canvas: ReturnType<typeof within>, label: string) => {
  const elements: HTMLElement[] = await canvas.findAllByLabelText(label);
  const visibleElement = elements.find((element) => element.getClientRects().length > 0);
  await expect(visibleElement).toBeDefined();
  return visibleElement as HTMLElement;
};

export const Basic: Story = {
  args: shiftTypeArgs,
  globals: desktopGlobals,
};

// 確認事項（ワーニング）: DateRailバッジ＋スタッフ名セルの理由アイコン。パターン選択の募集レイアウトでの表示確認
export const WithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: shiftTypeValidationWarningArgs,
  globals: desktopGlobals,
};

export const Interactive: Story = {
  args: shiftTypeArgs,
  globals: desktopGlobals,
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("tab", { name: /21/ }));
    await expect((await canvas.findAllByText("21:00〜翌9:00")).length).toBeGreaterThan(0);
    const yamadaMorningOff = await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務なし");
    await expect(yamadaMorningOff).toBeInTheDocument();
    await userEvent.click(yamadaMorningOff);
    const yamadaMorningOn = await findVisibleByLabelText(canvas, "山田 一郎 早番 勤務あり");
    await expect(yamadaMorningOn).toBeInTheDocument();
    const yoshidaLateOn = await findVisibleByLabelText(canvas, "吉田 三郎 遅番 勤務あり");
    await expect(yamadaMorningOn.getBoundingClientRect().top).toBeGreaterThan(
      yoshidaLateOn.getBoundingClientRect().top,
    );

    await expect((await canvas.findAllByText("2人")).length).toBeGreaterThan(0);
    await userEvent.click(await findVisibleByLabelText(canvas, "田中 太郎 早番 勤務あり"));
    await expect(await findVisibleByLabelText(canvas, "田中 太郎 早番 勤務なし")).toBeInTheDocument();
  },
};

export const WithDateNotes: Story = {
  args: shiftTypeDateNotesArgs,
  globals: desktopGlobals,
};

export const DateNotesInteractive: Story = {
  args: shiftTypeDateNotesArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 希望とメモは別の列にし、メモ列を希望列の右に置く。
    const headers = Array.from(canvasElement.querySelectorAll<HTMLElement>("thead tr:first-child th")).map(
      (cell) => cell.textContent,
    );
    await expect(headers.slice(0, 3)).toEqual(["スタッフ", "希望", "連絡事項"]);
    // 左の3見出しは人数の行まで結合し、「人数」の見出しは置かない。
    const mergedHeaders = Array.from(canvasElement.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"));
    await expect(mergedHeaders.slice(0, 3).map((cell) => cell.rowSpan)).toEqual([2, 2, 2]);
    await expect(canvas.queryByText("人数", { exact: true })).not.toBeInTheDocument();
    await expect(await canvas.findByText("17時以降なら入れます")).toHaveAttribute("data-clarity-mask", "true");

    const rows = Array.from(canvasElement.querySelectorAll<HTMLElement>("tbody tr"));
    const heights = new Set(rows.map((row) => Math.round(row.getBoundingClientRect().height)));
    await expect(heights.size).toBe(1);

    // 連絡事項を非表示にしたときだけ、連絡事項がある人の名前セルの右端にアイコンを置き、ホバーで本文を表示する。
    await expect(canvas.queryByRole("button", { name: "連絡事項1件" })).not.toBeInTheDocument();
    await hideDateNotes(canvasElement);
    const noteIcons = await canvas.findAllByRole("button", { name: "連絡事項1件" });
    await expect(noteIcons).toHaveLength(2);
    await expect(noteIcons[0].closest("td")).toBe(noteIcons[0].closest("tr")?.querySelector("td"));
    await userEvent.hover(noteIcons[0]);
    const tooltip = await within(document.body).findByRole("tooltip");
    await expect(tooltip).toHaveTextContent(/^連絡事項/);
    await expect(tooltip).not.toHaveTextContent("5/21(木)");
  },
};
