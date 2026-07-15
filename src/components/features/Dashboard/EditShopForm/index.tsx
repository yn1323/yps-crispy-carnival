import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import {
  createDefaultShiftTypeOptions,
  createShiftTypeOption,
  DEFAULT_TIME_PATTERN,
  getNestedErrorMessage,
  getShiftTypeOptionErrorMessages,
  normalizeShiftTypeOptions,
} from "../submissionPatternForm";
import { EditShopFormView } from "./EditShopFormView";
import {
  buildEditShopFormSubmission,
  type EditShopFormData,
  type EditShopFormStep,
  editShopSchema,
  getAvailableEndTimeOptions,
  getAvailableStartTimeOptions,
  getInitialStep,
  getNextStep,
  getPreviousStep,
  MAX_SHIFT_TYPE_OPTIONS,
  type RegularClosedDay,
  type ShiftSubmissionPattern,
  type ShiftTypeOption,
  sortRegularClosedDays,
  WEEKDAYS,
} from "./script";

export type { EditShopFormData } from "./script";

type Props = {
  defaultValues: EditShopFormData;
  onSubmit: (data: EditShopFormData) => void | Promise<void>;
  onCancel?: () => void;
  initialStep?: EditShopFormStep;
};

export const EditShopForm = ({ defaultValues, onSubmit, onCancel, initialStep = "shopName" }: Props) => {
  const [currentStep, setCurrentStep] = useState<EditShopFormStep>(() =>
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
  } = useForm<EditShopFormData>({
    resolver: zodResolver(editShopSchema),
    defaultValues,
  });

  const submissionPattern = watch("submissionPattern");
  const setSubmissionPattern = (next: ShiftSubmissionPattern) => {
    setValue("submissionPattern", next, { shouldDirty: true, shouldValidate: true });
  };

  const handleSubmissionPatternChange = (kind: ShiftSubmissionPattern["kind"]) => {
    if (kind === "time") {
      setSubmissionPattern(
        submissionPattern.kind === "time"
          ? submissionPattern
          : { kind: "time", startTime: DEFAULT_TIME_PATTERN.startTime, endTime: DEFAULT_TIME_PATTERN.endTime },
      );
      return;
    }
    if (kind === "shiftType") {
      setSubmissionPattern({
        kind,
        options:
          submissionPattern.kind === "shiftType" && submissionPattern.options.length > 0
            ? submissionPattern.options
            : createDefaultShiftTypeOptions(),
      });
      return;
    }
    setSubmissionPattern({ kind: "dateOnly" });
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
      options: normalizeShiftTypeOptions(
        submissionPattern.options.map((option, optionIndex) =>
          optionIndex === index ? { ...option, ...patch } : option,
        ),
      ),
    });
  };

  const addShiftTypeOption = () => {
    if (submissionPattern.kind !== "shiftType" || submissionPattern.options.length >= MAX_SHIFT_TYPE_OPTIONS) return;
    setSubmissionPattern({
      kind: "shiftType",
      options: normalizeShiftTypeOptions([
        ...submissionPattern.options,
        createShiftTypeOption(submissionPattern.options.length),
      ]),
    });
  };

  const removeShiftTypeOption = (index: number) => {
    if (submissionPattern.kind !== "shiftType") return;
    setSubmissionPattern({
      kind: "shiftType",
      options: normalizeShiftTypeOptions(submissionPattern.options.filter((_, optionIndex) => optionIndex !== index)),
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
      await onSubmit(buildEditShopFormSubmission(data, regularClosedDays));
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
    <EditShopFormView
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
        onCancel,
        onNext: goToNextStep,
        onPrevious: goToPreviousStep,
        onPatternSettingsNext: handlePatternSettingsNext,
        onSubmit: submitForm,
      }}
    />
  );
};
