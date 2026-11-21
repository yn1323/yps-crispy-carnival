import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import { dateOnlyBoardSimpleArgs } from "./dateOnlyBoardFixtures";
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

// 確認事項（ワーニング）: 週のレールのバッジの表示確認。セルには、割り当てのピルの橙の点で示す。
// （日付選択は時間・勤務パターンの概念がないため NOT_SUBMITTED / OFF_REQUEST のみ）
/** 依頼の画像と同じ週のシンプル表示。「○」のピル、希望の輪、連絡事項の列、たたんだ「希望なし」を1画面で確かめる。 */
export const Board: Story = {
  args: dateOnlyBoardSimpleArgs,
  globals: desktopGlobals,
};

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
    const getStaffRowTexts = () =>
      Array.from(canvasElement.querySelectorAll("tbody tr")).map(
        (row) => row.querySelector("td")?.textContent?.replace(/\s+/g, "") ?? "",
      );

    await expect(canvas.queryByRole("tab", { name: "日別" })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("tab", { name: "一覧" })).not.toBeInTheDocument();
    // 並べ替えは日付の見出しで行い、表の上には左の週タブと同じ期間を出す。見出しの行は、上端に留める。
    await expect(await canvas.findAllByText("6/1-7")).toHaveLength(2);
    const sortButton = await canvas.findByRole("button", { name: "6/3(水)で並べ替える" });
    await expect(getComputedStyle(sortButton.closest("thead") as HTMLElement).position).toBe("sticky");
    await expect(getStaffRowTexts()[0]).toContain("田中太郎");
    await userEvent.click(sortButton);
    await waitFor(() => expect(getStaffRowTexts()[0]).toContain("鈴木次郎"));
    await expect(sortButton).toHaveAttribute("aria-pressed", "true");

    // 期間外の日（6/1）と定休日（6/7）は、セルに何も描かず、押せるものも置かない。
    await expect(canvas.queryByRole("button", { name: /^田中 太郎 6\/1\(月\)/ })).not.toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^田中 太郎 6\/7\(日\)/ })).not.toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "田中 太郎 6/2(火) 勤務あり" }));
    await expect(await canvas.findByRole("button", { name: "田中 太郎 6/2(火) 勤務なし" })).toBeInTheDocument();

    // 2週目は6/8だけが期間内で、その日に希望のない田中さんは「希望なし」にたたまれている。開いてから入れる。
    await userEvent.click(await canvas.findByRole("button", { name: "6/8-14を表示" }));
    await userEvent.click(await canvas.findByRole("button", { name: /^希望なし \d+人/ }));
    await userEvent.click(await canvas.findByRole("button", { name: "田中 太郎 6/8(月) 勤務なし" }));
    await expect(await canvas.findByRole("button", { name: "田中 太郎 6/8(月) 勤務あり" })).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: /^田中 太郎 6\/9\(火\)/ })).not.toBeInTheDocument();
  },
};

/**
 * シンプル表示の付け外し。「希望」を押すと「○」が入り、もう一度押すと外れる。希望のない日に入れると、橙の点が出る。
 * 割り当ての前後で、行の高さは変わらない。
 */
export const ToggleInteractive: Story = {
  name: "Toggle Interactive",
  args: dateOnlyBoardSimpleArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const requested = await canvas.findByRole("button", { name: "林 心春 12/2(水) 勤務なし" });
    const row = requested.closest("tr") as HTMLElement;
    const rowHeight = row.getBoundingClientRect().height;
    const ringRect = requested.getBoundingClientRect();
    await expect(requested).toHaveTextContent("希望");
    await expect(requested).toHaveAccessibleDescription("希望あり、連絡事項あり");

    await userEvent.click(requested);
    const assigned = await canvas.findByRole("button", { name: "林 心春 12/2(水) 勤務あり" });
    await expect(assigned).toHaveTextContent("○");
    await expect(assigned.querySelector("[data-assignment-dot]")).toBeNull();
    // 割り当ての前後で、輪の位置と大きさ、行の高さは変わらない。
    await expect(assigned.getBoundingClientRect()).toEqual(ringRect);
    await expect(row.getBoundingClientRect().height).toBe(rowHeight);

    await userEvent.click(assigned);
    await expect(await canvas.findByRole("button", { name: "林 心春 12/2(水) 勤務なし" })).toHaveTextContent("希望");

    // 希望のない日に入れると、橙の点が出る。点にマウスを乗せると、理由が出る。
    const empty = await canvas.findByRole("button", { name: "林 心春 12/4(金) 勤務なし" });
    await expect(empty).toHaveTextContent("");
    await userEvent.click(empty);
    const unrequested = await canvas.findByRole("button", { name: "林 心春 12/4(金) 勤務あり" });
    const dot = unrequested.querySelector<HTMLElement>('[data-assignment-dot="orange"]');
    await expect(dot).not.toBeNull();
    await userEvent.hover(dot?.parentElement as HTMLElement);
    await expect(await within(document.body).findByRole("tooltip")).toHaveTextContent("希望していない日です");
    await expect(row.getBoundingClientRect().height).toBe(rowHeight);

    // 名前の横の注意のアイコンと、「×」「−」の表記は出さない。
    await expect(canvas.queryByRole("button", { name: /^確認事項\d+件$/ })).not.toBeInTheDocument();
    const cellTexts = Array.from(canvasElement.querySelectorAll("tbody button")).map((button) => button.textContent);
    await expect(cellTexts.filter((text) => text === "×" || text === "-" || text === "−")).toEqual([]);
  },
};

