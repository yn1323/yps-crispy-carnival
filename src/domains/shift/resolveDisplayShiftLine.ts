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

  // 点線は最新希望を常に表示し、緑ラインは下書き保存時点の店長判断を優先する。
  if (!hasDraftSaved || !wasSubmittedAtDraft) {
    return { type: "request", start: currentRequest.startTime, end: currentRequest.endTime };
  }

  return { type: "none" };
};
