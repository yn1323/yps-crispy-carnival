type ShiftLineTime = {
  startTime: string;
  endTime: string;
};

export type DisplayShiftLine =
  | { type: "assignment"; start: string; end: string }
  | { type: "request"; start: string; end: string }
  | { type: "none" };

type ResolveDisplayShiftLineParams = {
  hasDraftSaved: boolean;
  savedAssignment?: ShiftLineTime | null;
  wasSubmittedAtDraft: boolean;
  currentRequest?: ShiftLineTime | null;
};

/**
 * シフト表セルに表示する緑ラインの優先順位を決める。
 * 下書き保存後にスタッフが再提出した希望は点線で別表示し、シフト担当者が保存した判断を勝手に上書きしない。
 */
export const resolveDisplayShiftLine = ({
  hasDraftSaved,
  savedAssignment,
  wasSubmittedAtDraft,
  currentRequest,
}: ResolveDisplayShiftLineParams): DisplayShiftLine => {
  if (savedAssignment) {
    return { type: "assignment", start: savedAssignment.startTime, end: savedAssignment.endTime };
  }

  if (!currentRequest) {
    return { type: "none" };
  }

  // 点線は最新希望を常に表示し、緑ラインは下書き保存時点のシフト担当者判断を優先する。
  if (!hasDraftSaved || !wasSubmittedAtDraft) {
    return { type: "request", start: currentRequest.startTime, end: currentRequest.endTime };
  }

  return { type: "none" };
};
