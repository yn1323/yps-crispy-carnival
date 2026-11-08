import type { Decorator } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { buildAssignmentIssue } from "@/convex/shiftBoard/validation";
import { DEFAULT_TIME_PATTERN } from "@/src/domains/shop/submissionPattern";
import type { ShiftForm } from "..";
import {
  mockDateOnlyDates,
  mockDateOnlyShifts,
  mockDateOnlyStaffs,
  mockDates,
  mockDatesMidWeekStart,
  mockHalfHourTimeRange,
  mockHolidays,
  mockOvernightDates,
  mockOvernightTimeRange,
  mockPositions,
  mockShifts,
  mockShiftsAllPatterns,
  mockShiftsHalfHourBusinessHours,
  mockShiftsOvernight,
  mockShiftTypeDates,
  mockShiftTypePattern,
  mockShiftTypeShifts,
  mockShiftTypeStaffs,
  mockStaffs,
  mockTimeRange,
} from "./fixtures";

type ShiftFormArgs = ComponentProps<typeof ShiftForm>;

export const fullscreenParameters = {
  layout: "fullscreen",
};

export const shiftFormDecorators = [
  (Story) => (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column" }}>
      <Story />
    </div>
  ),
] satisfies Decorator[];

export const mobileGlobals = {
  viewport: { value: "mobile2", isRotated: false },
};

export const desktopGlobals = {
  viewport: { value: "desktop", isRotated: false },
};

const baseArgs = {
  shopId: "shop1",
  staffs: mockStaffs,
  positions: mockPositions,
  initialShifts: mockShifts,
  dates: mockDates,
  timeRange: mockTimeRange,
  holidays: [],
  submissionPattern: DEFAULT_TIME_PATTERN,
} satisfies ShiftFormArgs;

export const allPatternsArgs = {
  ...baseArgs,
  dates: ["2026-01-23"],
  initialShifts: mockShiftsAllPatterns,
} satisfies ShiftFormArgs;

export const halfHourBusinessHoursArgs = {
  ...baseArgs,
  dates: ["2026-01-28"],
  initialShifts: mockShiftsHalfHourBusinessHours,
  timeRange: mockHalfHourTimeRange,
} satisfies ShiftFormArgs;

export const overnightArgs = {
  ...baseArgs,
  dates: mockOvernightDates,
  initialShifts: mockShiftsOvernight,
  timeRange: mockOvernightTimeRange,
} satisfies ShiftFormArgs;

export const emptyOrAllUnsubmittedArgs = {
  ...baseArgs,
  dates: ["2026-02-01"],
  staffs: mockStaffs.map((staff) => ({ ...staff, isSubmitted: false })),
  initialShifts: [],
} satisfies ShiftFormArgs;

// 確定前バリデーションエラーの統合表示用（パネル＋DateRailバッジ＋行ハイライト）
export const validationErrorArgs = {
  ...baseArgs,
  validationIssues: [
    buildAssignmentIssue("OVERLAP", "2026-01-21", "staff1"),
    buildAssignmentIssue("OUT_OF_BOARD_RANGE", "2026-01-21", "staff2"),
    buildAssignmentIssue("OVERLAP", "2026-01-23", "staff4"),
  ],
  onDismissValidationIssues: () => {},
} satisfies ShiftFormArgs;

// 確認事項（ワーニング）の統合表示用（DateRailバッジ＋スタッフ名セルの理由アイコン）
export const validationWarningArgs = {
  ...baseArgs,
  validationWarnings: [
    {
      code: "NOT_SUBMITTED" as const,
      date: "2026-01-21",
      staffId: "staff3",
      message: "未提出のまま勤務に入っています",
    },
    {
      code: "OUTSIDE_REQUESTED_TIME" as const,
      date: "2026-01-21",
      staffId: "staff1",
      message: "希望時間（10:00-18:00）の外に勤務があります",
    },
    {
      code: "OFF_REQUEST" as const,
      date: "2026-01-23",
      staffId: "staff5",
      message: "休み希望の日に勤務が入っています",
    },
  ],
  onDismissValidationIssues: () => {},
} satisfies ShiftFormArgs;

// エラーと確認事項が同時にある場合（エラーパネル＋ワーニングのバッジ/理由アイコン）
export const validationErrorAndWarningArgs = {
  ...baseArgs,
  validationIssues: validationErrorArgs.validationIssues,
  validationWarnings: validationWarningArgs.validationWarnings,
  onDismissValidationIssues: () => {},
} satisfies ShiftFormArgs;

export const overviewCalendarRangeArgs = {
  ...baseArgs,
  dates: mockDatesMidWeekStart,
  holidays: mockHolidays,
  initialViewMode: "overview" as const,
} satisfies ShiftFormArgs;

export const shiftTypeArgs = {
  ...baseArgs,
  staffs: mockShiftTypeStaffs,
  dates: mockShiftTypeDates,
  initialShifts: mockShiftTypeShifts,
  submissionPattern: mockShiftTypePattern,
} satisfies ShiftFormArgs;

export const dateOnlyArgs = {
  ...baseArgs,
  staffs: mockDateOnlyStaffs,
  dates: mockDateOnlyDates,
  initialShifts: mockDateOnlyShifts,
  holidays: ["2026-06-07"],
  submissionPattern: { kind: "dateOnly" },
} satisfies ShiftFormArgs;

