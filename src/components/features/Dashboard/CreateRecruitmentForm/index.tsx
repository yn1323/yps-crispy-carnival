import { Box, type DateValue, Field, Flex, parseDate, Separator, Stack, Text } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { LuCalendarCheck, LuCalendarDays, LuChevronLeft, LuStore, LuTimer } from "react-icons/lu";
import type { RegularClosedDay, ShiftSubmissionPattern } from "@/convex/shop/schemas";
import { Button } from "@/src/components/ui/Button";
import { StepperDialogContent, type StepperDialogStep } from "@/src/components/ui/StepperDialog";
import { formatCompactDateListWithWeekday, formatDateWithWeekday } from "@/src/domains/shift/date";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
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
  displayMode?: "full" | "periodOnly";
  onSubmit: (data: CreateRecruitmentData) => void | Promise<void>;
  onCancel?: () => void;
  today?: string;
};

const steps: StepperDialogStep<Step>[] = [
  {
    value: "period",
    label: "期間",
    icon: LuCalendarDays,
    title: "シフト期間を選択",
    description: "募集するシフトの開始日と終了日を選んでください。",
  },
  {
    value: "holidays",
    label: "お休み",
    icon: LuStore,
    title: "お店のお休みを選択",
    description: "お休みの日を設定してください。",
  },
  {
    value: "deadline",
    label: "提出期限",
    icon: LuTimer,
    title: "提出締切日を選択",
    description: "シフト提出の締切日を選んでください。",
  },
  {
    value: "confirm",
    label: "確認",
    icon: LuCalendarCheck,
    title: "内容を確認",
    description: "作成する募集の内容を確認してください。",
  },
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

const getHolidaySummary = (holidays: string[]): { value: string; detail?: string } => {
  const sortedHolidays = [...holidays].sort();
  if (sortedHolidays.length === 0) {
    return { value: "なし" };
  }

  const visibleHolidays = formatCompactDateListWithWeekday(sortedHolidays.slice(0, 3));
  const hiddenCount = sortedHolidays.length - 3;
  return {
    value: `${sortedHolidays.length}日`,
    detail: hiddenCount > 0 ? `${visibleHolidays} ほか${hiddenCount}日` : visibleHolidays,
  };
};

const isDeadlineInRange = (deadline: string, today: string, periodStart?: string): boolean => {
  if (!deadline) return false;
  if (deadline < today) return false;
  if (periodStart && deadline >= periodStart) return false;
  return true;
};

const SummaryLine = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
  <Flex gap={3} minH={{ base: "64px", md: "72px" }} py={3} justify="flex-start" align="center">
    <Text w="50%" fontSize="sm" color="fg.muted">
      {label}
    </Text>
    <Stack w="50%" gap={0.5} align="stretch" justify="center">
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
  displayMode = "full",
  onSubmit,
  onCancel,
  today: todayProp,
}: Props) => {
  const today = todayProp ?? dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs(today).add(1, "day").format("YYYY-MM-DD");
  const isPeriodOnly = displayMode === "periodOnly";
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
  const { run: submitOnce, isRunning: isSubmitRunning } = useSingleFlight(onSubmit);

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

  useEffect(() => {
    if (!isPeriodOnly || !periodStart) return;
    const fallbackDeadline = dayjs(periodStart).subtract(1, "day").format("YYYY-MM-DD");
    if (deadline === fallbackDeadline) return;
    setValue("deadline", fallbackDeadline, { shouldDirty: true });
    clearErrors("deadline");
  }, [clearErrors, deadline, isPeriodOnly, periodStart, setValue]);

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

  const submitForm = handleSubmit(async (data) => {
    await submitOnce({ ...data, shopClosedDates: selectedHolidays });
  });
  const submitLoading = isSubmitting || isSubmitRunning;

  const actions =
    currentStep === "period" ? (
      <>
        <Button type="button" variant="outline" onClick={onCancel} flex={{ base: 1, md: "unset" }}>
          キャンセル
        </Button>
        <Button type="button" colorPalette="teal" onClick={goToHolidays} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    ) : currentStep === "holidays" ? (
      <>
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
      </>
    ) : currentStep === "deadline" ? (
      <>
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
      </>
    ) : (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={() => setCurrentStep("deadline")}
          flex={{ base: 1, md: "unset" }}
        >
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="submit" colorPalette="teal" loading={submitLoading} flex={{ base: 1, md: "unset" }}>
          募集をつくる
        </Button>
      </>
    );

  return (
    <form id="create-recruitment-form" onSubmit={submitForm}>
      <input type="hidden" {...register("periodStart")} />
      <input type="hidden" {...register("periodEnd")} />
      <input type="hidden" {...register("deadline")} />

      <StepperDialogContent
        steps={steps}
        currentStep={currentStep}
        actions={isPeriodOnly ? undefined : actions}
        showSteps={!isPeriodOnly}
      >
        {currentStep === "period" && (
          <>
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
          </>
        )}

        {currentStep === "holidays" && (
          <>
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
          </>
        )}

        {currentStep === "deadline" && (
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
        )}

        {currentStep === "confirm" && (
          <Box px={{ base: 0, md: 8 }}>
            <Stack gap={0}>
              <SummaryLine label="シフト期間" value={periodLabel} />
              <Separator />
              <SummaryLine label="お店のお休み" value={holidaySummary.value} detail={holidaySummary.detail} />
              <Separator />
              <SummaryLine label="提出締切" value={deadline ? `${formatDateWithWeekday(deadline)} 23:59` : "未選択"} />
            </Stack>
          </Box>
        )}
      </StepperDialogContent>
    </form>
  );
};
