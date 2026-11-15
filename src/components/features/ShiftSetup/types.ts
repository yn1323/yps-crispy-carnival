import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { DayTemplateSlotKey, ShiftSetupWeekday } from "@/convex/shiftSetup/dayTemplates";

/** 「シフト作成の設定」ページが表示する、店舗の設定とスタッフの属性。 */
export type ShiftSetupData = NonNullable<FunctionReturnType<typeof api.shiftSetup.queries.getShiftSetup>>;

export type ShiftSetupPosition = ShiftSetupData["positions"][number];
export type ShiftSetupStaff = ShiftSetupData["staffs"][number];
export type ShiftSetupSubmissionPattern = ShiftSetupData["submissionPattern"];
export type ShiftSetupBreakRule = NonNullable<ShiftSetupData["breakRule"]>;
export type StaffSkillLevel = ShiftSetupStaff["skillLevel"];

export type PositionInput = FunctionArgs<typeof api.shiftSetup.mutations.savePositions>["positions"][number];
export type DayTemplateInput = FunctionArgs<typeof api.shiftSetup.mutations.saveDayTemplates>["templates"][number];
export type StaffShiftProfileInput = FunctionArgs<
  typeof api.shiftSetup.mutations.saveStaffShiftProfiles
>["profiles"][number];
export type ShiftSetupAssistResult = FunctionReturnType<typeof api.shiftSetup.actions.suggestShiftSetup>;

/** 編集中の区切り。必要人数はポジションIDごとに持ち、0と未設定を区別しない。 */
export type DayTemplateSlotDraft = {
  /** 時刻を変えても変わらない、画面上の行の識別子。 */
  rowKey: string;
  key: DayTemplateSlotKey;
  counts: Record<string, number>;
};

/** 編集中の日の型。保存済みの型は`id`を持つ。 */
export type DayTemplateDraft = {
  rowKey: string;
  id?: Id<"shiftDayTemplates">;
  name: string;
  weekdays: ShiftSetupWeekday[];
  slots: DayTemplateSlotDraft[];
};

export type StaffProfile = {
  unavailablePositionIds: Id<"positions">[];
  skillLevel: StaffSkillLevel;
};

/** 保存していない変更を持つセクション。操作バーと離脱確認で、何が保存されるかを示すために使う。 */
export type PendingSection = "dayTemplates" | "staffs";

/** 店舗と組織を束ねた、設定の保存とAIサポートの呼び出し口。 */
export type ShiftSetupRemote = {
  savePositions: (positions: PositionInput[]) => Promise<unknown>;
  saveDayTemplates: (templates: DayTemplateInput[]) => Promise<unknown>;
  saveBreakRule: (breakRule: ShiftSetupBreakRule | null) => Promise<unknown>;
  saveStaffShiftProfiles: (profiles: StaffShiftProfileInput[]) => Promise<unknown>;
  suggestShiftSetup: (situation: string) => Promise<ShiftSetupAssistResult>;
};

export type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  open: () => void;
  close: () => void;
};

export type RequiredCountTarget = { templateRowKey: string; slotRowKey: string; positionId: string };
export type DayTemplateSlotTarget = { templateRowKey: string; slotRowKey: string };

export type ShiftSetupIntents = {
  onAddDayTemplate: () => void;
  onRemoveDayTemplate: (rowKey: string) => void;
  onRenameDayTemplate: (rowKey: string, name: string) => void;
  onToggleWeekday: (rowKey: string, weekday: ShiftSetupWeekday) => void;
  onChangeRequiredCount: (target: RequiredCountTarget, delta: number) => void;
  onChangeTimeSlotRange: (target: DayTemplateSlotTarget, patch: { startTime?: string; endTime?: string }) => void;
  onAddTimeSlot: (templateRowKey: string) => void;
  onRemoveSlot: (target: DayTemplateSlotTarget) => void;
  onToggleStaffPosition: (staffId: Id<"staffs">, positionId: Id<"positions">) => void;
  onChangeStaffSkillLevel: (staffId: Id<"staffs">, skillLevel: StaffSkillLevel) => void;
  onResetChanges: () => void;
  onSaveChanges: () => void;
  onSavePositions: (positions: PositionInput[]) => void;
  onSaveBreakRule: (breakRule: ShiftSetupBreakRule | null) => void;
  onRequestAssist: (situation: string) => void;
};

/** 編集の状態を持つhookが、Viewへ渡す値。画面遷移と離脱確認は含まない。 */
export type ShiftSetupEditorView = {
  setup: ShiftSetupData;
  canWrite: boolean;
  dayTemplates: {
    drafts: DayTemplateDraft[];
    /** 型ごとに表示する入力の誤り。キーは型の`rowKey`。 */
    issueMessages: Record<string, string>;
    canAdd: boolean;
  };
  /** スタッフごとの、編集中の値を反映した条件。キーはスタッフID。 */
  staffProfiles: Record<string, StaffProfile>;
  pendingSections: PendingSection[];
  isSaving: boolean;
  positionsDialog: DialogState & { isSaving: boolean };
  breakRuleDialog: DialogState & { isSaving: boolean };
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
