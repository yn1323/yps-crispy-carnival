import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { ShiftForm } from "..";
import { dateOnlyBoardSimpleArgs } from "./dateOnlyBoardFixtures";
import {
  dateOnlyArgs,
  dateOnlyDateNotesArgs,
  dateOnlyValidationWarningArgs,
  fullscreenParameters,
  mobileGlobals,
  shiftFormDecorators,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/SP",
  component: ShiftForm,
  tags: ["vrt-mobile2"],
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Daily: Story = {
  args: dateOnlyArgs,
  globals: mobileGlobals,
};

export const DailyWithValidationWarnings: Story = {
  name: "Daily With Validation Warnings",
  args: dateOnlyValidationWarningArgs,
  globals: mobileGlobals,
};

export const Overview: Story = {
  args: { ...dateOnlyArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

export const OverviewWithValidationWarnings: Story = {
  name: "Overview With Validation Warnings",
  args: { ...dateOnlyValidationWarningArgs, initialViewMode: "overview" },
  globals: mobileGlobals,
};

export const Interactive: Story = {
  args: dateOnlyArgs,
  globals: mobileGlobals,
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole("tab", { name: "日別" })).toBeInTheDocument();
    await expect(await canvas.findByRole("tab", { name: "一覧" })).toBeInTheDocument();
    await expect(canvas.queryByLabelText("6/1(月)を表示")).not.toBeInTheDocument();

    // 6/3: 希望のある佐藤さん、希望外で入っている鈴木さん、未提出の中村さんの順に並ぶ。ほかの人はたたまれている。
    await userEvent.click(await canvas.findByLabelText("6/3(水)を表示"));
    const requested = await canvas.findByRole("button", { name: "佐藤 花子 6/3(水) 勤務なし" });
    const unrequested = await canvas.findByRole("button", { name: "鈴木 次郎 6/3(水) 勤務あり" });
    const unsubmitted = await canvas.findByRole("button", { name: "中村 五郎 6/3(水) 勤務なし" });
    await expect(requested.getBoundingClientRect().top).toBeLessThan(unrequested.getBoundingClientRect().top);
    await expect(unrequested.getBoundingClientRect().top).toBeLessThan(unsubmitted.getBoundingClientRect().top);
    await expect(canvas.queryByRole("button", { name: "田中 太郎 6/3(水) 勤務なし" })).not.toBeInTheDocument();
    // シンプル表示は、ピルを押すと割り当てが外れ、理由を出す場所がない。点のある日だけ、点の意味を出す。
    await expect(unrequested.querySelector("[data-assignment-dot]")).toHaveAttribute("data-assignment-dot", "orange");
    await expect(await canvas.findByText("橙の点：確認が必要")).toBeInTheDocument();

    // たたんだ人を開いて入れると、上のリストへ移る。もう一度押すと外れて、たたんだまとまりへ戻る。
    await userEvent.click(await canvas.findByRole("button", { name: /^この日の希望がない人 3人/ }));
    await userEvent.click(await canvas.findByRole("button", { name: "田中 太郎 6/3(水) 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: /^この日の希望がない人 2人/ })).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("button", { name: "田中 太郎 6/3(水) 勤務あり" }));
    await expect(await canvas.findByRole("button", { name: /^この日の希望がない人 3人/ })).toBeInTheDocument();

    // 点のない日は、点の意味を出さない。
    await userEvent.click(await canvas.findByLabelText("6/2(火)を表示"));
    const tanakaSecond = await canvas.findByRole("button", { name: "田中 太郎 6/2(火) 勤務あり" });
    await expect(canvas.queryByText("橙の点：確認が必要")).not.toBeInTheDocument();
    await userEvent.click(tanakaSecond);
    const tanakaRemoved = await canvas.findByRole("button", { name: "田中 太郎 6/2(火) 勤務なし" });
    await expect(tanakaRemoved).toHaveTextContent("希望あり");

    await userEvent.click(await canvas.findByRole("tab", { name: "一覧" }));
    await expect(await canvas.findByText("6/1 – 6/7")).toBeInTheDocument();
    await expect((await canvas.findAllByText("期間外")).length).toBeGreaterThan(0);
    await expect((await canvas.findAllByText("佐藤 花子")).length).toBeGreaterThan(0);
    await expect((await canvas.findAllByText("勤務なし")).length).toBeGreaterThan(0);

    await userEvent.click(await canvas.findByLabelText("6/2(火)の日別を表示"));
    await expect(await canvas.findByRole("tab", { name: "日別" })).toHaveAttribute("aria-selected", "true");
    await expect(await canvas.findByRole("button", { name: "田中 太郎 6/2(火) 勤務なし" })).toBeInTheDocument();
  },
};

/** 依頼の画像と同じ日（12/2）のシンプル表示。「○」のピル、希望の輪、名前の下の連絡事項、たたんだ人、日付の横の人数を確かめる。 */
export const DailyBoard: Story = {
  name: "Daily Board",
  args: dateOnlyBoardSimpleArgs,
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    await userEvent.click(await within(canvasElement).findByRole("button", { name: "12/2(水)を表示" }));
  },
};

/** その日の連絡事項は、表示設定にかかわらず、名前の下に全文を出す。表示設定に「連絡事項を表示」は置かない。 */
export const DailyWithDateNotes: Story = {
  args: dateOnlyDateNotesArgs,
  globals: mobileGlobals,
  play: async ({ canvasElement }) => {
    const note = await within(canvasElement).findByText("家の用事で18時まで入れません");
    await expect(note).toHaveAttribute("data-clarity-mask", "true");
  },
};

/** 日付チップは日だけを表示し、休みは曜日と同じ行に置く。その日の人数は日付の見出しの横に置く。 */
export const DailyDateChipLayout: Story = {
  args: dateOnlyArgs,
  globals: mobileGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const closedChip = canvasElement.querySelector<HTMLElement>('[data-date-chip="2026-06-07"]');
    await expect(closedChip?.textContent).toBe("7日(休)");
    const chipHeights = new Set(
      Array.from(canvasElement.querySelectorAll<HTMLElement>("[data-date-chip]")).map((chip) =>
        Math.round(chip.getBoundingClientRect().height),
      ),
    );
    await expect(chipHeights.size).toBe(1);

    // 人数は、勤務を入れると増える。
    const count = await canvas.findByText("2人");
    await userEvent.click(await canvas.findByRole("button", { name: /^この日の希望がない人/ }));
    await userEvent.click(await canvas.findByRole("button", { name: "吉田 三郎 6/2(火) 勤務なし" }));
    await expect(count).toHaveTextContent("3人");
  },
};
