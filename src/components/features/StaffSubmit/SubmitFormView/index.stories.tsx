import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { previousWeeklyPattern, submitStoryBaseData } from "../storyData";
import { SubmitFormView } from "./index";

const meta = {
  title: "features/StaffSubmit/SubmitFormView",
  component: SubmitFormView,
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

const shiftTypePattern = {
  kind: "shiftType" as const,
  options: [
    { id: "morning", name: "早番", startTime: "09:00", endTime: "14:00", sortOrder: 0 },
    { id: "late", name: "遅番", startTime: "14:00", endTime: "22:00", sortOrder: 1 },
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

    await userEvent.click(await canvas.findByLabelText("4/7(火)の遅番 未選択"));
    await expect(await canvas.findByLabelText("4/7(火)の遅番 選択済み")).toBeInTheDocument();

    await userEvent.click(await canvas.findByLabelText("4/7(火)を休みに戻す"));
    await expect(await canvas.findByLabelText("4/7(火)を出勤希望にする")).toBeInTheDocument();

    await userEvent.click(await canvas.findByLabelText("4/8(水)を出勤希望にする"));
    await expect(await canvas.findByLabelText("4/8(水)の早番 選択済み")).toBeInTheDocument();
    await expect(await canvas.findByLabelText("4/8(水)の遅番 選択済み")).toBeInTheDocument();
  },
};
