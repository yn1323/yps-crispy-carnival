import { Flex, Stack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { MAX_SHIFT_TYPE_OPTIONS } from "@/convex/_lib/submissionPatternConstants";
import {
  addShiftSubmissionPatternIssues,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  shiftSubmissionPatternSchema,
} from "@/convex/shop/schemas";
import {
  ShiftTypePatternFields,
  SubmissionPatternField,
  TimePatternFields,
} from "@/src/components/shared/ShopSettingsFields";
import {
  createShiftTypeOption,
  DEFAULT_TIME_PATTERN,
  getNestedErrorMessage,
  getShiftTypeOptionErrorMessages,
  normalizeShiftTypeOptions,
} from "@/src/components/shared/ShopSubmissionPatternForm";
import { Button } from "@/src/components/ui/Button";
import {
  canAddShiftTypeOption,
  changeSubmissionPattern,
  getAvailableEndTimeOptions,
  getAvailableStartTimeOptions,
  removeShiftTypeOption,
  updateShiftTypeOption,
} from "./script";
import type { UpdateShopSetting } from "./types";

const schema = z
  .object({ submissionPattern: shiftSubmissionPatternSchema })
  .superRefine((data, ctx) => addShiftSubmissionPatternIssues(data.submissionPattern, ctx));
type FormData = z.infer<typeof schema>;

type Props = {
  shopId: string;
  submissionPattern: ShiftSubmissionPattern;
  labelledBy: string;
  disabled: boolean;
  isBusy: boolean;
  isUpdating: boolean;
  onUpdate: UpdateShopSetting;
};

const PAGE_SELECT_POSITIONING = { hideWhenDetached: true, sameWidth: true } as const;

export function ShopSubmissionPatternSettingForm({
  shopId,
  submissionPattern: initialSubmissionPattern,
  labelledBy,
  disabled,
  isBusy,
  isUpdating,
  onUpdate,
}: Props) {
  const {
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitted, submitCount },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { submissionPattern: initialSubmissionPattern },
  });
  const submissionPattern = watch("submissionPattern");
  const patternErrors = errors.submissionPattern;
  const formRef = useRef<HTMLFormElement>(null);
  const shouldFocusInvalidFieldRef = useRef(false);

  useEffect(() => {
    if (submitCount === 0 || !shouldFocusInvalidFieldRef.current || !patternErrors) return;
    formRef.current
      ?.querySelector<HTMLElement>(
        '[aria-invalid="true"]:not([type="hidden"]), [data-invalid] [data-part="trigger"], [data-validation-target="true"]',
      )
      ?.focus();
    shouldFocusInvalidFieldRef.current = false;
  }, [patternErrors, submitCount]);

  const setSubmissionPattern = (next: ShiftSubmissionPattern) => {
    setValue("submissionPattern", next, { shouldDirty: true, shouldValidate: isSubmitted });
  };
  const updateOption = (index: number, patch: Partial<ShiftTypeOption>) => {
    setSubmissionPattern(updateShiftTypeOption(submissionPattern, index, patch));
  };
  const addOption = () => {
    if (submissionPattern.kind !== "shiftType" || !canAddShiftTypeOption(submissionPattern)) return;
    setSubmissionPattern({
      kind: "shiftType",
      options: normalizeShiftTypeOptions([
        ...submissionPattern.options,
        createShiftTypeOption(submissionPattern.options.length),
      ]),
    });
  };

  const shiftTypeRows =
    submissionPattern.kind === "shiftType"
      ? submissionPattern.options.map((option, index) => ({
          index,
          option,
          startTimeOptions: getAvailableStartTimeOptions(option.endTime),
          endTimeOptions: getAvailableEndTimeOptions(option.startTime),
          nameError: getNestedErrorMessage(patternErrors, ["options", index, "name"]),
          startTimeError: getNestedErrorMessage(patternErrors, ["options", index, "startTime"]),
          endTimeError: getNestedErrorMessage(patternErrors, ["options", index, "endTime"]),
          errorMessages: getShiftTypeOptionErrorMessages(patternErrors, index),
        }))
      : [];
  const optionsError = getNestedErrorMessage(patternErrors, ["options"]);
  const startTimeError = getNestedErrorMessage(patternErrors, ["startTime"]);
  const endTimeError = getNestedErrorMessage(patternErrors, ["endTime"]);

  return (
    <form
      ref={formRef}
      id={`shop-detail-submission-pattern-${shopId}`}
      aria-labelledby={labelledBy}
      noValidate
      onSubmit={handleSubmit(
        async ({ submissionPattern: value }) => {
          await onUpdate({
            kind: "submissionPattern",
            submissionPattern:
              value.kind === "shiftType"
                ? { kind: "shiftType", options: normalizeShiftTypeOptions(value.options) }
                : value,
          });
        },
        () => {
          shouldFocusInvalidFieldRef.current = true;
        },
      )}
    >
      <fieldset disabled={disabled || isBusy} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
        <Stack gap={5}>
          <SubmissionPatternField
            selectedKind={submissionPattern.kind}
            onSelect={(kind) => setSubmissionPattern(changeSubmissionPattern(submissionPattern, kind))}
          />

          {submissionPattern.kind === "time" && (
            <Stack gap={1}>
              <TimePatternFields
                invalid={!!patternErrors}
                startTime={submissionPattern.startTime}
                endTime={submissionPattern.endTime}
                startTimeOptions={getAvailableStartTimeOptions(submissionPattern.endTime)}
                endTimeOptions={getAvailableEndTimeOptions(submissionPattern.startTime)}
                startTimeError={startTimeError}
                endTimeError={endTimeError}
                usePortal
                positioning={PAGE_SELECT_POSITIONING}
                onStartTimeChange={(value) =>
                  setSubmissionPattern({
                    ...submissionPattern,
                    startTime: value || DEFAULT_TIME_PATTERN.startTime,
                  })
                }
                onEndTimeChange={(value) =>
                  setSubmissionPattern({
                    ...submissionPattern,
                    endTime: value || DEFAULT_TIME_PATTERN.endTime,
                  })
                }
              />
            </Stack>
          )}

          {submissionPattern.kind === "shiftType" && (
            <ShiftTypePatternFields
              invalid={!!patternErrors}
              rows={shiftTypeRows}
              emptyMessage={optionsError ?? "勤務区分を追加してください。"}
              emptyMessageInvalid={!!optionsError}
              canAdd={canAddShiftTypeOption(submissionPattern)}
              usePortal
              positioning={PAGE_SELECT_POSITIONING}
              limitMessage={
                canAddShiftTypeOption(submissionPattern)
                  ? undefined
                  : `勤務区分は${MAX_SHIFT_TYPE_OPTIONS}件まで登録できます。`
              }
              onAdd={addOption}
              onRemove={(index) => setSubmissionPattern(removeShiftTypeOption(submissionPattern, index))}
              onUpdate={updateOption}
            />
          )}

          <Flex justify="flex-end">
            <Button type="submit" colorPalette="teal" loading={isUpdating}>
              希望シフトの集め方を更新
            </Button>
          </Flex>
        </Stack>
      </fieldset>
    </form>
  );
}
