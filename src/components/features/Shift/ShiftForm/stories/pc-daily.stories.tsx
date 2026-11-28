import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ShiftForm } from "..";
import {
  allPatternsArgs,
  emptyOrAllUnsubmittedArgs,
  fullscreenParameters,
  halfHourBusinessHoursArgs,
  overnightArgs,
  shiftFormDecorators,
  timeDateNotesArgs,
  timeRestFoldArgs,
  validationErrorAndWarningArgs,
  validationErrorArgs,
  validationWarningArgs,
} from "./shared";

const meta = {
  title: "Features/Shift/ShiftForm/Time/PC/Daily",
  component: ShiftForm,
  parameters: fullscreenParameters,
  decorators: shiftFormDecorators,
} satisfies Meta<typeof ShiftForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TimeBasic: Story = {
  name: "Basic",
  args: allPatternsArgs,
};

/** 見出しの店舗名が長いときは、店舗名だけを省略し、期間は全部を出す。 */
export const TimeLongShopName: Story = {
  name: "Long Shop Name",
  args: {
    ...allPatternsArgs,
    header: {
      shopName: "上限の文字数で表示を確かめるための長い店舗名です".repeat(4),
      periodTitle: "1/23 〜 2/5",
      backLabel: "前の画面へ戻る",
      backAriaLabel: "前の画面へ戻る",
    },
  },
};

export const TimeHalfHourBusinessHours: Story = {
  name: "Half Hour Business Hours",
  args: halfHourBusinessHoursArgs,
};

export const TimeOvernight: Story = {
  name: "Overnight",
  args: overnightArgs,
};

export const TimeEmptyOrAllUnsubmitted: Story = {
  name: "Empty Or All Unsubmitted",
  args: emptyOrAllUnsubmittedArgs,
};

export const TimeReadOnly: Story = {
  name: "Read Only",
  args: { ...allPatternsArgs, isReadOnly: true, currentStaffId: "staff1" },
};

export const TimeConfirmed: Story = {
  name: "Confirmed",
  args: { ...allPatternsArgs, isConfirmed: true },
};

// 確定前バリデーションエラー: パネル＋DateRailバッジ＋該当行ハイライトの統合表示
export const TimeWithValidationErrors: Story = {
  name: "With Validation Errors",
  args: validationErrorArgs,
};

// エラー行クリックで該当日付の日別ビューへジャンプする
export const TimeValidationErrorJump: Story = {
  name: "Validation Error Jump",
  args: validationErrorArgs,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("1月21日")).toBeVisible();

    await userEvent.click(await canvas.findByRole("button", { name: /1\/23\(金\) Dさん/ }));

    await expect(await canvas.findByText("1月23日")).toBeVisible();
  },
};

// 確認事項（ワーニング）: DateRailオレンジバッジ＋スタッフ名セルの理由アイコン
export const TimeWithValidationWarnings: Story = {
  name: "With Validation Warnings",
  args: validationWarningArgs,
};

// エラーと確認事項が同時にあるとき（エラーパネル＋ワーニングのバッジ/理由アイコン）
export const TimeWithErrorsAndWarnings: Story = {
  name: "With Errors And Warnings",
  args: validationErrorAndWarningArgs,
};

export const WithDateNotes: Story = {
  args: timeDateNotesArgs,
};

/** 連絡事項の列は2行まで表示し、メモの有無で行の高さを変えない。メモがない募集では列を出さない。 */
export const DateNotesInteractive: Story = {
  args: timeDateNotesArgs,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("連絡事項")).toBeInTheDocument();
    const note = await canvas.findByText("17時以降なら入れます");
    await expect(note).toHaveAttribute("data-clarity-mask", "true");

    const rowHeight = (staffId: string) =>
      canvasElement.querySelector<HTMLElement>(`[data-tour="shift-row-${staffId}"]`)?.getBoundingClientRect().height;
    await expect(rowHeight("staff2")).toBe(rowHeight("staff3"));
    await expect(rowHeight("staff1")).toBe(rowHeight("staff3"));

    await userEvent.hover(note);
    await expect(await within(document.body).findByText("Aさんの連絡事項・1/23(金)")).toBeInTheDocument();
  },
};

/**
 * 表示設定で連絡事項を隠すと連絡事項の列ごと消え、もう一度選ぶと戻る。初期状態は表示。
 * 隠している間だけ、名前の右のアイコンから連絡事項を読める。
 */
export const DateNotesVisibilityToggle: Story = {
  args: timeDateNotesArgs,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);
    await expect(await canvas.findByText("17時以降なら入れます")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "連絡事項1件" })).not.toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
    const item = await body.findByRole("menuitemcheckbox", { name: "連絡事項を表示" });
    await expect(item).toHaveAttribute("aria-checked", "true");
    await userEvent.click(item);
    await waitFor(() => expect(canvas.queryByText("17時以降なら入れます")).not.toBeInTheDocument());
    await expect(canvas.queryByText("連絡事項", { exact: true })).not.toBeInTheDocument();
    const noteIcons = await canvas.findAllByRole("button", { name: "連絡事項1件" });
    await expect(noteIcons).toHaveLength(2);
    await userEvent.hover(noteIcons[0]);
    // 日別表示のアイコンのツールチップには、見出しと表示中の日のメモ本文を出し、日付は出さない。
    await expect(await body.findByRole("tooltip")).toHaveTextContent(/^連絡事項17時以降なら入れます$/);
    await userEvent.unhover(noteIcons[0]);

    await userEvent.click(await canvas.findByRole("button", { name: "表示設定" }));
    const hiddenItem = await body.findByRole("menuitemcheckbox", { name: "連絡事項を表示" });
    await expect(hiddenItem).toHaveAttribute("aria-checked", "false");
    await userEvent.click(hiddenItem);
    await expect(await canvas.findByText("17時以降なら入れます")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "連絡事項1件" })).not.toBeInTheDocument();
  },
};

export const WithoutDateNotesHidesNoteColumn: Story = {
  args: allPatternsArgs,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText("連絡事項", { exact: true })).not.toBeInTheDocument();
  },
};

/** 休み希望の人は、表の下に「休み希望 2人」としてたたむ。連絡事項のある人と未提出の人は、たたまない。 */
export const TimeRestFolded: Story = {
  name: "Rest Folded",
  args: timeRestFoldArgs,
};

/** たたんだ休み希望の人は、開くと通常の行として並び、勤務を入れられる。 */
export const RestFoldInteractive: Story = {
  args: timeRestFoldArgs,
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const findRow = (staffId: string) => canvasElement.querySelector(`[data-tour="shift-row-${staffId}"]`);
    const toggle = await canvas.findByRole("button", { name: /^休み希望 2人/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(toggle).toHaveTextContent("中村・高橋");
    await expect(findRow("rest1")).toBeNull();
    await expect(findRow("rest2")).toBeNull();
    // 連絡事項のある休み希望の人（伊藤さん）と、未提出の人（Cさん）は、たたまない。
    await expect(findRow("rest3")).not.toBeNull();
    await expect(findRow("staff3")).not.toBeNull();

    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(findRow("rest1")).not.toBeNull());
    await expect(findRow("rest2")).not.toBeNull();
    // 開いた行は、まとまりの見出しより下に並ぶ。
    await expect(
      toggle.compareDocumentPosition(findRow("rest1") as Element) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(toggle);
    await waitFor(() => expect(findRow("rest1")).toBeNull());
  },
};
