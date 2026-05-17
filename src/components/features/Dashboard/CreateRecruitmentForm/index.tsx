import { Box, type DateValue, Field, Flex, HStack, Icon, parseDate, Separator, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { LuCalendarCheck, LuCalendarDays, LuChevronLeft, LuStore, LuTimer } from "react-icons/lu";
import type { RegularClosedDay, ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { Button } from "@/src/components/ui/Button";
import { formatDateWithWeekday, getWeekdayLabel } from "@/src/domains/shift/date";
import { CalendarPicker } from "./CalendarPicker";
import {
  type CreateRecruitmentData,
  createRecruitmentFormSchema,
  deriveShopClosedDatesFromRegularDays,
  getInclusiveDateCount,
  pruneHolidaysInRange,
} from "./index";

type Step = "period" | "holidays" | "deadline" | "confirm";

type Props = {
  defaultValues?: CreateRecruitmentData;
  regularClosedDays?: RegularClosedDay[];
  submissionPattern?: ShiftSubmissionPattern;
  onSubmit: (data: CreateRecruitmentData) => void;
  onCancel?: () => void;
};

const steps: Array<{ key: Step; label: string }> = [
  { key: "period", label: "期間" },
  { key: "holidays", label: "お休み" },
  { key: "deadline", label: "提出期限" },
  { key: "confirm", label: "確認" },
];

const toIso = (date: DateValue): string => date.toString();

const toDateValue = (date?: string): DateValue | undefined => {
  if (!date) return undefined;
  try {
    return parseDate(date);
  } catch {
    return undefined;
  }
};

const toDateValues = (dates: string[]): DateValue[] =>
  dates.map(toDateValue).filter((date): date is DateValue => !!date);

const getCalendarMonthCount = (start?: string, end?: string): 1 | 2 => {
  if (!start || !end) return 1;
  return dayjs(start).isSame(end, "month") ? 1 : 2;
};

const toMonthStartDateValue = (date?: string): DateValue | undefined => {
  if (!date) return undefined;
  return parseDate(dayjs(date).startOf("month").format("YYYY-MM-DD"));
};

const formatCompactDateList = (dates: string[]): string =>
  dates
    .map((date, index) => {
      const previous = dates[index - 1];
      const shouldShowMonth = !previous || !dayjs(date).isSame(previous, "month");
      const format = shouldShowMonth ? "M/D" : "D";
      return `${dayjs(date).format(format)}(${getWeekdayLabel(date)})`;
    })
    .join(", ");

const getHolidaySummary = (holidays: string[]): { value: string; detail?: string } => {
  const sortedHolidays = [...holidays].sort();
  if (sortedHolidays.length === 0) {
    return { value: "なし" };
  }

  const visibleHolidays = formatCompactDateList(sortedHolidays.slice(0, 3));
  const hiddenCount = sortedHolidays.length - 3;
  return {
    value: `${sortedHolidays.length}日`,
    detail: hiddenCount > 0 ? `${visibleHolidays} ほか${hiddenCount}日` : visibleHolidays,
  };
};

const getSubmissionPatternSummary = (pattern: ShiftSubmissionPattern): { value: string; detail?: string } => {
  if (pattern.kind === "dateOnly") {
    return { value: "日ごと", detail: "出勤できる日だけ集めます" };
  }
  if (pattern.kind === "shiftType") {
    const detail = pattern.options
      .slice(0, 3)
      .map((option) => `${option.name} ${option.startTime}〜${option.endTime}`)
      .join(", ");
    const hiddenCount = pattern.options.length - 3;
    return { value: "勤務区分", detail: hiddenCount > 0 ? `${detail} ほか${hiddenCount}件` : detail };
  }
  return { value: "時間指定", detail: `${pattern.startTime}〜${pattern.endTime}の範囲で集めます` };
};

const isDeadlineInRange = (deadline: string, today: string, periodStart?: string): boolean => {
  if (!deadline) return false;
  if (deadline < today) return false;
  if (periodStart && deadline >= periodStart) return false;
  return true;
};

const StepIndicator = ({ currentStep }: { currentStep: Step }) => {
  const currentIndex = steps.findIndex((step) => step.key === currentStep);

  return (
    <Flex gap={2} align="center" px={{ base: 4, md: 0 }}>
      {steps.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <Flex key={step.key} align="center" flex={1} minW={0}>
            <HStack gap={2} minW={0}>
              <Flex
                w="24px"
                h="24px"
                borderRadius="full"
                align="center"
                justify="center"
                bg={isCurrent || isDone ? "teal.500" : "gray.100"}
                color={isCurrent || isDone ? "white" : "gray.500"}
                fontSize="xs"
                fontWeight="bold"
                flexShrink={0}
              >
                {isDone ? "✓" : index + 1}
              </Flex>
              <Text
                display={{ base: isCurrent ? "block" : "none", md: "block" }}
                fontSize="sm"
                fontWeight={isCurrent ? "bold" : "semibold"}
                color={isCurrent ? "gray.900" : isDone ? "teal.700" : "gray.500"}
                whiteSpace="nowrap"
              >
                {step.label}
              </Text>
            </HStack>
            {index < steps.length - 1 && <Box flex={1} h="1px" bg={isDone ? "teal.300" : "gray.200"} mx={2} />}
          </Flex>
        );
      })}
    </Flex>
  );
};

