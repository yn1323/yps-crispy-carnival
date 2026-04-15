import { Box, Button, Flex, Icon, Text, VStack } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { LuPointer } from "react-icons/lu";
import { formatDateWithWeekday, getDateRange } from "@/src/components/features/Shift/ShiftForm/utils/dateUtils";
import { DayCard, type DayEntry } from "../DayCard";
import { SubmitPageContent, SubmitPageLayout } from "../SubmitPageLayout";
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
  timeRange: { startTime: string; endTime: string };
};

type Props = {
  data: SubmissionData;
  onSubmit: (entries: DayEntry[]) => Promise<void>;
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
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubmitFormData>({
    resolver: zodResolver(submitFormSchema),
    defaultValues: {
      entries: buildEntries(dates, data.existingRequests, data.timeRange),
    },
  });

  const entries = watch("entries");

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
    await onSubmit(formData.entries);
  });

  return (
    <SubmitPageLayout>
      <Box bg="teal.600" w="full">
        <Box maxW="1024px" mx="auto" px={4} pt={3} pb={4}>
          <Text fontSize="xs" color="white" opacity={0.8}>
            {data.shopName}
          </Text>
          <Text fontSize="xl" fontWeight="bold" color="white">
            シフト希望を提出
          </Text>
        </Box>
      </Box>

      <Box bg="white" w="full" borderBottomWidth={1} borderColor="border.default">
        <Flex maxW="1024px" mx="auto" px={4} py={3} justify="space-between" align="center">
          <Box>
            <Text fontSize="sm" fontWeight="semibold">
              {formatPeriodLabel(data.periodStart, data.periodEnd)}
            </Text>
            <Text fontSize="xs" color="fg.muted">
              提出締切: {formatDateWithWeekday(data.deadline)}
            </Text>
          </Box>
          {data.hasSubmitted ? (
            <Box bg="green.50" px={2.5} py={1} borderRadius="full">
              <Text fontSize="xs" fontWeight="semibold" color="green.800">
                提出済み
              </Text>
            </Box>
          ) : (
            <Box bg="orange.50" px={2.5} py={1} borderRadius="full">
              <Text fontSize="xs" fontWeight="semibold" color="orange.800">
                未提出
              </Text>
            </Box>
          )}
        </Flex>
      </Box>

      <SubmitPageContent>
        <Flex px={4} pt={3} gap={1.5} align="center">
          <Icon color="fg.subtle" boxSize={3.5}>
            <LuPointer />
          </Icon>
          <Text fontSize="xs" fontWeight="medium" color="fg.muted">
            出勤する日をタップしてください
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
          <Button
            w="full"
            h="48px"
            colorPalette="teal"
            borderRadius="lg"
            fontWeight="semibold"
            onClick={onFormSubmit}
            loading={isSubmitting}
          >
            {data.hasSubmitted ? "修正して提出する" : "提出する"}
          </Button>
        </Box>
      </SubmitPageContent>
    </SubmitPageLayout>
  );
};
