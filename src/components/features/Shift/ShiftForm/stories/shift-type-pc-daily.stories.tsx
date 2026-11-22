import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
import { shiftTypeBoardSimpleArgs } from "./shiftTypeBoardFixtures";

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

/**
 * 右端に幅を決めた「連絡事項」列を置き、選んだ日の連絡事項の全文を出す。
 * 表示設定で連絡事項を非表示にすると列を外し、連絡事項のある人の名前の横にアイコンを出す。
 */
export const DateNotesInteractive: Story = {
  args: shiftTypeDateNotesArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const getHeaders = () =>
      Array.from(canvasElement.querySelectorAll<HTMLElement>("thead th")).map((cell) => cell.textContent?.slice(0, 4));
    await expect(getHeaders()).toEqual(["スタッフ", "早番09", "中番13", "遅番17", "夜勤21", "連絡事項"]);
    const noteHeader = Array.from(canvasElement.querySelectorAll<HTMLElement>("thead th")).at(-1) as HTMLElement;
    await expect(Math.round(noteHeader.getBoundingClientRect().width)).toBe(280);

    const note = await canvas.findByText("17時以降なら入れます");
    await expect(note).toHaveAttribute("data-clarity-mask", "true");
    // 列で本文が読めるあいだは、名前の横にアイコンを重ねない。
    await expect(canvas.queryByRole("button", { name: "連絡事項1件" })).not.toBeInTheDocument();

    await hideDateNotes(canvasElement);
    await waitFor(() => expect(getHeaders()).toEqual(["スタッフ", "早番09", "中番13", "遅番17", "夜勤21"]));
    const noteIcons = await canvas.findAllByRole("button", { name: "連絡事項1件" });
    await expect(noteIcons).toHaveLength(2);
    await userEvent.hover(noteIcons[0]);
    const tooltip = await within(document.body).findByRole("tooltip");
    await expect(within(tooltip).getByText("17時以降なら入れます")).toHaveAttribute("data-clarity-mask", "true");
  },
};

/** 希望どおり、希望だけ、希望外、時間の重なり、休み希望、未提出を1日に持つ代表例。 */
export const Board: Story = {
  args: shiftTypeBoardSimpleArgs,
  globals: desktopGlobals,
};

/** 「希望」を押すと「○」が入り、もう一度押すと外れる。希望のないセルに入れると、橙の点と理由が付く。 */
export const ToggleInteractive: Story = {
  args: shiftTypeBoardSimpleArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cell = (state: "勤務あり" | "勤務なし") => canvas.findByRole("button", { name: `山本 拓海 遅番 ${state}` });
    const rowHeight = () =>
      Math.round((canvas.getByRole("row", { name: /山本 拓海/ }) as HTMLElement).getBoundingClientRect().height);
    const heightBefore = rowHeight();

    await expect(await cell("勤務なし")).toHaveTextContent("希望あり");
    await userEvent.click(await cell("勤務なし"));
    const assigned = await cell("勤務あり");
    await expect(assigned).toHaveTextContent("○");
    await expect(assigned).toHaveAccessibleDescription("希望あり");
    await expect(await canvas.findByRole("columnheader", { name: /遅番/ })).toHaveTextContent("4人");
    // 割り当ての前後で、行の高さを変えない。
    await expect(rowHeight()).toBe(heightBefore);

    await userEvent.click(assigned);
    await expect(await cell("勤務なし")).toHaveTextContent("希望あり");
    await expect(rowHeight()).toBe(heightBefore);

    // 希望していない早番に入れると、橙の点と理由が付く。
    await userEvent.click(await canvas.findByRole("button", { name: "山本 拓海 早番 勤務なし" }));
    const unrequested = await canvas.findByRole("button", { name: "山本 拓海 早番 勤務あり" });
    await expect(unrequested).toHaveAccessibleDescription("希望していないシフトです");
    await expect(unrequested.querySelector("[data-assignment-dot]")).toHaveAttribute("data-assignment-dot", "orange");
  },
};

/** 時間が重なる2つの勤務パターンに入れると、割り当てを止めず、両方に赤い点と理由を出す。 */
export const OverlapInteractive: Story = {
  args: shiftTypeBoardSimpleArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 吉田さんは遅番（15:00〜21:00）に入っている。夜番（18:00〜24:00）を足す。
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 蓮 夜番 勤務なし" }));

    const late = await canvas.findByRole("button", { name: "吉田 蓮 遅番 勤務あり" });
    const night = await canvas.findByRole("button", { name: "吉田 蓮 夜番 勤務あり" });
    await expect(late).toHaveAccessibleDescription("希望あり、夜番と時間が重なっています");
    await expect(night).toHaveAccessibleDescription("希望していないシフトです、遅番と時間が重なっています");
    for (const pill of [late, night]) {
      await expect(pill.querySelector("[data-assignment-dot]")).toHaveAttribute("data-assignment-dot", "red");
    }

    // 時間が隣り合うだけの早番（〜15:00）と遅番（15:00〜）は、重なりにしない。
    const matsumotoLate = await canvas.findByRole("button", { name: "松本 大和 遅番 勤務あり" });
    await expect(matsumotoLate.querySelector("[data-assignment-dot]")).toBeNull();
  },
};

/** 休み希望の人は、最初はたたまれている。開いて割り当てると通常の行へ移り、外すとまとまりへ戻る。 */
export const RestGroupInteractive: Story = {
  args: shiftTypeBoardSimpleArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: /^休み希望 4人/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // 見出しの横には、名字を3人分まで出し、残りを「ほか1人」にまとめる。
    await expect(toggle).toHaveTextContent(
      /^休み希望 4人(?:伊藤|中村|高橋|山口)(?:・(?:伊藤|中村|高橋|山口)){2}・ほか1人$/,
    );
    await expect(canvas.queryByRole("row", { name: /中村 さくら/ })).not.toBeInTheDocument();

    await userEvent.click(toggle);
    await expect(await canvas.findByRole("row", { name: /中村 さくら/ })).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "中村 さくら 早番 勤務なし" }));
    // 割り当てた人は通常の行へ移り、まとまりは3人になる。割り当ては希望外として点を付ける。
    await expect(await canvas.findByRole("button", { name: /^休み希望 3人/ })).toBeInTheDocument();
    const assigned = await canvas.findByRole("button", { name: "中村 さくら 早番 勤務あり" });
    await expect(assigned).toHaveAccessibleDescription("希望していないシフトです");
    const rows = canvas.getAllByRole("row").map((row) => row.textContent ?? "");
    const restIndex = rows.findIndex((text) => text.startsWith("休み希望"));
    await expect(rows.findIndex((text) => text.startsWith("中村 さくら"))).toBeLessThan(restIndex);

    await userEvent.click(assigned);
    await expect(await canvas.findByRole("button", { name: /^休み希望 4人/ })).toBeInTheDocument();
  },
};
