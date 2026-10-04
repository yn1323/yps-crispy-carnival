import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { normalizeShiftDateNote } from "@/convex/shiftSubmission/schemas";
import { useDialog } from "@/src/components/ui/Dialog";
import { getDateRange } from "@/src/domains/shift/date";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { buildRestEntry, buildWorkingEntry, getSelectedShiftTypeOptionIds, type WorkingTime } from "../dayEntryState";
import { buildInitialEntries } from "../script";
import { generateTimeOptions } from "../timeOptions";
import type { DayEntry, SubmissionData } from "../types";
import { buildDateNotesInput, buildSubmissionInput, type SubmitShiftPayload } from "./buildSubmissionInput";
import { type SubmitFormData, submitFormSchema } from "./schema";
import { buildPreviousPatternEntries } from "./script";

type UseSubmitFormControllerParams = {
  data: SubmissionData;
  onSubmit: (payload: SubmitShiftPayload, acceptedLegal?: boolean) => Promise<void>;
};

const buildPayload = (
  data: SubmissionData,
  entries: DayEntry[],
  dateNotes: Readonly<Record<string, string>>,
): SubmitShiftPayload => ({
  submission: buildSubmissionInput(data.submissionPattern, entries),
  dateNotes: buildDateNotesInput(dateNotes, data.shopClosedDates),
});

export function useSubmitFormController({ data, onSubmit }: UseSubmitFormControllerParams) {
  const latestWorkingTimeRef = useRef<WorkingTime | undefined>(undefined);
  const latestShiftTypeOptionIdsRef = useRef<string[] | undefined>(undefined);
  const pendingLateSubmissionRef = useRef<{
    payload: SubmitShiftPayload;
    acceptedLegal?: boolean;
  } | null>(null);
  const [editingNoteDate, setEditingNoteDate] = useState<string | null>(null);
  const lateSubmitDialog = useDialog();
  const isLateInitialSubmission = !data.isBeforeDeadline && !data.hasSubmitted;
  const dates = useMemo(() => getDateRange(data.periodStart, data.periodEnd), [data.periodStart, data.periodEnd]);
  const shopClosedDateSet = useMemo(() => new Set(data.shopClosedDates), [data.shopClosedDates]);
  const timeOptions = useMemo(
    () => generateTimeOptions(data.timeRange.startTime, data.timeRange.endTime),
    [data.timeRange.startTime, data.timeRange.endTime],
  );

  const initialEntries = useMemo(() => buildInitialEntries(dates, data), [dates, data]);
  const initialDateNotes = useMemo(
    () => Object.fromEntries((data.existingDateNotes ?? []).map(({ date, note }) => [date, note])),
    [data.existingDateNotes],
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
      entries: initialEntries,
      dateNotes: initialDateNotes,
      acceptedLegal: false,
    },
  });

  const entries = watch("entries");
  const dateNotes = watch("dateNotes") ?? {};
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

    const payload = buildPayload(data, formData.entries, formData.dateNotes ?? {});
    if (isLateInitialSubmission) {
      pendingLateSubmissionRef.current = { payload, acceptedLegal: formData.acceptedLegal };
      lateSubmitDialog.open();
      return;
    }

    await onSubmit(payload, formData.acceptedLegal);
  });

  const { run: submitLate, isRunning: isLateSubmitting } = useSingleFlight(async () => {
    const pending = pendingLateSubmissionRef.current;
    if (!pending) return;

    await onSubmit(pending.payload, pending.acceptedLegal);
    pendingLateSubmissionRef.current = null;
    lateSubmitDialog.close();
  });

  const handleSaveNote = (date: string, note: string) => {
    const nextDateNotes = { ...dateNotes };
    const normalizedNote = normalizeShiftDateNote(note);
    if (normalizedNote) nextDateNotes[date] = normalizedNote;
    else delete nextDateNotes[date];
    setValue("dateNotes", nextDateNotes, { shouldDirty: true });
    setEditingNoteDate(null);
  };

  const handleAcceptedLegalChange = (checked: boolean) => {
    setValue("acceptedLegal", checked, { shouldDirty: true, shouldValidate: true });
  };

  // 送信する内容が保存済みの内容と変わったかで判定し、変更後に元へ戻した場合は表示しない。
  const savedPayloadKey = useMemo(
    () => JSON.stringify(buildPayload(data, initialEntries, initialDateNotes)),
    [data, initialEntries, initialDateNotes],
  );
  const hasUnsentChanges =
    data.hasSubmitted && JSON.stringify(buildPayload(data, entries, dateNotes)) !== savedPayloadKey;

  const days = entries.map((entry: DayEntry, index) => ({
    entry,
    index,
    isShopClosed: shopClosedDateSet.has(entry.date),
    note: dateNotes[entry.date],
    error: errors.entries?.[index]?.endTime?.message,
  }));

  return {
    days,
    acceptedLegal: acceptedLegal === true,
    acceptedLegalError: errors.acceptedLegal?.message,
    canApplyPreviousPattern,
    hasUnsentChanges,
    noteEditor: {
      date: editingNoteDate,
      note: editingNoteDate ? (dateNotes[editingNoteDate] ?? "") : "",
      open: (date: string) => {
        if (!shopClosedDateSet.has(date)) setEditingNoteDate(date);
      },
      close: () => setEditingNoteDate(null),
      save: handleSaveNote,
    },
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