/** 「希望なし」の人は、最初はたたまれている。開くと通常の行になり、勤務を入れると上の行へ移る。 */
export const FoldedGroupInteractive: Story = {
  name: "Folded Group Interactive",
  args: dateOnlyBoardSimpleArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = await canvas.findByRole("button", { name: /^希望なし 2人/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveTextContent("中村・高橋");
    await expect(canvas.queryByRole("button", { name: /^中村 蓮 / })).not.toBeInTheDocument();
    // 未提出の人は「希望なし」に入れず、「未提出」を添えて通常の行に出す。
    await expect(await canvas.findByRole("button", { name: "伊藤 大輔 12/1(火) 勤務なし" })).toBeInTheDocument();

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(await canvas.findByRole("button", { name: "中村 蓮 12/2(水) 勤務なし" }));

    // 勤務を入れた中村さんは通常の行へ移り、まとまりは1人になる。
    await expect(await canvas.findByRole("button", { name: /^希望なし 1人/ })).toBeInTheDocument();
    const assigned = await canvas.findByRole("button", { name: "中村 蓮 12/2(水) 勤務あり" });
    const toggleRow = (await canvas.findByRole("button", { name: /^希望なし 1人/ })).closest("tr") as HTMLElement;
    await expect(
      (assigned.closest("tr") as HTMLElement).compareDocumentPosition(toggleRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    // 週を変えると、まとまりは閉じた状態に戻る。
    await userEvent.click(await canvas.findByRole("button", { name: "12/7-13を表示" }));
    await expect(await canvas.findByRole("button", { name: /^希望なし \d+人/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  },
};

export const WithDateNotes: Story = {
  args: dateOnlyDateNotesArgs,
  globals: desktopGlobals,
};

/** 連絡事項の列は右端に置き、表示中の週の連絡事項を行ごとに日付順で、全文を並べる。セルの角の印でも連絡事項のある日を示す。 */
export const DateNotesInteractive: Story = {
  args: dateOnlyBoardSimpleArgs,
  globals: desktopGlobals,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const getHeaders = () =>
      Array.from(canvasElement.querySelectorAll<HTMLElement>("thead th")).map((cell) => cell.textContent ?? "");
    // 列は「スタッフ → 日付 → 連絡事項」の順で、「希望」の列は置かない。
    const headers = getHeaders();
    await expect(headers[0]).toBe("スタッフ");
    await expect(headers.at(-1)).toBe("連絡事項");
    await expect(headers).toHaveLength(9);
    await expect(headers.filter((text) => text === "希望" || text === "確定")).toEqual([]);

    const yamaguchiRow = (await canvas.findByRole("button", { name: "山口 美月 12/1(火) 勤務あり" })).closest("tr");
    if (!yamaguchiRow) throw new Error("expected staff row");
    const noteItems = Array.from(yamaguchiRow.querySelectorAll("li")).map((item) => item.textContent ?? "");
    await expect(noteItems).toEqual([
      "12/1朝早くから入れます。10時までに上がれると助かります",
      "12/2午後からなら入れます",
    ]);
    const note = await canvas.findByText("午後からなら入れます");
    await expect(note).toHaveAttribute("data-clarity-mask", "true");
    // 連絡事項の列は、最後の日付の列より右にある。
    const lastDateCell = (await canvas.findByRole("button", { name: "山口 美月 12/6(日) 勤務なし" })).closest("td");
    await expect(note.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      (lastDateCell as HTMLElement).getBoundingClientRect().right,
    );

    // 連絡事項のある日のセルだけ、角に印が付く。
    const markedCells = Array.from(yamaguchiRow.querySelectorAll("td"))
      .filter((cell) => cell.querySelector("[data-date-note-mark]"))
      .map((cell) => cell.querySelector("button")?.getAttribute("aria-label"));
    await expect(markedCells).toEqual(["山口 美月 12/1(火) 勤務あり", "山口 美月 12/2(水) 勤務あり"]);
    await expect(await canvas.findByRole("button", { name: "12/2(水)で並べ替える、連絡事項2件" })).toBeInTheDocument();

    // 連絡事項を非表示にすると、列と角の印が消え、名前の横のアイコンから日付ごとの本文を読める。
    await expect(canvas.queryByRole("button", { name: "連絡事項2件" })).not.toBeInTheDocument();
    await hideDateNotes(canvasElement);
    await waitFor(() => expect(getHeaders().at(-1)).toBe(""));
    await expect(yamaguchiRow.querySelector("[data-date-note-mark]")).toBeNull();
    const noteIcon = await within(yamaguchiRow.querySelector("td") as HTMLElement).findByRole("button", {
      name: "連絡事項2件",
    });
    await userEvent.hover(noteIcon);
    const tooltip = await within(document.body).findByRole("tooltip");
    await expect(tooltip).toHaveTextContent(/^連絡事項12\/1\(火\)朝早くから入れます/);
    await expect(tooltip).toHaveTextContent("12/2(水)");
  },
};
