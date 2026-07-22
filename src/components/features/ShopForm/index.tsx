import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  getNestedErrorMessage,
  getShiftTypeOptionErrorMessages,
} from "@/src/components/shared/ShopSettingsFields/formErrors";
import {
  appendShiftTypeOption,
  DEFAULT_TIME_PATTERN,
  getAvailableEndTimeOptions,
  getAvailableStartTimeOptions,
  removeShiftTypeOptionAt,
  selectSubmissionPattern,
  updateShiftTypeOptionAt,
} from "@/src/domains/shop/submissionPattern";
import { ShopFormView } from "./ShopFormView";
import {
  buildShopFormSubmission,
  getInitialStep,
  getNextStep,
  getPreviousStep,
  MAX_SHIFT_TYPE_OPTIONS,
  type RegularClosedDay,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  type ShopFormData,
  type ShopFormStep,
  shopFormSchema,
  sortRegularClosedDays,
  WEEKDAYS,
} from "./script";

export type { ShopFormData } from "./script";

type Props = {
  defaultValues: ShopFormData;
  onSubmit: (data: ShopFormData) => void | Promise<void>;
  onCancel?: () => void;
  initialStep?: ShopFormStep;
  submitLabel?: string;
};

export const ShopForm = ({
  defaultValues,
  onSubmit,
  onCancel,
  initialStep = "shopName",
  submitLabel = "変更を保存",
}: Props) => {
  const [currentStep, setCurrentStep] = useState<ShopFormStep>(() =>
    getInitialStep(initialStep, defaultValues.submissionPattern),
  );
  const [regularClosedDays, setRegularClosedDays] = useState<RegularClosedDay[]>(defaultValues.regularClosedDays);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ShopFormData>({
    resolver: zodResolver(shopFormSchema),
    defaultValues,
  });

  const submissionPattern = watch("submissionPattern");
  const setSubmissionPattern = (next: ShiftSubmissionPattern) => {
    setValue("submissionPattern", next, { shouldDirty: true, shouldValidate: true });
  };

  const handleSubmissionPatternChange = (kind: ShiftSubmissionPattern["kind"]) => {
    setSubmissionPattern(selectSubmissionPattern(kind, submissionPattern));
  };

  const goToNextStep = () => {
    setCurrentStep((step) => getNextStep(step, getValues("submissionPattern")));
  };

  const goToPreviousStep = () => {
    setCurrentStep((step) => getPreviousStep(step, getValues("submissionPattern")));
  };

  const handlePatternSettingsNext = async () => {
    const isValid = await trigger("submissionPattern", { shouldFocus: true });
    if (!isValid) return;
    goToNextStep();
  };

  const updateShiftTypeOption = (index: number, patch: Partial<ShiftTypeOption>) => {
    if (submissionPattern.kind !== "shiftType") return;
    setSubmissionPattern({
      kind: "shiftType",
      options: updateShiftTypeOptionAt(submissionPattern.options, index, patch),
    });
  };

  const addShiftTypeOption = () => {
    if (submissionPattern.kind !== "shiftType" || submissionPattern.options.length >= MAX_SHIFT_TYPE_OPTIONS) return;
    setSubmissionPattern({
      kind: "shiftType",
      options: appendShiftTypeOption(submissionPattern.options),
    });
  };

  const removeShiftTypeOption = (index: number) => {
    if (submissionPattern.kind !== "shiftType") return;
    setSubmissionPattern({
      kind: "shiftType",
      options: removeShiftTypeOptionAt(submissionPattern.options, index),
    });
  };

  const toggleRegularClosedDay = (day: RegularClosedDay) => {
    setRegularClosedDays((current) => {
      const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day];
      return sortRegularClosedDays(next);
    });
  };

  const submitForm = handleSubmit(
    async (data) => {
      await onSubmit(buildShopFormSubmission(data, regularClosedDays));
    },
    (invalidErrors) => {
      if (invalidErrors.shopName) {
        setCurrentStep("shopName");
        return;
      }
      if (invalidErrors.submissionPattern) {
        setCurrentStep(submissionPattern.kind === "dateOnly" ? "submissionPattern" : "patternSettings");
        return;
      }
      setCurrentStep("regularClosedDays");
    },
  );

  const selectedClosedDayLabels = WEEKDAYS.filter((day) => regularClosedDays.includes(day.value)).map(
    (day) => day.label,
  );
  const shiftTypeOptions = submissionPattern.kind === "shiftType" ? submissionPattern.options : [];
  const shiftTypeOptionsError = getNestedErrorMessage(errors.submissionPattern, ["options"]);
  const canAddShiftTypeOption = shiftTypeOptions.length < MAX_SHIFT_TYPE_OPTIONS;
  const shiftTypeRows = shiftTypeOptions.map((option, index) => ({
    index,
    option,
    startTimeOptions: getAvailableStartTimeOptions(option.endTime),
    endTimeOptions: getAvailableEndTimeOptions(option.startTime),
    nameError: getNestedErrorMessage(errors.submissionPattern, ["options", index, "name"]),
    startTimeError: getNestedErrorMessage(errors.submissionPattern, ["options", index, "startTime"]),
    endTimeError: getNestedErrorMessage(errors.submissionPattern, ["options", index, "endTime"]),
    errorMessages: getShiftTypeOptionErrorMessages(errors.submissionPattern, index),
  }));

  const patternSettings =
    submissionPattern.kind === "time"
      ? {
          kind: "time" as const,
          props: {
            invalid: !!errors.submissionPattern,
            startTime: submissionPattern.startTime,
            endTime: submissionPattern.endTime,
            startTimeOptions: getAvailableStartTimeOptions(submissionPattern.endTime),
            endTimeOptions: getAvailableEndTimeOptions(submissionPattern.startTime),
            onStartTimeChange: (value: string) =>
              setSubmissionPattern({
                ...submissionPattern,
                startTime: value || DEFAULT_TIME_PATTERN.startTime,
              }),
            onEndTimeChange: (value: string) =>
              setSubmissionPattern({
                ...submissionPattern,
                endTime: value || DEFAULT_TIME_PATTERN.endTime,
              }),
          },
        }
      : submissionPattern.kind === "shiftType"
        ? {
            kind: "shiftType" as const,
            props: {
              invalid: !!errors.submissionPattern,
              rows: shiftTypeRows,
              emptyMessage: shiftTypeOptionsError ?? "勤務区分を追加してください。",
              emptyMessageInvalid: !!shiftTypeOptionsError,
              canAdd: canAddShiftTypeOption,
              limitMessage: canAddShiftTypeOption
                ? undefined
                : `勤務区分は${MAX_SHIFT_TYPE_OPTIONS}件まで登録できます。`,
              onAdd: addShiftTypeOption,
              onRemove: removeShiftTypeOption,
              onUpdate: updateShiftTypeOption,
            },
          }
        : { kind: "dateOnly" as const };

  return (
    <ShopFormView
      currentStep={currentStep}
      submissionPatternKind={submissionPattern.kind}
      shopNameStep={{
        registration: register("shopName"),
        invalid: !!errors.shopName,
        errorMessage: errors.shopName?.message,
      }}
      submissionPatternStep={{ selectedKind: submissionPattern.kind, onSelect: handleSubmissionPatternChange }}
      patternSettings={patternSettings}
      regularClosedDaysStep={{
        summary: selectedClosedDayLabels.length > 0 ? `毎週 ${selectedClosedDayLabels.join("・")}` : "定休日なし",
        options: WEEKDAYS.map((day) => ({
          ...day,
          isClosed: regularClosedDays.includes(day.value),
        })),
        onToggle: toggleRegularClosedDay,
      }}
      actions={{
        currentStep,
        isSubmitting,
        submitLabel,
        onCancel,
        onNext: goToNextStep,
        onPrevious: goToPreviousStep,
        onPatternSettingsNext: handlePatternSettingsNext,
        onSubmit: submitForm,
      }}
    />
  );
};
