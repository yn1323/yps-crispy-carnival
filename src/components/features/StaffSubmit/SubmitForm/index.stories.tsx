import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { previousWeeklyPattern, submitStoryBaseData } from "../fixtures";
import { SubmitForm } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmitForm",
  component: SubmitForm,
  tags: ["vrt-mobile2"],
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitForm>;

export default meta;
type Story = StoryObj<typeof meta>;

const noop = async () => {};
let lateInitialSubmitCount = 0;

const shiftTypePattern = {
  kind: "shiftType" as const,
  options: [
    { id: "morning", name: "早番", startTime: "09:00", endTime: "14:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "14:00", endTime: "25:00", sortOrder: 1 },
  ],
};

export const PreviousPatternApplied: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      existingRequests: [
        { date: "2026-04-07", startTime: "09:00", endTime: "17:00" },
        { date: "2026-04-09", startTime: "10:00", endTime: "18:00" },
        { date: "2026-04-11", startTime: "12:00", endTime: "21:00" },
      ],
      previousWeeklyPattern,
    },
    onSubmit: noop,
  },
};

export const LegalConsentRequired: Story = {
  args: {
    data: { ...submitStoryBaseData, legalConsentRequired: true },
    onSubmit: noop,
  },
};

export const LateInitialInteractive: Story = {
  args: {
    data: { ...submitStoryBaseData, isBeforeDeadline: false, hasSubmitted: false },
    onSubmit: async () => {
      lateInitialSubmitCount += 1;
    },
  },
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    lateInitialSubmitCount = 0;
    const canvas = within(canvasElement);
    const screen = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "希望シフトを提出" }));
    await expect(await screen.findByText("提出期限を過ぎています")).toBeInTheDocument();
    await expect(await screen.findByText(/提出期限を過ぎています。/)).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "この内容で提出する" })).not.toBeInTheDocument());
    await expect(lateInitialSubmitCount).toBe(0);

    await userEvent.click(await canvas.findByRole("button", { name: "希望シフトを提出" }));
    await userEvent.click(await screen.findByRole("button", { name: "この内容で提出する" }));
    await waitFor(() => expect(lateInitialSubmitCount).toBe(1));
    // 提出後はダイアログが閉じ切るまで待つ。非同期の submit→close を待たずに play を終えると
    // VRT 撮影時にダイアログの開/閉状態がブレてフレーキーな差分になるため。
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "提出期限を過ぎています" })).not.toBeInTheDocument(),
    );
  },
};

export const DateOnly: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      submissionPattern: { kind: "dateOnly" },
      existingSelection: { kind: "dateOnly", workingDates: ["2026-04-07", "2026-04-09"] },
      shopClosedDates: ["2026-04-10"],
    },
    onSubmit: noop,
  },
};

export const ShiftType: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      submissionPattern: shiftTypePattern,
      existingSelection: {
        kind: "shiftType",
        selections: [
          { date: "2026-04-07", optionId: "morning" },
          { date: "2026-04-09", optionId: "late" },
        ],
      },
      shopClosedDates: ["2026-04-10"],
    },
    onSubmit: noop,
  },
};

export const ShiftTypeDefaultRest: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      submissionPattern: shiftTypePattern,
      existingSelection: { kind: "shiftType", selections: [] },
      shopClosedDates: ["2026-04-10"],
    },
    onSubmit: noop,
  },
};

export const ShiftTypeInteractive: Story = {
  args: ShiftTypeDefaultRest.args,
  parameters: {
    screenshot: { skip: true },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByLabelText("4/7(火)を出勤希望にする"));
    await expect(await canvas.findByLabelText("4/7(火)の早番 選択済み")).toBeInTheDocument();
    await expect(await canvas.findByLabelText("4/7(火)の遅番 未選択")).toBeInTheDocument();
    await expect(await canvas.findByText("14:00〜翌1:00")).toBeInTheDocument();

    await userEvent.click(await canvas.findByLabelText("4/7(火)の遅番 未選択"));
    await expect(await canvas.findByLabelText("4/7(火)の遅番 選択済み")).toBeInTheDocument();

    await userEvent.click(await canvas.findByLabelText("4/7(火)を休みに戻す"));
    await expect(await canvas.findByLabelText("4/7(火)を出勤希望にする")).toBeInTheDocument();

    await userEvent.click(await canvas.findByLabelText("4/8(水)を出勤希望にする"));
    await expect(await canvas.findByLabelText("4/8(水)の早番 選択済み")).toBeInTheDocument();
    await expect(await canvas.findByLabelText("4/8(水)の遅番 選択済み")).toBeInTheDocument();
  },
};

