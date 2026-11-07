import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  dateOnlyArgs,
  dateOnlyDateNotesArgs,
  dateOnlyValidationWarningArgs,
  desktopGlobals,
  fullscreenParameters,
  hideDateNotes,
  shiftFormDecorators,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Date Only/PC",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  args: dateOnlyArgs,
  globals: desktopGlobals,
};

// 確認事項（ワーニング）: 日付選択募集レイアウトでのDateRailバッジ＋スタッフ名セルアイコン表示確認
// （日付選択は時間・勤務パターンの概念がないため NOT_SUBMITTED / OFF_REQUEST のみ）
export const WithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: dateOnlyValidationWarningArgs,
  globals: desktopGlobals,
};

export const Interactive: Story = {
  args: dateOnlyArgs,
  globals: desktopGlobals,
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const findVisibleByLabelText = async (label: string) => {
      const elements = await canvas.findAllByLabelText(label);
      const visible = elements.find((element) => element.getClientRects().length > 0);
      await expect(visible).toBeDefined();
      return visible as HTMLElement;
    };
    const getStaffRowTexts = () =>
      Array.from(canvasElement.querySelectorAll("tbody tr")).map(
        (row) => row.querySelector("td")?.textContent?.replace(/\s+/g, "") ?? "",
      );

    await expect(canvas.queryByRole("tab", { name: "日別" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tab", { name: "一覧" })).not.toBeInTheDocument();
    // 並べ替えは日付の見出しで行い、表の上には左の週タブと同じ期間を出す。
    await expect(canvas.queryByText("この日で並べ替える")).not.toBeInTheDocument();
    await expect(await canvas.findAllByText("6/1-7")).toHaveLength(2);
    await expect((await canvas.findByRole("button", { name: "6/3(水)で並べ替える" })).closest("thead")).not.toBeNull();
    await expect(getStaffRowTexts()[0]).toContain("田中太郎");
    await userEvent.click(await canvas.findByRole("button", { name: "6/3(水)で並べ替える" }));
    await waitFor(() => expect(getStaffRowTexts()[0]).toContain("鈴木次郎"));
    await expect(canvas.queryByText("3日")).not.toBeInTheDocument();
    await expect(canvas.queryByText("休み")).not.toBeInTheDocument();
    await expect(await findVisibleByLabelText("田中 太郎 6/1(月) 期間外")).toBeInTheDocument();
    await expect(await findVisibleByLabelText("田中 太郎 6/7(日) 勤務なし")).toHaveTextContent("-");
    await expect((await canvas.findAllByText("6/2")).length).toBeGreaterThan(1);
    await expect((await canvas.findAllByText("希望なし")).length).toBeGreaterThan(0);

    const tanakaJunSecond = await findVisibleByLabelText("田中 太郎 6/2(火) 勤務あり");
    await userEvent.click(tanakaJunSecond);
    await expect(await findVisibleByLabelText("田中 太郎 6/2(火) 勤務なし")).toBeInTheDocument();

    const yamadaJunThird = await findVisibleByLabelText("山田 一郎 6/3(水) 勤務なし");
    await userEvent.click(yamadaJunThird);
    await expect(await findVisibleByLabelText("山田 一郎 6/3(水) 勤務あり")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "6/8-14を表示" }));
    const tanakaJunEighth = await findVisibleByLabelText("田中 太郎 6/8(月) 勤務なし");
    await userEvent.click(tanakaJunEighth);
    await expect(await findVisibleByLabelText("田中 太郎 6/8(月) 勤務あり")).toBeInTheDocument();
    await expect(await findVisibleByLabelText("田中 太郎 6/9(火) 期間外")).toBeInTheDocument();
    await expect((await canvas.findAllByText("希望なし")).length).toBeGreaterThan(1);
  },
};

export const WithDateNotes: Story = {
  args: dateOnlyDateNotesArgs,
  globals: desktopGlobals,
};

/** 希望の右のメモ列に、表示中の週のメモを行ごとに日付順で並べる。セルの角の印でもメモのある日を示す。 */
export const DateNotesInteractive: Story = {
  args: dateOnlyDateNotesArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headers = Array.from(canvasElement.querySelectorAll<HTMLElement>("thead tr:first-child th")).map(
      (cell) => cell.textContent,
    );
    await expect(headers.slice(0, 3)).toEqual(["ユーザー", "希望", "連絡事項"]);
    // 左の3見出しは人数の行まで結合し、「人数」の見出しは置かない。
    const mergedHeaders = Array.from(canvasElement.querySelectorAll<HTMLTableCellElement>("thead tr:first-child th"));
    await expect(mergedHeaders.slice(0, 3).map((cell) => cell.rowSpan)).toEqual([2, 2, 2]);
    await expect(canvas.queryByText("人数", { exact: true })).not.toBeInTheDocument();

    const tanakaRow = (await canvas.findAllByText("田中 太郎"))[0].closest("tr");
    if (!tanakaRow) throw new Error("expected staff row");
    const noteItems = Array.from(tanakaRow.querySelectorAll("li")).map((item) => item.textContent ?? "");
    await expect(noteItems).toHaveLength(2);
    await expect(noteItems[0]).toBe("6/217時以降なら入れます");
    await expect(noteItems[1].startsWith("6/4")).toBe(true);
    await expect(await canvas.findByText("家の用事で18時まで入れません")).toHaveAttribute("data-clarity-mask", "true");

    await expect(await canvas.findByRole("button", { name: "6/4(木)で並べ替える、連絡事項1件" })).toBeInTheDocument();
    await expect((await canvas.findAllByLabelText("田中 太郎 6/2(火) 勤務あり、連絡事項あり")).length).toBeGreaterThan(
      0,
    );
    await expect(canvas.queryByText(/のメモはありません/)).not.toBeInTheDocument();

    // 連絡事項を非表示にしたときだけ、名前セルの右端に表示中の週の件数を示すアイコンを置き、ホバーで日付ごとの本文を表示する。
    await expect(canvas.queryByRole("button", { name: "連絡事項2件" })).not.toBeInTheDocument();
    await hideDateNotes(canvasElement);
    const tanakaNoteIcon = await within(tanakaRow.querySelector("td") as HTMLElement).findByRole("button", {
      name: "連絡事項2件",
    });
    await userEvent.hover(tanakaNoteIcon);
    const tooltip = await within(document.body).findByRole("tooltip");
    await expect(tooltip).toHaveTextContent(/^連絡事項6\/2\(火\)17時以降なら入れます/);
    await expect(tooltip).toHaveTextContent("6/4(木)");
    await expect(tooltip).not.toHaveTextContent("田中 太郎");
  },
};
