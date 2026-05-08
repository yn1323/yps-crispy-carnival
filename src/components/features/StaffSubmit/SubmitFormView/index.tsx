import { Box, Checkbox, Flex, Icon, Link, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { LuPointer } from "react-icons/lu";
import { formatDateWithWeekday, getDateRange } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { STAFF_CONTENT_MAX_W } from "@/src/components/templates/StaffHeader";
import { Button } from "@/src/components/ui/Button";
import { DayCard, type DayEntry } from "../DayCard";
import { SubmitPageContent, SubmitPageHeader, SubmitPageLayout } from "../SubmitPageLayout";
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
};

type Props = {
  data: SubmissionData;
  onSubmit: (entries: DayEntry[], acceptedLegal?: boolean) => Promise<void>;
};

export const SubmitFormView = ({ data, onSubmit }: Props) => {
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
    setValue(`entries.${index}.isWorking`, true, { shouldValidate: true });
  };

  const handleTimeChange = (index: number, field: "startTime" | "endTime", value: string) => {
    setValue(`entries.${index}.${field}`, value, { shouldValidate: true });
  };

  const handleClear = (index: number) => {
    setValue(`entries.${index}.isWorking`, false, { shouldValidate: true });
    setValue(`entries.${index}.startTime`, data.timeRange.startTime);
    setValue(`entries.${index}.endTime`, data.timeRange.endTime);
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
                  <Link
                    href={data.legalDocuments.terms.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="teal.700"
                  >
                    利用規約
                  </Link>
                  と
                  <Link
                    href={data.legalDocuments.privacy.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    color="teal.700"
                  >
                    プライバシーポリシー
                  </Link>
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
