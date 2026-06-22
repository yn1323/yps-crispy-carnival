import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { previousWeeklyPattern, submitStoryBaseData } from "../storyData";
import { SubmitFormView } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmitFormView",
  component: SubmitFormView,
  tags: ["vrt-mobile2"],
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof SubmitFormView>;

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
    chromatic: { disableSnapshot: true },
  },
  play: async ({ canvasElement }) => {
    lateInitialSubmitCount = 0;
    const canvas = within(canvasElement);
    const screen = within(document.body);

    await userEvent.click(await canvas.findByRole("button", { name: "希望シフトを提出" }));
    await expect(await screen.findByText("提出締切を過ぎています")).toBeInTheDocument();
    await expect(
      await screen.findByText(
        "提出締切を過ぎています。提出後、このリンクでは変更できません。変更が必要な場合はシフト作成担当者に連絡してください。",
      ),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByRole("button", { name: "キャンセル" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "この内容で提出する" })).not.toBeInTheDocument());
    await expect(lateInitialSubmitCount).toBe(0);

    await userEvent.click(await canvas.findByRole("button", { name: "希望シフトを提出" }));
    await userEvent.click(await screen.findByRole("button", { name: "この内容で提出する" }));
    await expect(lateInitialSubmitCount).toBe(1);
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
    chromatic: { disableSnapshot: true },
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
