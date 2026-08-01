import { type DateValue, parseDate } from "@chakra-ui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import dayjs from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { RegularClosedDay } from "@/convex/shop/schemas";
import { formatDateWithWeekday } from "@/src/domains/shift/date";
import { useSingleFlight } from "@/src/hooks/useSingleFlight";
import { CreateRecruitmentFormView } from "./CreateRecruitmentFormView";
import {
  type CreateRecruitmentData,
  createRecruitmentFormSchema,
  deriveShopClosedDatesFromRegularDays,
  getCalendarMonthCount,
  getDeadlineStepValidationError,
  getHolidaySummary,
  getInclusiveDateCount,
  getPeriodSelectionMaxDate,
  getPeriodStepValidationError,
  isDeadlineInRange,
  pruneHolidaysInRange,
} from "./script";
import type { CreateRecruitmentStep } from "./types";

export type { CreateRecruitmentData } from "./script";

type Props = {
  defaultValues?: CreateRecruitmentData;
  regularClosedDays?: RegularClosedDay[];
  displayMode?: "full" | "periodOnly";
  onSubmit: (data: CreateRecruitmentData) => void | Promise<void>;
  onCancel?: () => void;
  today?: string;
};

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

const toMonthStartDateValue = (date?: string): DateValue | undefined => {
  if (!date) return undefined;
  return parseDate(dayjs(date).startOf("month").format("YYYY-MM-DD"));
};

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
  const [currentStep, setCurrentStep] = useState<CreateRecruitmentStep>("period");
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
  const periodDays = getInclusiveDateCount(periodStart, periodEnd);
  const allPeriodDaysAreHolidays = periodDays > 0 && selectedHolidays.length >= periodDays;
  const periodLabel =
    periodStart && periodEnd
      ? `${formatDateWithWeekday(periodStart)} 〜 ${formatDateWithWeekday(periodEnd)}`
      : "未選択";
  const deadlineLabel = deadline ? `${formatDateWithWeekday(deadline)} 23:59` : "未選択";
  const deadlineMax = periodStart ? dayjs(periodStart).subtract(1, "day").format("YYYY-MM-DD") : undefined;

  const periodInitialFocus = useMemo(() => parseDate(dayjs(today).startOf("month").format("YYYY-MM-DD")), [today]);
  const periodMin = useMemo(() => parseDate(tomorrow), [tomorrow]);
  const periodMax = useMemo(() => parseDate(getPeriodSelectionMaxDate(today)), [today]);
  const deadlineMin = useMemo(() => parseDate(today), [today]);
  const holidayMin = toDateValue(periodStart);
  const holidayMax = toDateValue(periodEnd);
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

  const goToHolidays = () => {
    const error = getPeriodStepValidationError({ periodStart, periodEnd, today });
    if (error) {
      setError(error.field, { message: error.message });
      return;
    }
    clearErrors(["periodStart", "periodEnd"]);
    setCurrentStep("holidays");
  };

  const goToDeadline = () => {
    if (allPeriodDaysAreHolidays) return;
    setCurrentStep("deadline");
  };

  const goToConfirm = () => {
    const error = getDeadlineStepValidationError({ deadline, periodStart, today });
    if (error) {
      setError("deadline", { message: error });
      return;
    }
    clearErrors("deadline");
    setCurrentStep("confirm");
  };

  const submitForm = handleSubmit(async (data) => {
    await submitOnce({ ...data, shopClosedDates: selectedHolidays });
  });

  return (
    <CreateRecruitmentFormView
      currentStep={currentStep}
      isPeriodOnly={isPeriodOnly}
      submitLoading={isSubmitting || isSubmitRunning}
      hiddenFields={{
        periodStart: register("periodStart"),
        periodEnd: register("periodEnd"),
        deadline: register("deadline"),
      }}
      period={{
        value: periodValue,
        min: periodMin,
        max: periodMax,
        initialFocus: periodInitialFocus,
        label: periodLabel,
        dayCount: periodDays,
        startError: errors.periodStart?.message,
        endError: errors.periodEnd?.message,
      }}
      holidays={{
        value: toDateValues(selectedHolidays),
        min: holidayMin,
        max: holidayMax,
        initialFocus: holidayInitialFocus,
        desktopMonths: holidayDesktopMonths,
        allPeriodDaysAreHolidays,
      }}
      deadline={{
        value: toDateValues(deadline ? [deadline] : []),
        min: deadlineMin,
        max: deadlineMaxValue,
        initialFocus: periodInitialFocus,
        desktopMonths: deadlineDesktopMonths,
        error: errors.deadline?.message,
      }}
      confirmation={{ periodLabel, holidaySummary, deadlineLabel }}
      onSubmit={submitForm}
      onCancel={onCancel}
      onPeriodChange={handlePeriodChange}
      onHolidayChange={handleHolidayChange}
      onDeadlineChange={handleDeadlineChange}
      onGoToPeriod={() => setCurrentStep("period")}
      onGoToHolidays={goToHolidays}
      onGoToDeadline={goToDeadline}
      onGoToConfirm={goToConfirm}
    />
  );
};
