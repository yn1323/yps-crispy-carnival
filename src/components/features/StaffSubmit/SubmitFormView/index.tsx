import { Box, Checkbox, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef } from "react";
import { useForm } from "react-hook-form";
import { LuPointer, LuRefreshCw } from "react-icons/lu";
import { LegalDocumentLink } from "@/src/components/features/LegalDocumentLink";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/Header";
import { Button } from "@/src/components/ui/Button";
import { formatDateWithWeekday, getDateRange } from "@/src/domains/shift/date";
import { DayCard, type DayEntry } from "../DayCard";
import { SubmitPageContent, SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";
import { buildRestEntry, buildWorkingEntry, type WorkingTime } from "../utils/dayEntryState";
import { buildEntriesFromPreviousWeeklyPattern, type PreviousWeeklyPattern } from "../utils/previousWeeklyPattern";
import { buildEntries, formatPeriodLabel, generateTimeOptions } from "../utils/timeOptions";
import { type SubmitFormData, submitFormSchema } from "./schema";

export type SubmissionData = {
  shopName: string;
  staffName: string;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  isBeforeDeadline: boolean;
  hasSubmitted: boolean;
  existingRequests: { date: string; startTime: string; endTime: string }[];
  legalConsentRequired: boolean;
  legalDocuments: {
    terms: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
    privacy: { title: string; documentVersion: string; requiredConsentVersion: string; path: string };
  };
  timeRange: { startTime: string; endTime: string };
  previousWeeklyPattern: PreviousWeeklyPattern | null;
};

type Props = {
  data: SubmissionData;
  onSubmit: (entries: DayEntry[], acceptedLegal?: boolean) => Promise<void>;
};

export const SubmitFormView = ({ data, onSubmit }: Props) => {
  const latestWorkingTimeRef = useRef<WorkingTime | undefined>(undefined);
  const dates = useMemo(() => getDateRange(data.periodStart, data.periodEnd), [data.periodStart, data.periodEnd]);
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
      entries: buildEntries(dates, data.existingRequests, data.timeRange),
      acceptedLegal: false,
    },
  });

  const entries = watch("entries");
  const acceptedLegal = watch("acceptedLegal");

  const handleSetWorking = (index: number) => {
    const entry = entries[index];
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

  const handleApplyPreviousPattern = () => {
    if (!data.previousWeeklyPattern) return;
    latestWorkingTimeRef.current = undefined;
    setValue("entries", buildEntriesFromPreviousWeeklyPattern(dates, data.previousWeeklyPattern, data.timeRange), {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onFormSubmit = handleSubmit(async (formData) => {
    if (data.legalConsentRequired && formData.acceptedLegal !== true) {
      setError("acceptedLegal", { message: "利用規約とプライバシーポリシーに同意してください" });
      return;
    }
    await onSubmit(formData.entries, formData.acceptedLegal);
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
            出勤できる日をタップしてください
          </Text>
        </Flex>

        {data.previousWeeklyPattern && (
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
              前回と同じシフトを適用
            </Button>
          </Box>
        )}

        <VStack px={4} py={3} gap={2}>
          {entries.map((entry, index) => (
            <DayCard
              key={entry.date}
              entry={entry}
              timeOptions={timeOptions}
              onToggleWorking={() => handleSetWorking(index)}
              onTimeChange={(field, value) => handleTimeChange(index, field, value)}
              onClear={() => handleClear(index)}
              error={errors.entries?.[index]?.endTime?.message}
            />
          ))}
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
                onCheckedChange={(details) => {
                  setValue("acceptedLegal", details.checked === true, { shouldDirty: true, shouldValidate: true });
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control />
                <Checkbox.Label fontSize="sm" lineHeight={1.7}>
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