// パターン選択の募集の確認事項（DateRailバッジ＋スタッフ名セルの理由アイコン）。
// 選択初日(2026-05-21)に2件、翌日(2026-05-22)に1件でバッジの出方も確認できる
export const shiftTypeValidationWarningArgs = {
  ...shiftTypeArgs,
  validationWarnings: [
    {
      code: "OUTSIDE_REQUESTED_TIME" as const,
      date: "2026-05-21",
      staffId: "staff1",
      message: "希望時間の外に勤務があります（遅番）",
    },
    {
      code: "OFF_REQUEST" as const,
      date: "2026-05-21",
      staffId: "staff2",
      message: "休み希望の日に勤務が入っています",
    },
    {
      code: "NOT_SUBMITTED" as const,
      date: "2026-05-22",
      staffId: "staff6",
      message: "未提出のまま勤務に入っています",
    },
  ],
  onDismissValidationIssues: () => {},
} satisfies ShiftFormArgs;

// 日付選択の募集の確認事項（時間・勤務パターンの概念がないため NOT_SUBMITTED / OFF_REQUEST のみ）
export const dateOnlyValidationWarningArgs = {
  ...dateOnlyArgs,
  validationWarnings: [
    {
      code: "OFF_REQUEST" as const,
      date: "2026-06-02",
      staffId: "staff2",
      message: "休み希望の日に勤務が入っています",
    },
    {
      code: "NOT_SUBMITTED" as const,
      date: "2026-06-03",
      staffId: "staff6",
      message: "未提出のまま勤務に入っています",
    },
  ],
  onDismissValidationIssues: () => {},
} satisfies ShiftFormArgs;

const normalizeVisibleText = (value: string): string => value.replace(/\s+/g, "").trim();

const hasVisibleText = (root: HTMLElement, expected: string): boolean =>
  Array.from(root.querySelectorAll("*")).some((element) => {
    if (!(element instanceof HTMLElement) || element.getClientRects().length === 0) return false;
    return normalizeVisibleText(element.textContent ?? "").includes(expected);
  });

export const expectVisibleText = async (root: HTMLElement, expected: string): Promise<void> => {
  await waitFor(() => expect(hasVisibleText(root, expected)).toBe(true));
};

const LONG_DATE_NOTE =
  "火曜は授業が16時半に終わるので17時以降なら入れます。ゼミの発表準備があるため、できれば遅番だけにしてもらえると助かります。";

// 日付メモ: 1行に収まるメモ、省略される長いメモ、休み希望のメモを含める。
export const timeDateNotesArgs = {
  ...allPatternsArgs,
  dateNotes: [
    { staffId: "staff1", date: "2026-01-23", note: "17時以降なら入れます" },
    { staffId: "staff2", date: "2026-01-23", note: LONG_DATE_NOTE },
  ],
} satisfies ShiftFormArgs;

export const shiftTypeDateNotesArgs = {
  ...shiftTypeArgs,
  dateNotes: [
    { staffId: "staff1", date: "2026-05-21", note: "17時以降なら入れます" },
    { staffId: "staff2", date: "2026-05-21", note: LONG_DATE_NOTE },
  ],
} satisfies ShiftFormArgs;

export const dateOnlyDateNotesArgs = {
  ...dateOnlyArgs,
  dateNotes: [
    { staffId: "staff1", date: "2026-06-02", note: "17時以降なら入れます" },
    { staffId: "staff4", date: "2026-06-02", note: "家の用事で18時まで入れません" },
    { staffId: "staff1", date: "2026-06-04", note: LONG_DATE_NOTE },
  ],
} satisfies ShiftFormArgs;

/** 表示設定から連絡事項を非表示にする。 */
export const hideDateNotes = async (canvasElement: HTMLElement): Promise<void> => {
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "表示設定" }));
  await userEvent.click(await within(document.body).findByRole("menuitemcheckbox", { name: "連絡事項を表示" }));
};

/**
 * SPで連絡事項を非表示にすると、カード下段の本文の代わりに名前の右のアイコンが出て、タップで本文を開く。
 * アイコンのタップでカードの編集は開かない。
 */
export const expectStaffNoteIconOpensOnTap = async (canvasElement: HTMLElement, note: string): Promise<void> => {
  const canvas = within(canvasElement);
  const body = within(document.body);
  await expect(await canvas.findByText(note)).toBeInTheDocument();
  await expect(canvas.queryByRole("button", { name: /^連絡事項\d+件$/ })).not.toBeInTheDocument();

  await hideDateNotes(canvasElement);
  await waitFor(() => expect(canvas.queryByText(note)).not.toBeInTheDocument());
  const icons = await canvas.findAllByRole("button", { name: "連絡事項1件" });

  await userEvent.click(icons[0]);
  const dialogs = await body.findAllByRole("dialog");
  await expect(dialogs).toHaveLength(1);
  await expect(dialogs[0]).toHaveTextContent(/^連絡事項/);
  await expect(dialogs[0].querySelector("[data-clarity-mask]")).not.toBeNull();
};

/** SPの確認事項アイコンは、タップで理由を開く。アイコンのタップでカードの編集は開かない。 */
export const expectWarningIconOpensOnTap = async (canvasElement: HTMLElement): Promise<void> => {
  const icons = await within(canvasElement).findAllByRole("button", { name: /^確認事項\d+件$/ });
  await userEvent.click(icons[0]);
  const dialogs = await within(document.body).findAllByRole("dialog");
  await expect(dialogs).toHaveLength(1);
  await expect(dialogs[0]).toHaveTextContent(/^確認事項/);
};