const dateNoteYearEndData = {
  ...submitStoryBaseData,
  periodStart: "2026-12-25",
  periodEnd: "2026-12-31",
  deadline: "2026-12-20",
  hasSubmitted: true,
  existingRequests: [
    { date: "2026-12-28", startTime: "17:00", endTime: "22:00" },
    { date: "2026-12-29", startTime: "09:00", endTime: "18:00" },
  ],
  existingSelection: {
    kind: "time" as const,
    requests: [
      { date: "2026-12-28", startTime: "17:00", endTime: "22:00" },
      { date: "2026-12-29", startTime: "09:00", endTime: "18:00" },
    ],
  },
  existingDateNotes: [{ date: "2026-12-30", note: "テスト期間のため休みたいです" }],
};

/** 幅360pxで日付が最も長い年末の募集。時間指定の出勤行にメモボタンが収まることを確認する。 */
export const DateNoteInteractive: Story = {
  args: { data: dateNoteYearEndData, onSubmit: noop },
  decorators: [
    (Story) => (
      <div style={{ width: 360 }}>
        <Story />
      </div>
    ),
  ],
  parameters: { screenshot: { skip: true } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    for (const card of canvasElement.querySelectorAll<HTMLElement>("[data-day-card]")) {
      await expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth);
    }
    await expect(canvas.queryByText("変更はまだ送られていません")).not.toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "12/28(月)のメモを書く" }));
    const input = await screen.findByPlaceholderText("17時以降なら入れます");
    await expect(input).toHaveAttribute("data-clarity-mask", "true");
    await expect(input).toHaveAttribute("maxLength", "100");
    await userEvent.type(input, "17時以降なら入れます");
    await expect(await screen.findByText("11/100")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "完了" }));

    const noteText = await canvas.findByText("17時以降なら入れます");
    await expect(noteText).toHaveAttribute("data-clarity-mask", "true");
    await expect(await canvas.findByRole("button", { name: "12/28(月)のメモを編集" })).toBeInTheDocument();
    await expect(await canvas.findByText("変更はまだ送られていません")).toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: /^12\/28\(月\)のメモ：\s*17時以降なら入れます$/ }));
    await userEvent.click(await screen.findByRole("button", { name: "メモを消す" }));
    await userEvent.click(await screen.findByRole("button", { name: "完了" }));
    await waitFor(() => expect(canvas.queryByText("17時以降なら入れます")).not.toBeInTheDocument());
    await expect(canvas.queryByText("変更はまだ送られていません")).not.toBeInTheDocument();

    await userEvent.click(await canvas.findByRole("button", { name: "12/30(水)を出勤希望にする" }));
    await expect(await canvas.findByText("テスト期間のため休みたいです")).toBeInTheDocument();
  },
};

/** 3つの提出方法で、メモがある日とない日の見た目を確認する。 */
export const DateNotesTime: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      existingRequests: [{ date: "2026-04-07", startTime: "17:00", endTime: "22:00" }],
      existingSelection: { kind: "time", requests: [{ date: "2026-04-07", startTime: "17:00", endTime: "22:00" }] },
      existingDateNotes: [
        { date: "2026-04-07", note: "17時以降なら入れます" },
        {
          date: "2026-04-08",
          note: "火曜は授業が16時半に終わるので17時以降なら入れます。ゼミの発表準備があるため、できれば遅番だけにしてもらえると助かります。",
        },
      ],
    },
    onSubmit: noop,
  },
};

export const DateNotesDateOnly: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      submissionPattern: { kind: "dateOnly" },
      existingSelection: { kind: "dateOnly", workingDates: ["2026-04-07"], unmatchedRequests: [] },
      existingDateNotes: [
        { date: "2026-04-07", note: "17時以降なら入れます" },
        { date: "2026-04-09", note: "家の用事で18時まで入れません" },
      ],
    },
    onSubmit: noop,
  },
};

export const DateNotesShiftType: Story = {
  args: {
    data: {
      ...submitStoryBaseData,
      submissionPattern: shiftTypePattern,
      existingSelection: {
        kind: "shiftType",
        selections: [{ date: "2026-04-07", optionId: "late" }],
        unmatchedRequests: [],
      },
      existingDateNotes: [
        { date: "2026-04-07", note: "17時以降なら入れます" },
        { date: "2026-04-08", note: "テスト期間のため休みたいです" },
      ],
    },
    onSubmit: noop,
  },
};
