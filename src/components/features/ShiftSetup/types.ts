import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import type { EditableStaffingBar } from "@/src/domains/shift/staffingBars";

/** 「シフト作成の設定」ページが表示する、店舗の設定とスタッフの属性。 */
export type ShiftSetupData = NonNullable<FunctionReturnType<typeof api.shiftSetup.queries.getShiftSetup>>;

export type ShiftSetupPosition = ShiftSetupData["positions"][number];
export type ShiftSetupStaff = ShiftSetupData["staffs"][number];
export type ShiftSetupDayTemplate = ShiftSetupData["dayTemplates"][number];
export type ShiftSetupSubmissionPattern = ShiftSetupData["submissionPattern"];
/** 保存する形の、ポジションごとの値。標準は持たない。 */
export type StoredStaffPositionLevel = ShiftSetupStaff["positionSkills"][number]["level"];
/** 画面で扱う、ポジションごとの値。入れるかどうかと熟練度を1つにまとめている。 */
export type StaffPositionLevel = StoredStaffPositionLevel | "standard";
/** スタッフの、ポジションごとの値。キーはポジションのID。標準は持たない。 */
export type StaffPositionLevels = Readonly<Record<string, StoredStaffPositionLevel>>;

export type PositionInput = FunctionArgs<typeof api.shiftSetup.mutations.savePositions>["positions"][number];
export type DayTemplateInput = FunctionArgs<typeof api.shiftSetup.mutations.saveDayTemplates>["templates"][number];
export type StaffShiftProfileInput = FunctionArgs<
  typeof api.shiftSetup.mutations.saveStaffShiftProfiles
>["profiles"][number];
export type ShiftSetupAssistResult = FunctionReturnType<typeof api.shiftSetup.actions.suggestShiftSetup>;
export type ShiftSetupAssistTemplate = Extract<ShiftSetupAssistResult, { status: "ok" }>["templates"][number];

/** 編集中の必要人数。種類は希望シフトの集め方に対応する。 */
export type DayTemplateRequirementsDraft =
  | { kind: "time"; bars: EditableStaffingBar[] }
  /** 勤務パターンのID → ポジションのID → 人数。0人は持たない。 */
  | { kind: "shiftType"; counts: Record<string, Record<string, number>> }
  /** ポジションのID → 人数。0人は持たない。 */
  | { kind: "dateOnly"; counts: Record<string, number> };

/** 編集中の日の型。保存済みの型は`id`を持つ。 */
export type DayTemplateDraft = {
  /** 名前を変えても変わらない、画面上の型の識別子。 */
  rowKey: string;
  id?: Id<"shiftDayTemplates">;
  name: string;
  weekdays: ShiftSetupWeekday[];
  appliesToHolidays: boolean;
  requirements: DayTemplateRequirementsDraft;
  /** 保存済みの必要人数の種類が、いまの集め方と違っていた型。入れ直すまで知らせを出す。 */
  requiresReentry: boolean;
  /**
   * 「型を作る」「型を追加」で入れた名前と曜日。作ったまま何も入れていない型かを見分けるために持つ。
   * 保存済みの型とAIの下書きは持たない。
   */
  initial?: { name: string; weekdays: ShiftSetupWeekday[] };
};

/**
 * 保存していない変更を持つセクション。保存の帯と離脱確認を出すかどうかと、何が保存されるかを示すために使う。
 * 作ったまま何も入れていない新しい型だけが違いのときは、必要人数の変更に数えない。
 */
export type PendingSection = "dayTemplates" | "staffs";

/** 店舗と組織を束ねた、設定の保存とAIサポートの呼び出し口。 */
export type ShiftSetupRemote = {
  savePositions: (positions: PositionInput[]) => Promise<unknown>;
  saveDayTemplates: (templates: DayTemplateInput[]) => Promise<unknown>;
  saveStaffShiftProfiles: (profiles: StaffShiftProfileInput[]) => Promise<unknown>;
  suggestShiftSetup: (situation: string) => Promise<ShiftSetupAssistResult>;
};

export type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  open: () => void;
  close: () => void;
};

/** 数字で入れる必要人数の1マス。`rowId`は勤務パターンのID、日付選択では`ALL_DAY_ROW_ID`。 */
export type RequiredCountChange = { rowId: string; positionId: string; count: number };

export type ShiftSetupIntents = {
  onSelectDayTemplate: (rowKey: string) => void;
  onAddDayTemplate: () => void;
  onRemoveDayTemplate: (rowKey: string) => void;
  onRenameDayTemplate: (rowKey: string, name: string) => void;
  onToggleWeekday: (rowKey: string, weekday: ShiftSetupWeekday) => void;
  onToggleHoliday: (rowKey: string) => void;
  onChangeBars: (rowKey: string, bars: EditableStaffingBar[]) => void;
  onChangeRequiredCount: (rowKey: string, change: RequiredCountChange) => void;
  onCopyRequirements: (target: { fromRowKey: string; toRowKey: string }) => void;
  onChangeStaffPositionLevel: (staffId: Id<"staffs">, positionId: Id<"positions">, level: StaffPositionLevel) => void;
  /** 1つのポジションの値を、全員まとめて変える。 */
  onSetPositionLevelForAllStaffs: (positionId: Id<"positions">, level: "standard" | "unavailable") => void;
  onResetChanges: () => void;
  onSaveChanges: () => void;
  onSavePositions: (positions: PositionInput[]) => void;
  onRequestAssist: (situation: string) => void;
};

/** 編集の状態を持つhookが、Viewへ渡す値。画面遷移と離脱確認は含まない。 */
export type ShiftSetupEditorView = {
  setup: ShiftSetupData;
  canWrite: boolean;
  dayTemplates: {
    drafts: DayTemplateDraft[];
    /** 編集している型の`rowKey`。型が1つもなければnull。 */
    selectedRowKey: string | null;
    /** 型ごとに表示する入力の誤り。キーは型の`rowKey`。 */
    issueMessages: Record<string, string>;
    canAdd: boolean;
  };
  /** スタッフごとの、編集中の値を反映したポジションごとの値。キーはスタッフID。 */
  staffProfiles: Record<string, StaffPositionLevels>;
  pendingSections: PendingSection[];
  /** 保存の応答を待っている間。型の編集とスタッフの条件を操作できない状態にする。 */
  isSaving: boolean;
  positionsDialog: DialogState & { isSaving: boolean };
  assistDialog: DialogState & { isRunning: boolean; message?: string };
  intents: ShiftSetupIntents;
};

export type LeaveDialogState = {
  isOpen: boolean;
  isSaving: boolean;
  onStay: () => void;
  onLeaveWithoutSaving: () => void;
  onSaveAndLeave: () => void;
};