const StepTitle = ({ icon, title, description }: { icon: ComponentType; title: string; description: string }) => (
  <HStack gap={3} align="flex-start">
    <Flex w="36px" h="36px" borderRadius="full" bg="teal.50" color="teal.600" align="center" justify="center">
      <Icon as={icon} boxSize={5} />
    </Flex>
    <Stack gap={1}>
      <Text fontSize="md" fontWeight="bold" color="gray.900">
        {title}
      </Text>
      <Text fontSize="sm" color="fg.muted" lineHeight={1.7}>
        {description}
      </Text>
    </Stack>
  </HStack>
);

const SummaryLine = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
  <Flex gap={3} py={2} justify="flex-start" align="baseline">
    <Text w="50%" fontSize="sm" color="fg.muted">
      {label}
    </Text>
    <Stack w="50%" gap={0.5} align="stretch">
      <Text fontSize="sm" fontWeight="semibold" color="gray.900" textAlign="left">
        {value}
      </Text>
      {detail && (
        <Text fontSize="xs" color="fg.muted" lineHeight={1.6}>
          {detail}
        </Text>
      )}
    </Stack>
  </Flex>
);

export const CreateRecruitmentForm = ({
  defaultValues,
  regularClosedDays = [],
  submissionPattern = { kind: "dateOnly" },
  onSubmit,
  onCancel,
}: Props) => {
  const today = dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
  const [currentStep, setCurrentStep] = useState<Step>("period");
  const [periodValue, setPeriodValue] = useState<DateValue[]>(() =>
    toDateValues([defaultValues?.periodStart, defaultValues?.periodEnd].filter((date): date is string => !!date)),
  );
  const [selectedHolidays, setSelectedHolidays] = useState<string[]>(defaultValues?.shopClosedDates ?? []);

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    clearErrors,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateRecruitmentData>({
    resolver: zodResolver(createRecruitmentFormSchema),
    defaultValues: defaultValues ?? {
      periodStart: "",
      periodEnd: "",
      deadline: "",
      shopClosedDates: [],
    },
  });

  const periodStart = watch("periodStart");
  const periodEnd = watch("periodEnd");
  const deadline = watch("deadline");
  const hasPeriodError = !!errors.periodStart || !!errors.periodEnd;

  const periodDays = getInclusiveDateCount(periodStart, periodEnd);
  const allPeriodDaysAreHolidays = periodDays > 0 && selectedHolidays.length >= periodDays;
  const periodLabel =
    periodStart && periodEnd
      ? `${formatDateWithWeekday(periodStart)} 〜 ${formatDateWithWeekday(periodEnd)}`
      : "未選択";
  const deadlineMax = periodStart ? dayjs(periodStart).subtract(1, "day").format("YYYY-MM-DD") : undefined;

  const periodInitialFocus = useMemo(() => parseDate(dayjs(today).startOf("month").format("YYYY-MM-DD")), [today]);
  const periodMin = useMemo(() => parseDate(tomorrow), [tomorrow]);
  const periodMax = useMemo(() => parseDate(dayjs(today).add(1, "month").endOf("month").format("YYYY-MM-DD")), [today]);
  const holidayMin = toDateValue(periodStart);
  const holidayMax = toDateValue(periodEnd);
  const deadlineMin = useMemo(() => parseDate(today), [today]);
  const deadlineMaxValue = toDateValue(deadlineMax);
  const holidayDesktopMonths = getCalendarMonthCount(periodStart, periodEnd);
  const deadlineDesktopMonths = getCalendarMonthCount(today, deadlineMax);
  const holidayInitialFocus = toMonthStartDateValue(periodStart);
  const holidaySummary = getHolidaySummary(selectedHolidays);
  const submissionPatternSummary = getSubmissionPatternSummary(submissionPattern);

  useEffect(() => {
    setSelectedHolidays((current) => {
      const nextHolidays = pruneHolidaysInRange(current, periodStart, periodEnd);
      setValue("shopClosedDates", nextHolidays, { shouldDirty: true });
      return nextHolidays;
    });
  }, [periodStart, periodEnd, setValue]);

  useEffect(() => {
    if (!deadline || isDeadlineInRange(deadline, today, periodStart)) return;
    setValue("deadline", "", { shouldDirty: true });
    clearErrors("deadline");
  }, [clearErrors, deadline, periodStart, setValue, today]);

  const handlePeriodChange = (value: DateValue[]) => {
    const nextValue = value.slice(0, 2);
    const start = nextValue[0] ? toIso(nextValue[0]) : "";
    const end = nextValue[1] ? toIso(nextValue[1]) : "";
    const defaultShopClosedDates = deriveShopClosedDatesFromRegularDays(start, end, regularClosedDays);
    setPeriodValue(nextValue);
    setValue("periodStart", start, { shouldDirty: true });
    setValue("periodEnd", end, { shouldDirty: true });
    setValue("shopClosedDates", defaultShopClosedDates, { shouldDirty: true });
    setSelectedHolidays(defaultShopClosedDates);
    clearErrors(["periodStart", "periodEnd"]);
  };

  const handleHolidayChange = (value: DateValue[]) => {
    const holidays = pruneHolidaysInRange(value.map(toIso), periodStart, periodEnd);
    setSelectedHolidays(holidays);
    setValue("shopClosedDates", holidays, { shouldDirty: true });
  };

  const handleDeadlineChange = (value: DateValue[]) => {
    const nextDeadline = value[0] ? toIso(value[0]) : "";
    setValue("deadline", nextDeadline, { shouldDirty: true });
    clearErrors("deadline");
  };

  const validatePeriodStep = () => {
    if (!periodStart) {
      setError("periodStart", { message: "開始日を選択してください" });
      return false;
    }
    if (!periodEnd) {
      setError("periodEnd", { message: "終了日を選択してください" });
      return false;
    }
    if (periodEnd < periodStart) {
      setError("periodEnd", { message: "終了日は開始日以降にしてください" });
      return false;
    }
    if (periodStart <= today) {
      setError("periodStart", { message: "開始日は明日以降にしてください" });
      return false;
    }
    clearErrors(["periodStart", "periodEnd"]);
    return true;
  };

  const goToHolidays = () => {
    if (!validatePeriodStep()) return;
    setCurrentStep("holidays");
  };

  const goToDeadline = () => {
    if (allPeriodDaysAreHolidays) return;
    setCurrentStep("deadline");
  };

  const validateDeadlineStep = () => {
    if (!deadline) {
      setError("deadline", { message: "提出締切日を選択してください" });
      return false;
    }
    if (deadline < today) {
      setError("deadline", { message: "締切日は今日以降にしてください" });
      return false;
    }
    if (periodStart && deadline >= periodStart) {
      setError("deadline", { message: "締切日は開始日より前にしてください" });
      return false;
    }
    clearErrors("deadline");
    return true;
  };

  const goToConfirm = () => {
    if (!validateDeadlineStep()) return;
    setCurrentStep("confirm");
  };

  const submitForm = handleSubmit((data) => {
    onSubmit({ ...data, shopClosedDates: selectedHolidays });
  });

  return (
    <form id="create-recruitment-form" onSubmit={submitForm}>
      <input type="hidden" {...register("periodStart")} />
      <input type="hidden" {...register("periodEnd")} />
      <input type="hidden" {...register("deadline")} />

      <Flex minH={{ base: "calc(100dvh - 72px)", md: "auto" }} direction="column">
        <Box px={{ base: 0, md: 6 }} pt={{ base: 2, md: 0 }} pb={4}>
          <StepIndicator currentStep={currentStep} />
        </Box>

        <Box flex={1} overflowY="auto" px={{ base: 4, md: 6 }} pb={{ base: 4, md: 6 }}>
          {currentStep === "period" && (
            <Stack gap={5}>
              <StepTitle
                icon={LuCalendarDays}
                title="シフト期間を選択"
                description="今月と来月のカレンダーから、開始日と終了日を選んでください。"
              />
              <CalendarPicker
                selectionMode="range"
                value={periodValue}
                min={periodMin}
                max={periodMax}
                defaultFocusedValue={periodInitialFocus}
                desktopMonths={2}
                onValueChange={handlePeriodChange}
              />
              <Field.Root display={{ base: "block", md: "none" }}>
                <Field.Label>選択中の期間</Field.Label>
                <Box p={3} borderWidth={1} borderColor="border.default" borderRadius="md" bg="gray.50">
                  <Text fontSize="sm" fontWeight="semibold">
                    {periodLabel}
                  </Text>
                  <Text mt={1} fontSize="xs" color="fg.muted">
                    {periodDays > 0 ? `${periodDays}日間` : "カレンダーから開始日と終了日を選んでください"}
                  </Text>
                </Box>
              </Field.Root>
              {hasPeriodError && (
                <Field.Root invalid>
                  {errors.periodStart && <Field.ErrorText>{errors.periodStart.message}</Field.ErrorText>}
                  {errors.periodEnd && <Field.ErrorText>{errors.periodEnd.message}</Field.ErrorText>}
                </Field.Root>
              )}
            </Stack>
          )}

          {currentStep === "holidays" && (
            <Stack gap={5}>
              <StepTitle
                icon={LuStore}
                title="お店のお休みを選択"
                description="シフト募集期間の中で、お店を開けない日があれば選びます。設定しない場合はスキップできます。"
              />
              <CalendarPicker
                selectionMode="multiple"
                value={toDateValues(selectedHolidays)}
                min={holidayMin}
                max={holidayMax}
                defaultFocusedValue={holidayInitialFocus}
                desktopMonths={holidayDesktopMonths}
                highlightSelectableDates
                onValueChange={handleHolidayChange}
              />
              {allPeriodDaysAreHolidays && (
                <Field.Root invalid>
                  <Field.ErrorText>シフト期間のすべてをお休みにはできません</Field.ErrorText>
                </Field.Root>
              )}
            </Stack>
          )}

          {currentStep === "deadline" && (
            <Stack gap={5}>
              <StepTitle
                icon={LuTimer}
                title="提出締切日を選択"
                description="スタッフが希望シフトを提出できる締切日を選んでください。"
              />
              <Field.Root invalid={!!errors.deadline}>
                <CalendarPicker
                  selectionMode="single"
                  value={toDateValues(deadline ? [deadline] : [])}
                  min={deadlineMin}
                  max={deadlineMaxValue}
                  defaultFocusedValue={periodInitialFocus}
                  desktopMonths={deadlineDesktopMonths}
                  onValueChange={handleDeadlineChange}
                />
                {errors.deadline && <Field.ErrorText>{errors.deadline.message}</Field.ErrorText>}
              </Field.Root>
            </Stack>
          )}

          {currentStep === "confirm" && (
            <Stack gap={5}>
              <StepTitle
                icon={LuCalendarCheck}
                title="内容を確認"
                description="作成する募集の内容を確認してください。"
              />
              <Box borderWidth={1} borderColor="border.default" borderRadius="md" bg="white">
                <Box px={4} py={3}>
                  <SummaryLine label="シフト期間" value={periodLabel} />
                  <Separator />
                  <SummaryLine label="日数" value={periodDays > 0 ? `${periodDays}日` : "未選択"} />
                  <Separator />
                  <SummaryLine label="お店のお休み" value={holidaySummary.value} detail={holidaySummary.detail} />
                  <Separator />
                  <SummaryLine
                    label="提出方法"
                    value={submissionPatternSummary.value}
                    detail={submissionPatternSummary.detail}
                  />
                  <Separator />
                  <SummaryLine label="提出締切" value={deadline ? formatDateWithWeekday(deadline) : "未選択"} />
                </Box>
              </Box>
              <Text fontSize="xs" color="fg.muted" lineHeight={1.6}>
                提出方法は募集作成時点の店舗設定で固定されます。
              </Text>
            </Stack>
          )}
        </Box>

        <Box
          position={{ base: "sticky", md: "static" }}
          bottom={0}
          px={{ base: 4, md: 6 }}
          py={4}
          bg="white"
          borderTopWidth={1}
          borderColor="border.default"
        >
          {currentStep === "period" && (
            <Flex justify="space-between" gap={3}>
              <Button type="button" variant="outline" onClick={onCancel} flex={{ base: 1, md: "unset" }}>
                キャンセル
              </Button>
              <Button type="button" colorPalette="teal" onClick={goToHolidays} flex={{ base: 1, md: "unset" }}>
                次へ
              </Button>
            </Flex>
          )}

          {currentStep === "holidays" && (
            <Flex justify="space-between" gap={3}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep("period")}
                flex={{ base: 1, md: "unset" }}
              >
                <LuChevronLeft />
                戻る
              </Button>
              <Button type="button" colorPalette="teal" onClick={goToDeadline} flex={{ base: 1, md: "unset" }}>
                次へ
              </Button>
            </Flex>
          )}

          {currentStep === "deadline" && (
            <Flex justify="space-between" gap={3}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep("holidays")}
                flex={{ base: 1, md: "unset" }}
              >
                <LuChevronLeft />
                戻る
              </Button>
              <Button type="button" colorPalette="teal" onClick={goToConfirm} flex={{ base: 1, md: "unset" }}>
                確認へ
              </Button>
            </Flex>
          )}

          {currentStep === "confirm" && (
            <Flex justify="space-between" gap={3}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCurrentStep("deadline")}
                flex={{ base: 1, md: "unset" }}
              >
                <LuChevronLeft />
                戻る
              </Button>
              <Button type="submit" colorPalette="teal" loading={isSubmitting} flex={{ base: 1, md: "unset" }}>
                募集をつくる
              </Button>
            </Flex>
          )}
        </Box>
      </Flex>
    </form>
  );
};
