import { Box, Checkbox, Flex, HStack, Icon, Stack, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { LuPointer, LuRefreshCw, LuX } from "react-icons/lu";
import type { ShiftSubmissionPattern, ShiftTypeOption } from "@/convex/shop/schemas";
import { LegalDocumentLink } from "@/src/components/features/LegalDocumentLink";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { formatDatePeriodWithWeekday, formatDateWithWeekday, getDateRange } from "@/src/domains/shift/date";
import { formatShiftClockTimeRange } from "@/src/domains/shift/time";
import { DayCard, type DayEntry } from "../DayCard";
import { SubmitPageContent, SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";
import { buildRestEntry, buildWorkingEntry, type WorkingTime } from "../utils/dayEntryState";
import {
  buildEntriesFromPreviousDateOnlyPattern,
  buildEntriesFromPreviousWeeklyPattern,
  buildEntriesFromPreviousWeeklyPatternForShiftTypes,
  type PreviousDateOnlyPattern,
  type PreviousWeeklyPattern,
} from "../utils/previousWeeklyPattern";
import { buildEntries, generateTimeOptions, getDateColor } from "../utils/timeOptions";
import { buildSubmissionInput, type SubmitShiftSelectionInput } from "./buildSubmissionInput";
import { type SubmitFormData, submitFormSchema } from "./schema";

export type { SubmitShiftSelectionInput } from "./buildSubmissionInput";

type ExistingSelection =
  | { kind: "time"; requests: Array<{ date: string; startTime: string; endTime: string }> }
  | {
      kind: "dateOnly";
      workingDates: string[];
      unmatchedRequests?: Array<{ date: string; startTime: string; endTime: string }>;
    }
  | {
      kind: "shiftType";
      selections: Array<{ date: string; optionId: string }>;
      unmatchedRequests?: Array<{ date: string; startTime: string; endTime: string }>;
    };

export type SubmissionData = {
  shopName: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  shopClosedDates: string[];
  submissionPattern: ShiftSubmissionPattern;
  isBeforeDeadline: boolean;
  hasSubmitted: boolean;
  existingRequests: { date: string; startTime: string; endTime: string }[];
  existingSelection: ExistingSelection;
  legalConsentRequired: boolean;
  legalDocuments: {
    terms: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
    privacy: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
  };
  timeRange: { startTime: string; endTime: string };
  previousWeeklyPattern: PreviousWeeklyPattern | null;
  previousDateOnlyPattern: PreviousDateOnlyPattern | null;
};

type Props = {
  data: SubmissionData;
  onSubmit: (submission: SubmitShiftSelectionInput, acceptedLegal?: boolean) => Promise<void>;
};

const getInstructionText = (pattern: ShiftSubmissionPattern): string => {
  if (pattern.kind === "dateOnly") return "出勤できる日をタップしてください";
  if (pattern.kind === "shiftType") return "出勤できる日ごとに勤務区分を選んでください";
  return "出勤できる日をタップして、時間を選んでください";
};

const buildInitialEntries = (dates: string[], data: SubmissionData, shopClosedDateSet: Set<string>): DayEntry[] => {
  if (data.submissionPattern.kind === "dateOnly" && data.existingSelection.kind === "dateOnly") {
    const workingDateSet = new Set(data.existingSelection.workingDates);
    return dates.map((date) => {
      const entry = workingDateSet.has(date)
        ? { date, isWorking: true, startTime: data.timeRange.startTime, endTime: data.timeRange.endTime }
        : { date, isWorking: false, startTime: data.timeRange.startTime, endTime: data.timeRange.endTime };
      return shopClosedDateSet.has(date) ? buildRestEntry(entry) : entry;
    });
  }

  if (data.submissionPattern.kind === "shiftType" && data.existingSelection.kind === "shiftType") {
    const selectionsByDate = new Map<string, string[]>();
    for (const selection of data.existingSelection.selections) {
      selectionsByDate.set(selection.date, [...(selectionsByDate.get(selection.date) ?? []), selection.optionId]);
    }
    const optionMap = new Map(data.submissionPattern.options.map((option) => [option.id, option]));
    return dates.map((date) => {
      const optionIds = (selectionsByDate.get(date) ?? []).filter((optionId) => optionMap.has(optionId));
      const firstOption = optionIds.length > 0 ? optionMap.get(optionIds[0]) : undefined;
      const entry = firstOption
        ? {
            date,
            isWorking: true,
            startTime: firstOption.startTime,
            endTime: firstOption.endTime,
            optionId: firstOption.id,
            optionIds,
          }
        : { date, isWorking: false, startTime: data.timeRange.startTime, endTime: data.timeRange.endTime };
      return shopClosedDateSet.has(date) ? buildRestEntry(entry) : entry;
    });
  }

  return buildEntries(dates, data.existingRequests, data.timeRange).map((entry) =>
    shopClosedDateSet.has(entry.date) ? buildRestEntry(entry) : entry,
  );
};

const getSelectedShiftTypeOptionIds = (entry: DayEntry): string[] => {
  if (entry.optionIds) return entry.optionIds;
  return entry.optionId ? [entry.optionId] : [];
};

export const SubmitFormView = ({ data, onSubmit }: Props) => {
  const latestWorkingTimeRef = useRef<WorkingTime | undefined>(undefined);
  const latestShiftTypeOptionIdsRef = useRef<string[] | undefined>(undefined);
  const pendingLateSubmissionRef = useRef<{ submission: SubmitShiftSelectionInput; acceptedLegal?: boolean } | null>(
    null,
  );
  const [isLateSubmitting, setIsLateSubmitting] = useState(false);
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
      entries: buildInitialEntries(dates, data, shopClosedDateSet),
      acceptedLegal: false,
    },
  });

  const entries = watch("entries");
  const acceptedLegal = watch("acceptedLegal");
  const previousPatternEntries = useMemo(() => {
    let builtEntries: DayEntry[] | null = null;

    if (data.submissionPattern.kind === "dateOnly") {
      builtEntries = data.previousDateOnlyPattern
        ? buildEntriesFromPreviousDateOnlyPattern(dates, data.previousDateOnlyPattern, data.timeRange)
        : null;
    } else if (data.submissionPattern.kind === "shiftType" && data.previousWeeklyPattern) {
      builtEntries = buildEntriesFromPreviousWeeklyPatternForShiftTypes(
        dates,
        data.previousWeeklyPattern,
        data.timeRange,
        data.submissionPattern.options,
      );
    } else if (data.previousWeeklyPattern) {
      builtEntries = buildEntriesFromPreviousWeeklyPattern(dates, data.previousWeeklyPattern, data.timeRange);
    }

    if (!builtEntries) return null;

    return builtEntries.map((entry) => (shopClosedDateSet.has(entry.date) ? buildRestEntry(entry) : entry));
  }, [
    dates,
    data.previousDateOnlyPattern,
    data.previousWeeklyPattern,
    data.submissionPattern,
    data.timeRange,
    shopClosedDateSet,
  ]);
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

  const onFormSubmit = handleSubmit(async (formData) => {
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

  const handleLateSubmitConfirm = async () => {
    const pending = pendingLateSubmissionRef.current;
    if (!pending || isLateSubmitting) return;
    setIsLateSubmitting(true);
    try {
      await onSubmit(pending.submission, pending.acceptedLegal);
      pendingLateSubmissionRef.current = null;
      lateSubmitDialog.close();
    } finally {
      setIsLateSubmitting(false);
    }
  };

  return (
    <SubmitPageLayout>
      <SubmitPageHeader shopName={data.shopName} />

      <Box bg="white" w="full" borderBottomWidth={1} borderColor="border.default">
        <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" px={4} py={3} align="center">
          <Box>
            <Text fontSize="sm" fontWeight="semibold">
              {formatDatePeriodWithWeekday(data.periodStart, data.periodEnd)}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              提出締切: {formatDateWithWeekday(data.deadline)} 23:59
            </Text>
          </Box>
        </Flex>
      </Box>

      <SubmitPageContent>
        <Flex px={4} pt={3} gap={1.5} align="center">
          <Icon color="fg.subtle" boxSize={3.5}>
            <LuPointer />
          </Icon>
          <Text fontSize="xs" fontWeight="medium" color="fg.muted">
            {getInstructionText(data.submissionPattern)}
          </Text>
        </Flex>

        {canApplyPreviousPattern && (
          <Box px={4} pt={3}>
            <Button
              type="button"
              w="full"
              h="44px"
              variant="outline"
              colorPalette="teal"
              bg="white"
              borderRadius="lg"
              fontWeight="semibold"
              onClick={handleApplyPreviousPattern}
            >
              <Icon boxSize={4}>
                <LuRefreshCw />
              </Icon>
              {data.submissionPattern.kind === "dateOnly" ? "前回と同じ出勤日を適用" : "前回と同じシフトを適用"}
            </Button>
          </Box>
        )}

        <VStack px={4} py={3} gap={2}>
          {entries.map((entry, index) => {
            const isShopClosed = shopClosedDateSet.has(entry.date);
            if (data.submissionPattern.kind === "dateOnly") {
              return (
                <DateOnlySubmissionDayCard
                  key={entry.date}
                  entry={entry}
                  onToggleWorking={() => (entry.isWorking ? handleClear(index) : handleSetWorking(index))}
                  isShopClosed={isShopClosed}
                />
              );
            }
            if (data.submissionPattern.kind === "shiftType") {
              return (
                <ShiftTypeSubmissionDayCard
                  key={entry.date}
                  entry={entry}
                  options={data.submissionPattern.options}
                  onToggleWorking={() => handleSetWorking(index)}
                  onSelect={(optionId) => handleShiftTypeSelect(index, optionId)}
                  onClear={() => handleClear(index)}
                  isShopClosed={isShopClosed}
                />
              );
            }
            return (
              <DayCard
                key={entry.date}
                entry={entry}
                timeOptions={timeOptions}
                onToggleWorking={() => handleSetWorking(index)}
                onTimeChange={(field, value) => handleTimeChange(index, field, value)}
                onClear={() => handleClear(index)}
                isShopClosed={isShopClosed}
                error={errors.entries?.[index]?.endTime?.message}
              />
            );
          })}
        </VStack>

        <Box px={4} pt={2} pb={6}>
          {data.legalConsentRequired && (
            <Box mb={4} p={4} bg="white" borderWidth={1} borderColor="border.default" borderRadius="md">
              <Text mb={3} fontSize="xs" color="fg.muted" lineHeight={1.7}>
                初めての提出時や、規約の大きな変更があったときのみ確認をお願いしています。
              </Text>
              <Checkbox.Root
                colorPalette="teal"
                checked={acceptedLegal}
                cursor="pointer"
                onCheckedChange={(details) => {
                  setValue("acceptedLegal", details.checked === true, { shouldDirty: true, shouldValidate: true });
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control cursor="pointer" />
                <Checkbox.Label fontSize="sm" lineHeight={1.7} cursor="pointer">
                  <LegalDocumentLink href={data.legalDocuments.terms.path}>利用規約</LegalDocumentLink>と
                  <LegalDocumentLink href={data.legalDocuments.privacy.path}>プライバシーポリシー</LegalDocumentLink>
                  に同意します
                </Checkbox.Label>
              </Checkbox.Root>
              {errors.acceptedLegal && (
                <Text mt={2} fontSize="xs" color="red.600">
                  {errors.acceptedLegal.message}
                </Text>
              )}
            </Box>
          )}
          <Button
            w="full"
            h="48px"
            colorPalette="teal"
            borderRadius="lg"
            fontWeight="semibold"
            data-submit-action="primary"
            onClick={onFormSubmit}
            loading={isSubmitting || isLateSubmitting}
          >
            {data.hasSubmitted ? "希望シフトを更新" : "希望シフトを提出"}
          </Button>
        </Box>
      </SubmitPageContent>
      <Dialog
        title="提出締切を過ぎています"
        isOpen={lateSubmitDialog.isOpen}
        onOpenChange={lateSubmitDialog.onOpenChange}
        onClose={lateSubmitDialog.close}
        onSubmit={handleLateSubmitConfirm}
        submitLabel="この内容で提出する"
        isLoading={isLateSubmitting}
        isSubmitDisabled={isLateSubmitting}
      >
        <Text fontSize="sm" lineHeight="tall" color="fg.default">
          提出締切を過ぎています。提出後、このリンクでは変更できません。変更が必要な場合はシフト作成担当者に連絡してください。
        </Text>
      </Dialog>
    </SubmitPageLayout>
  );
};

export const DateOnlySubmissionDayCard = ({
  entry,
  onToggleWorking,
  isShopClosed,
  isReadOnly = false,
}: {
  entry: DayEntry;
  onToggleWorking?: () => void;
  isShopClosed: boolean;
  isReadOnly?: boolean;
}) => {
  const dateLabel = formatDateWithWeekday(entry.date);
  const dateColor = getDateColor(entry.date);

  return (
    <Flex
      w="full"
      minH="48px"
      px={4}
      align="center"
      justify="space-between"
      bg={isShopClosed ? "gray.100" : entry.isWorking ? "teal.50" : "white"}
      borderRadius="lg"
      borderWidth={1}
      borderColor={entry.isWorking && !isShopClosed ? "teal.600" : "border.default"}
      cursor={isShopClosed || isReadOnly ? "default" : "pointer"}
      onClick={isShopClosed || isReadOnly ? undefined : onToggleWorking}
      _hover={isShopClosed || isReadOnly ? undefined : { bg: entry.isWorking ? "teal.50" : "gray.50" }}
    >
      <Text fontSize="sm" fontWeight="medium" color={dateColor}>
        {dateLabel}
      </Text>
      <Box
        bg={isShopClosed ? "gray.100" : entry.isWorking ? "teal.100" : "gray.100"}
        px={2.5}
        py={0.5}
        borderRadius="full"
      >
        <Text
          fontSize="xs"
          fontWeight="semibold"
          color={isShopClosed ? "gray.500" : entry.isWorking ? "teal.700" : "fg.muted"}
        >
          {isShopClosed ? "定休日" : entry.isWorking ? "出勤希望" : "休み"}
        </Text>
      </Box>
    </Flex>
  );
};

export const ShiftTypeSubmissionDayCard = ({
  entry,
  options,
  onToggleWorking,
  onSelect,
  onClear,
  isShopClosed,
  isReadOnly = false,
}: {
  entry: DayEntry;
  options: ShiftTypeOption[];
  onToggleWorking?: () => void;
  onSelect?: (optionId: string) => void;
  onClear?: () => void;
  isShopClosed: boolean;
  isReadOnly?: boolean;
}) => {
  const dateLabel = formatDateWithWeekday(entry.date);
  const dateColor = getDateColor(entry.date);
  const selectedOptionIds = getSelectedShiftTypeOptionIds(entry);
  const selectedOptionIdSet = new Set(selectedOptionIds);
  const visibleOptions =
    isReadOnly && entry.isWorking ? options.filter((option) => selectedOptionIdSet.has(option.id)) : options;

  if (isShopClosed) {
    return (
      <Flex
        w="full"
        h="48px"
        px={4}
        align="center"
        justify="space-between"
        bg="gray.100"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
      >
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
        <Box bg="gray.100" px={2.5} py={0.5} borderRadius="full">
          <Text fontSize="xs" fontWeight="bold" color="gray.500">
            定休日
          </Text>
        </Box>
      </Flex>
    );
  }

  if (!entry.isWorking) {
    return (
      <Flex
        w="full"
        minH="48px"
        px={4}
        align="center"
        justify="space-between"
        bg="white"
        borderRadius="lg"
        borderWidth={1}
        borderColor="border.default"
        cursor={isReadOnly ? "default" : "pointer"}
        role={isReadOnly ? undefined : "button"}
        aria-label={isReadOnly ? undefined : `${dateLabel}を出勤希望にする`}
        onClick={isReadOnly ? undefined : onToggleWorking}
        _hover={isReadOnly ? undefined : { bg: "gray.50" }}
      >
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
        <Box bg="gray.100" px={2.5} py={0.5} borderRadius="full">
          <Text fontSize="xs" fontWeight="medium" color="fg.muted">
            休み
          </Text>
        </Box>
      </Flex>
    );
  }

  return (
    <Flex
      w="full"
      minH="64px"
      px={3}
      py={2}
      gap={3}
      align="center"
      bg="white"
      borderRadius="lg"
      borderWidth={1}
      borderColor={entry.isWorking ? "teal.500" : "border.default"}
    >
      <Flex minW="68px" h="36px" align="center" flexShrink={0}>
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
      </Flex>

      <HStack gap={2} wrap="wrap" flex={1} align="center">
        {visibleOptions.map((option) => {
          const isSelected = selectedOptionIdSet.has(option.id);
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              h="36px"
              minW="88px"
              px={3}
              py={1}
              variant="outline"
              colorPalette={isSelected ? "teal" : "gray"}
              bg={isSelected ? "teal.600" : "white"}
              borderColor={isSelected ? "teal.600" : "border.default"}
              color={isSelected ? "white" : undefined}
              disabled={isReadOnly}
              aria-pressed={isSelected}
              aria-label={`${dateLabel}の${option.name} ${isSelected ? "選択済み" : "未選択"}`}
              onClick={() => onSelect?.(option.id)}
            >
              <Stack gap={0} align="flex-start">
                <Text fontSize="xs" fontWeight="semibold" lineHeight={1.1}>
                  {option.name}
                </Text>
                <Text fontSize="2xs" lineHeight={1.1} color={isSelected ? "whiteAlpha.900" : "fg.muted"}>
                  {formatShiftClockTimeRange(option.startTime, option.endTime)}
                </Text>
              </Stack>
            </Button>
          );
        })}
      </HStack>

      {entry.isWorking && !isReadOnly && (
        <IconButton
          aria-label={`${dateLabel}を休みに戻す`}
          size="sm"
          variant="outline"
          borderRadius="full"
          onClick={onClear}
          colorPalette="gray"
          bg="white"
          flexShrink={0}
        >
          <LuX />
        </IconButton>
      )}
    </Flex>
  );
};
