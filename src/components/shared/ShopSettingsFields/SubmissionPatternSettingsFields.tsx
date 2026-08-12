import { MAX_SHIFT_TYPE_OPTIONS } from "@/convex/_lib/submissionPatternConstants";
import type { ShiftSubmissionPattern, ShiftTypeOption } from "@/convex/shop/schemas";
import {
  appendShiftTypeOption,
  DEFAULT_TIME_PATTERN,
  getAvailableEndTimeOptions,
  getAvailableStartTimeOptions,
  removeShiftTypeOptionAt,
  updateShiftTypeOptionAt,
} from "@/src/domains/shop/submissionPattern";
import { getNestedErrorMessage, getShiftTypeOptionErrorMessages } from "./formErrors";
import { ShiftTypePatternFields } from "./ShiftTypePatternFields";
import { TimePatternFields } from "./TimePatternFields";

export type SubmissionPatternSettingsFieldsProps = {
  submissionPattern: ShiftSubmissionPattern;
  error?: unknown;
  showTimeFieldErrors?: boolean;
  onChange: (next: ShiftSubmissionPattern) => void;
};

export function SubmissionPatternSettingsFields({
  submissionPattern,
  error,
  showTimeFieldErrors = true,
  onChange,
}: SubmissionPatternSettingsFieldsProps) {
  if (submissionPattern.kind === "time") {
    return (
      <TimePatternFields
        invalid={!!error}
        startTime={submissionPattern.startTime}
        endTime={submissionPattern.endTime}
        startTimeOptions={getAvailableStartTimeOptions(submissionPattern.endTime)}
        endTimeOptions={getAvailableEndTimeOptions(submissionPattern.startTime)}
        startTimeError={showTimeFieldErrors ? getNestedErrorMessage(error, ["startTime"]) : undefined}
        endTimeError={showTimeFieldErrors ? getNestedErrorMessage(error, ["endTime"]) : undefined}
        onStartTimeChange={(value) =>
          onChange({ ...submissionPattern, startTime: value || DEFAULT_TIME_PATTERN.startTime })
        }
        onEndTimeChange={(value) => onChange({ ...submissionPattern, endTime: value || DEFAULT_TIME_PATTERN.endTime })}
      />
    );
  }

  if (submissionPattern.kind !== "shiftType") return null;

  const optionsError = getNestedErrorMessage(error, ["options"]);
  const canAdd = submissionPattern.options.length < MAX_SHIFT_TYPE_OPTIONS;
  const updateOption = (index: number, patch: Partial<ShiftTypeOption>) => {
    onChange({
      kind: "shiftType",
      options: updateShiftTypeOptionAt(submissionPattern.options, index, patch),
    });
  };

  return (
    <ShiftTypePatternFields
      invalid={!!error}
      rows={submissionPattern.options.map((option, index) => ({
        index,
        option,
        startTimeOptions: getAvailableStartTimeOptions(option.endTime),
        endTimeOptions: getAvailableEndTimeOptions(option.startTime),
        nameError: getNestedErrorMessage(error, ["options", index, "name"]),
        startTimeError: getNestedErrorMessage(error, ["options", index, "startTime"]),
        endTimeError: getNestedErrorMessage(error, ["options", index, "endTime"]),
        errorMessages: getShiftTypeOptionErrorMessages(error, index),
      }))}
      emptyMessage={optionsError ?? "勤務区分を追加してください。"}
      emptyMessageInvalid={!!optionsError}
      canAdd={canAdd}
      limitMessage={canAdd ? undefined : `勤務区分は${MAX_SHIFT_TYPE_OPTIONS}件まで登録できます。`}
      onAdd={() => {
        if (!canAdd) return;
        onChange({ kind: "shiftType", options: appendShiftTypeOption(submissionPattern.options) });
      }}
      onRemove={(index) =>
        onChange({ kind: "shiftType", options: removeShiftTypeOptionAt(submissionPattern.options, index) })
      }
      onUpdate={updateOption}
    />
  );
}
