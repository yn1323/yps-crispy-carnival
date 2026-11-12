import type { Meta, StoryObj } from "@storybook/react-vite";
import { submitStoryBaseData, submittedRequests } from "../fixtures";
import type { SubmissionData } from "../types";
import { ReadOnlySubmitView } from "./index";

const meta = {
  title: "features/StaffSubmit/ReadOnlySubmitView",
  component: ReadOnlySubmitView,
  tags: ["vrt-mobile2"],
  parameters: {
    layout: "fullscreen",
  },
  globals: {
    viewport: { value: "mobile2", isRotated: false },
  },
} satisfies Meta<typeof ReadOnlySubmitView>;

export default meta;
type Story = StoryObj<typeof meta>;

const timeData: SubmissionData = {
  ...submitStoryBaseData,
  isBeforeDeadline: false,
  hasSubmitted: true,
  existingRequests: submittedRequests,
};

const dateOnlyData: SubmissionData = {
  ...submitStoryBaseData,
  submissionPattern: { kind: "dateOnly" },
  existingSelection: { kind: "dateOnly", workingDates: ["2026-04-07", "2026-04-09"] },
  isBeforeDeadline: false,
  hasSubmitted: true,
};

const shiftTypeData: SubmissionData = {
  ...submitStoryBaseData,
  submissionPattern: {
    kind: "shiftType",
    options: [
      { id: "morning", name: "早番", startTime: "09:00", endTime: "14:00", sortOrder: 0 },
      { id: "late", name: "遅番", startTime: "14:00", endTime: "22:00", sortOrder: 1 },
    ],
  },
  existingSelection: {
    kind: "shiftType",
    selections: [
      { date: "2026-04-07", optionId: "morning" },
      { date: "2026-04-09", optionId: "late" },
    ],
  },
  isBeforeDeadline: false,
  hasSubmitted: true,
};

export const Time: Story = {
  args: { data: timeData },
};

export const DateOnly: Story = {
  args: { data: dateOnlyData },
};

export const ShiftType: Story = {
  args: { data: shiftTypeData },
};

/**
 * 3つの提出方法で、提出済みのメモが閲覧専用のテキストとして表示されることを確認する。
 * 出勤日（4/7）と休みの日（4/8）の両方にメモを入れ、メモのない日には行が出ないことも見る。
 */
export const DateNotesTime: Story = {
  args: {
    data: {
      ...timeData,
      existingDateNotes: [
        { date: "2026-04-07", note: "17時以降なら入れます" },
        {
          date: "2026-04-08",
          note: "火曜は授業が16時半に終わるので17時以降なら入れます。ゼミの発表準備があるため、できれば遅番だけにしてもらえると助かります。",
        },
      ],
    },
  },
};

export const DateNotesDateOnly: Story = {
  args: {
    data: {
      ...dateOnlyData,
      existingDateNotes: [
        { date: "2026-04-07", note: "17時以降なら入れます" },
        { date: "2026-04-08", note: "家の用事で18時まで入れません" },
      ],
    },
  },
};

export const DateNotesShiftType: Story = {
  args: {
    data: {
      ...shiftTypeData,
      existingDateNotes: [
        { date: "2026-04-07", note: "17時以降なら入れます" },
        { date: "2026-04-08", note: "テスト期間のため休みたいです" },
      ],
    },
  },
};
