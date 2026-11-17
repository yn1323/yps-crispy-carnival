import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";
import type { StaffingSegment } from "@/src/domains/shift/staffingSegments";

/** 「シフト作成の設定」ページが表示する、店舗の設定とスタッフの属性。 */
export type ShiftSetupData = NonNullable<FunctionReturnType<typeof api.shiftSetup.queries.getShiftSetup>>;

export type ShiftSetupPosition = ShiftSetupData["positions"][number];
export type ShiftSetupStaff = ShiftSetupData["staffs"][number];
export type ShiftSetupDayTemplate = ShiftSetupData["dayTemplates"][number];
export type ShiftSetupSubmissionPattern = ShiftSetupData["submissionPattern"];
/** 保存する形の、ポジションごとの値。一人前は持たない。 */
export type StoredStaffPositionLevel = ShiftSetupStaff["positionSkills"][number]["level"];
/** 画面で扱う、ポジションごとの値。入れるかどうかと熟練度を1つにまとめている。 */
export type StaffPositionLevel = StoredStaffPositionLevel | "standard";
/** スタッフの、ポジションごとの値。キーはポジションのID。一人前は持たない。 */
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
  /** 時間ごとの人数の区間。正規化した形で持つ。保存するときにバー（1本が1人分）へ変える。 */
  | { kind: "time"; segments: StaffingSegment[] }
  /** 勤務パターンのID → ポジションのID → 人数。0人は持たない。 */
  | { kind: "shiftType"; counts: Record<string, Record<string, number>> }
  /** ポジションのID → 人数。0人は持たない。 */
  | { kind: "dateOnly"; counts: Record<string, number> };

/** 編集中のテンプレート。保存済みのテンプレートは`id`を持つ。 */
export type DayTemplateDraft = {
  /** 名前を変えても変わらない、画面上のテンプレートの識別子。 */
  rowKey: string;
  id?: Id<"shiftDayTemplates">;
  name: string;
  weekdays: ShiftSetupWeekday[];
  appliesToHolidays: boolean;
  requirements: DayTemplateRequirementsDraft;
  /** 保存済みの必要人数の種類が、いまの集め方と違っていたテンプレート。入れ直すまで知らせを出す。 */
  requiresReentry: boolean;
  /**
   * 「テンプレートを作る」「テンプレートを追加」で入れた名前と曜日。作ったまま何も入れていないテンプレートかを見分けるために持つ。
   * 保存済みのテンプレートとAIの下書きは持たない。
   */
  initial?: { name: string; weekdays: ShiftSetupWeekday[] };
};

/**
 * 保存していない変更を持つセクション。保存の帯と離脱確認を出すかどうかと、何が保存されるかを示すために使う。
 * 作ったまま何も入れていない新しいテンプレートだけが違いのときは、必要人数の変更に数えない。
 */
export type PendingSection = "positions" | "dayTemplates" | "staffs";

/** 店舗と組織を束ねた、設定の保存とAIサポートの呼び出し口。 */
export type ShiftSetupRemote = {
  /** 保存したポジションのIDを、入力と同じ順で返す。 */
  savePositions: (positions: PositionInput[]) => Promise<Id<"positions">[]>;
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
  /** つかんだテンプレートを、重ねたテンプレートの位置へ動かす。並びは保存するとシフト表の選択肢にも反映される。 */
  onReorderDayTemplates: (activeRowKey: string, overRowKey: string) => void;
  onRenameDayTemplate: (rowKey: string, name: string) => void;
  onToggleWeekday: (rowKey: string, weekday: ShiftSetupWeekday) => void;
  onToggleHoliday: (rowKey: string) => void;
  /** 曜日をすべて外す。祝日の選択は変えない。 */
  onClearWeekdays: (rowKey: string) => void;
  onChangeSegments: (rowKey: string, segments: StaffingSegment[]) => void;
  onChangeRequiredCount: (rowKey: string, change: RequiredCountChange) => void;
  onCopyRequirements: (target: { fromRowKey: string; toRowKey: string }) => void;
  onChangeStaffPositionLevel: (staffId: Id<"staffs">, positionId: Id<"positions">, level: StaffPositionLevel) => void;
  onSaveChanges: () => void;
  /** Dialogで決めたポジションの一覧を、編集中の値へ反映する。保存はしない。 */
  onApplyPositions: (positions: PositionInput[]) => void;
  onRequestAssist: (situation: string) => void;
};

/** 編集の状態を持つhookが、Viewへ渡す値。画面遷移と離脱確認は含まない。 */
export type ShiftSetupEditorView = {
  /** 店舗の設定。`positions`だけは、編集中の値を反映した一覧である。新しく足したポジションは仮のIDを持つ。 */
  setup: ShiftSetupData;
  /** 最後に保存したポジション。保存すると削除されるポジションを示すために使う。 */
  savedPositions: readonly ShiftSetupPosition[];
  canWrite: boolean;
  dayTemplates: {
    drafts: DayTemplateDraft[];
    /** 編集しているテンプレートの`rowKey`。テンプレートが1つもなければnull。 */
    selectedRowKey: string | null;
    /** テンプレートごとに表示する入力の誤り。キーはテンプレートの`rowKey`。 */
    issueMessages: Record<string, string>;
    canAdd: boolean;
  };
  /** スタッフごとの、編集中の値を反映したポジションごとの値。キーはスタッフID。 */
  staffProfiles: Record<string, StaffPositionLevels>;
  pendingSections: PendingSection[];
  /** 保存の応答を待っている間。ポジション、テンプレート、スタッフの条件を操作できない状態にする。 */
  isSaving: boolean;
  positionsDialog: DialogState;
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
