import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { useDialog } from "@/src/components/ui/Dialog";
import { getDateRange } from "@/src/domains/shift/date";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { buildRestEntry, buildWorkingEntry, getSelectedShiftTypeOptionIds, type WorkingTime } from "../dayEntryState";
import { buildInitialEntries } from "../script";
import { generateTimeOptions } from "../timeOptions";
import type { DayEntry, SubmissionData } from "../types";
import { buildSubmissionInput, type SubmitShiftSelectionInput } from "./buildSubmissionInput";
import { type SubmitFormData, submitFormSchema } from "./schema";
import { buildPreviousPatternEntries } from "./script";

type UseSubmitFormControllerParams = {
  data: SubmissionData;
  onSubmit: (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => Promise<void>;
};

export function useSubmitFormController({ data, onSubmit }: UseSubmitFormControllerParams) {
  const latestWorkingTimeRef = useRef<WorkingTime | undefined>(undefined);
  const latestShiftTypeOptionIdsRef = useRef<string[] | undefined>(undefined);
  const pendingLateSubmissionRef = useRef<{
    submission: SubmitShiftSelectionInput;
    acceptedLegal?: boolean;
  } | null>(null);
  const lateSubmitDialog = useDialog();
  const isLateInitialSubmission = !data.isBeforeDeadline && !data.hasSubmitted;
  const dates = useMemo(() => getDateRange(data.periodStart, data.periodEnd), [data.periodStart, data.periodEnd]);
  const shopClosedDateSet = useMemo(() => new Set(data.shopClosedDates), [data.shopClosedDates]);
  const timeOptions = useMemo(
    () => generateTimeOptions(data.timeRange.startTime, data.timeRange.endTime),
    [data.timeRange.startTime, data.timeRange.endTime],
  );

  const {
    watch,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubmitFormData>({
    resolver: zodResolver(submitFormSchema),
    defaultValues: {
      entries: buildInitialEntries(dates, data),
      acceptedLegal: false,
    },
  });

  const entries = watch("entries");
  const acceptedLegal = watch("acceptedLegal");
  const previousPatternEntries = useMemo(() => buildPreviousPatternEntries(dates, data), [dates, data]);
  const canApplyPreviousPattern = previousPatternEntries?.some((entry) => entry.isWorking) ?? false;

  const handleSetWorking = (index: number) => {
    const entry = entries[index];
    if (shopClosedDateSet.has(entry.date)) return;

    if (data.submissionPattern.kind === "shiftType") {
      const validOptionIds = new Set(data.submissionPattern.options.map((option) => option.id));
      const latestOptionIds = latestShiftTypeOptionIdsRef.current?.filter((optionId) => validOptionIds.has(optionId));
      const nextOptionIds =
        latestOptionIds && latestOptionIds.length > 0
          ? latestOptionIds
          : data.submissionPattern.options[0]?.id
            ? [data.submissionPattern.options[0].id]
            : [];
      const firstOption = data.submissionPattern.options.find((option) => option.id === nextOptionIds[0]);
      if (!firstOption) return;

      latestShiftTypeOptionIdsRef.current = nextOptionIds;
      setValue(
        `entries.${index}`,
        {
          date: entry.date,
          isWorking: true,
          startTime: firstOption.startTime,
          endTime: firstOption.endTime,
          optionId: firstOption.id,
          optionIds: nextOptionIds,
        },
        { shouldDirty: true, shouldValidate: true },
      );
      return;
    }

    if (data.submissionPattern.kind === "dateOnly") {
      setValue(
        `entries.${index}`,
        {
          date: entry.date,
          isWorking: true,
          startTime: data.timeRange.startTime,
          endTime: data.timeRange.endTime,
        },
        { shouldDirty: true, shouldValidate: true },
      );
      return;
    }

    const nextEntry = buildWorkingEntry({
      entry,
      timeRange: data.timeRange,
      previousWeeklyPattern: data.previousWeeklyPattern,
      latestWorkingTime: latestWorkingTimeRef.current,
    });
    latestWorkingTimeRef.current = { startTime: nextEntry.startTime, endTime: nextEntry.endTime };
    setValue(`entries.${index}`, nextEntry, { shouldDirty: true, shouldValidate: true });
  };

  const handleTimeChange = (index: number, field: "startTime" | "endTime", value: string) => {
    const entry = entries[index];
    setValue(`entries.${index}.${field}`, value, { shouldValidate: true });
    if (entry.isWorking) {
      latestWorkingTimeRef.current = {
        startTime: field === "startTime" ? value : entry.startTime,
        endTime: field === "endTime" ? value : entry.endTime,
      };
    }
  };

  const handleClear = (index: number) => {
    const entry = entries[index];
    latestWorkingTimeRef.current = { startTime: entry.startTime, endTime: entry.endTime };
    const selectedOptionIds = getSelectedShiftTypeOptionIds(entry);
    if (entry.isWorking && selectedOptionIds.length > 0) {
      latestShiftTypeOptionIdsRef.current = selectedOptionIds;
    }
    setValue(`entries.${index}`, buildRestEntry(entry), { shouldDirty: true, shouldValidate: true });
  };

  const handleShiftTypeSelect = (index: number, optionId: string) => {
    if (data.submissionPattern.kind !== "shiftType") return;
    const entry = entries[index];
    if (shopClosedDateSet.has(entry.date)) return;
    const option = data.submissionPattern.options.find((item) => item.id === optionId);
    if (!option) return;

    const selectedIds = getSelectedShiftTypeOptionIds(entry);
    const validOptionIds = new Set(data.submissionPattern.options.map((item) => item.id));
    const latestOptionIds = latestShiftTypeOptionIdsRef.current?.filter((id) => validOptionIds.has(id));
    const nextOptionIds = selectedIds.includes(optionId)
      ? selectedIds.filter((selectedId) => selectedId !== optionId)
      : !entry.isWorking && latestOptionIds?.includes(optionId)
        ? latestOptionIds
        : [...selectedIds, optionId];

    if (nextOptionIds.length === 0) {
      latestShiftTypeOptionIdsRef.current = selectedIds;
      setValue(`entries.${index}`, buildRestEntry(entry), { shouldDirty: true, shouldValidate: true });
      return;
    }

    const firstOption = data.submissionPattern.options.find((item) => item.id === nextOptionIds[0]) ?? option;
    latestShiftTypeOptionIdsRef.current = nextOptionIds;
    setValue(
      `entries.${index}`,
      {
        date: entry.date,
        isWorking: true,
        startTime: firstOption.startTime,
        endTime: firstOption.endTime,
        optionId: firstOption.id,
        optionIds: nextOptionIds,
      },
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const handleApplyPreviousPattern = () => {
    if (!previousPatternEntries) return;
    latestWorkingTimeRef.current = undefined;
    latestShiftTypeOptionIdsRef.current = undefined;
    setValue("entries", previousPatternEntries, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const submitForm = handleSubmit(async (formData) => {
    if (data.legalConsentRequired && formData.acceptedLegal !== true) {
      setError("acceptedLegal", { message: "利用規約とプライバシーポリシーに同意してください" });
      return;
    }

    const submission = buildSubmissionInput(data.submissionPattern, formData.entries);
    if (isLateInitialSubmission) {
      pendingLateSubmissionRef.current = { submission, acceptedLegal: formData.acceptedLegal };
      lateSubmitDialog.open();
      return;
    }

    await onSubmit(submission, formData.acceptedLegal);
  });

  const { run: submitLate, isRunning: isLateSubmitting } = useSingleFlight(async () => {
    const pending = pendingLateSubmissionRef.current;
    if (!pending) return;

    await onSubmit(pending.submission, pending.acceptedLegal);
    pendingLateSubmissionRef.current = null;
    lateSubmitDialog.close();
  });

  const handleAcceptedLegalChange = (checked: boolean) => {
    setValue("acceptedLegal", checked, { shouldDirty: true, shouldValidate: true });
  };

  const days = entries.map((entry: DayEntry, index) => ({
    entry,
    index,
    isShopClosed: shopClosedDateSet.has(entry.date),
    error: errors.entries?.[index]?.endTime?.message,
  }));

  return {
    days,
    acceptedLegal: acceptedLegal === true,
    acceptedLegalError: errors.acceptedLegal?.message,
    canApplyPreviousPattern,
    timeOptions,
    isSubmitting: isSubmitting || isLateSubmitting,
    isLateSubmitting,
    lateSubmitDialog,
    handleSetWorking,
    handleTimeChange,
    handleClear,
    handleShiftTypeSelect,
    handleApplyPreviousPattern,
    handleAcceptedLegalChange,
    handleSubmit: () => void submitForm(),
    handleLateSubmitConfirm: async () => {
      await submitLate();
    },
  };
}
