import { Box, Checkbox, Flex, HStack, Icon, Stack, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { LuPointer, LuRefreshCw } from "react-icons/lu";
import type { ShiftSubmissionPattern, ShiftTypeOption } from "@/convex/shop/schemas";
import { LegalDocumentLink } from "@/src/components/features/LegalDocumentLink";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { formatDateWithWeekday, getDateRange } from "@/src/domains/shift/date";
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
import { buildEntries, formatPeriodLabel, formatTime, generateTimeOptions, getDateColor } from "../utils/timeOptions";
import { type SubmitFormData, submitFormSchema } from "./schema";

export type SubmitShiftSelectionInput =
  | { kind: "time"; requests: Array<{ date: string; startTime: string; endTime: string }> }
  | { kind: "dateOnly"; workingDates: string[] }
  | { kind: "shiftType"; selections: Array<{ date: string; optionId: string }> };

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
    const selectionMap = new Map(data.existingSelection.selections.map((selection) => [selection.date, selection]));
    const optionMap = new Map(data.submissionPattern.options.map((option) => [option.id, option]));
    return dates.map((date) => {
      const selection = selectionMap.get(date);
      const option = selection ? optionMap.get(selection.optionId) : undefined;
      const entry = option
        ? {
            date,
            isWorking: true,
            startTime: option.startTime,
            endTime: option.endTime,
            optionId: option.id,
          }
        : { date, isWorking: false, startTime: data.timeRange.startTime, endTime: data.timeRange.endTime };
      return shopClosedDateSet.has(date) ? buildRestEntry(entry) : entry;
    });
  }

  return buildEntries(dates, data.existingRequests, data.timeRange).map((entry) =>
    shopClosedDateSet.has(entry.date) ? buildRestEntry(entry) : entry,
  );
};

const buildSubmissionInput = (pattern: ShiftSubmissionPattern, entries: DayEntry[]): SubmitShiftSelectionInput => {
  if (pattern.kind === "dateOnly") {
    return { kind: "dateOnly", workingDates: entries.filter((entry) => entry.isWorking).map((entry) => entry.date) };
  }
  if (pattern.kind === "shiftType") {
    return {
      kind: "shiftType",
      selections: entries
        .filter((entry) => entry.isWorking && entry.optionId)
        .map((entry) => ({ date: entry.date, optionId: entry.optionId as string })),
    };
  }
  return {
    kind: "time",
    requests: entries
      .filter((entry) => entry.isWorking)
      .map((entry) => ({ date: entry.date, startTime: entry.startTime, endTime: entry.endTime })),
  };
};

export const SubmitFormView = ({ data, onSubmit }: Props) => {
  const latestWorkingTimeRef = useRef<WorkingTime | undefined>(undefined);
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
    setValue(`entries.${index}`, buildRestEntry(entry), { shouldDirty: true, shouldValidate: true });
  };

  const handleShiftTypeSelect = (index: number, optionId: string) => {
    if (data.submissionPattern.kind !== "shiftType") return;
    const entry = entries[index];
    if (shopClosedDateSet.has(entry.date)) return;
    const option = data.submissionPattern.options.find((item) => item.id === optionId);
    if (!option) return;
    setValue(
      `entries.${index}`,
      {
        date: entry.date,
        isWorking: true,
        startTime: option.startTime,
        endTime: option.endTime,
        optionId: option.id,
      },
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const handleApplyPreviousPattern = () => {
    if (!previousPatternEntries) return;
    latestWorkingTimeRef.current = undefined;
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
    await onSubmit(buildSubmissionInput(data.submissionPattern, formData.entries), formData.acceptedLegal);
  });

  return (
    <SubmitPageLayout>
      <SubmitPageHeader shopName={data.shopName} />

      <Box bg="white" w="full" borderBottomWidth={1} borderColor="border.default">
        <Flex maxW={STAFF_CONTENT_MAX_W} mx="auto" px={4} py={3} align="center">
          <Box>
            <Text fontSize="sm" fontWeight="semibold">
              {formatPeriodLabel(data.periodStart, data.periodEnd)}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              提出締切: {formatDateWithWeekday(data.deadline)}
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
                初回の提出時、または利用規約・プライバシーポリシーに大きな変更があった場合のみ、確認をお願いしています。
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
            loading={isSubmitting}
          >
            {data.hasSubmitted ? "希望シフトを更新" : "希望シフトを提出"}
          </Button>
        </Box>
      </SubmitPageContent>
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
      bg={isShopClosed ? "gray.50" : entry.isWorking ? "teal.50" : "white"}
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
  onSelect,
  onClear,
  isShopClosed,
  isReadOnly = false,
}: {
  entry: DayEntry;
  options: ShiftTypeOption[];
  onSelect?: (optionId: string) => void;
  onClear?: () => void;
  isShopClosed: boolean;
  isReadOnly?: boolean;
}) => {
  const dateLabel = formatDateWithWeekday(entry.date);
  const dateColor = getDateColor(entry.date);
  const visibleOptions =
    isReadOnly && entry.isWorking ? options.filter((option) => option.id === entry.optionId) : options;

  return (
    <Stack
      w="full"
      gap={2}
      p={3}
      bg={isShopClosed ? "gray.50" : "white"}
      borderRadius="lg"
      borderWidth={1}
      borderColor={entry.isWorking && !isShopClosed ? "teal.600" : "border.default"}
    >
      <Flex align="center" justify="space-between">
        <Text fontSize="sm" fontWeight="medium" color={dateColor}>
          {dateLabel}
        </Text>
        {isShopClosed ? (
          <Text fontSize="xs" fontWeight="bold" color="gray.500">
            定休日
          </Text>
        ) : isReadOnly ? (
          <Text fontSize="xs" fontWeight="medium" color="fg.muted">
            {entry.isWorking ? "提出済み" : "休み"}
          </Text>
        ) : (
          <Button type="button" size="xs" variant="ghost" colorPalette="gray" onClick={onClear}>
            休み
          </Button>
        )}
      </Flex>
      {!isShopClosed && visibleOptions.length > 0 && (
        <HStack gap={2} wrap="wrap">
          {visibleOptions.map((option) => {
            const isSelected = entry.optionId === option.id;
            return (
              <Button
                key={option.id}
                type="button"
                size="sm"
                h="auto"
                minH="40px"
                px={3}
                py={1.5}
                variant={isSelected ? "solid" : "outline"}
                colorPalette={isSelected ? "teal" : "gray"}
                bg={isSelected ? undefined : "white"}
                disabled={isReadOnly}
                onClick={() => onSelect?.(option.id)}
              >
                <Stack gap={0} align="flex-start">
                  <Text fontSize="xs" fontWeight="semibold">
                    {option.name}
                  </Text>
                  <Text fontSize="2xs">
                    {formatTime(option.startTime)}〜{formatTime(option.endTime)}
                  </Text>
                </Stack>
              </Button>
            );
          })}
        </HStack>
      )}
    </Stack>
  );
};
