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
import type { CreateRecruitmentShop, CreateRecruitmentShopTarget, CreateRecruitmentStep } from "./types";

export type { CreateRecruitmentData } from "./script";
export type {
  CreateRecruitmentSelectableShop,
  CreateRecruitmentShop,
  CreateRecruitmentShopTarget,
} from "./types";

type Props = {
  defaultValues?: CreateRecruitmentData;
  regularClosedDays?: RegularClosedDay[];
  shopTarget?: CreateRecruitmentShopTarget;
  displayMode?: "full" | "periodOnly";
  onSubmit: (data: CreateRecruitmentData, selectedShop?: CreateRecruitmentShop) => void | Promise<void>;
  onCancel?: () => void;
  onSubmittingChange?: (isSubmitting: boolean) => void;
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
  shopTarget,
  displayMode = "full",
  onSubmit,
  onCancel,
  onSubmittingChange,
  today: todayProp,
}: Props) => {
  const today = todayProp ?? dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs(today).add(1, "day").format("YYYY-MM-DD");
  const isPeriodOnly = displayMode === "periodOnly";
  const hasShopStep = !isPeriodOnly && shopTarget?.mode === "select";
  const [currentStep, setCurrentStep] = useState<CreateRecruitmentStep>(() => (hasShopStep ? "shop" : "period"));
  const [selectedShopId, setSelectedShopId] = useState<string>();
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
  const isSubmitBusy = isSubmitting || isSubmitRunning;

  useEffect(() => {
    onSubmittingChange?.(isSubmitBusy);
    return () => {
      if (isSubmitBusy) onSubmittingChange?.(false);
    };
  }, [isSubmitBusy, onSubmittingChange]);

  const periodStart = watch("periodStart");
  const periodEnd = watch("periodEnd");
  const deadline = watch("deadline");
  const selectedSelectableShop =
    shopTarget?.mode === "select" ? shopTarget.shops.find((shop) => shop.shopId === selectedShopId) : undefined;
  const selectedShop = shopTarget?.mode === "fixed" ? shopTarget.shop : selectedSelectableShop;
  const activeRegularClosedDays =
    shopTarget?.mode === "select" ? (selectedSelectableShop?.regularClosedDays ?? []) : regularClosedDays;
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

  useEffect(() => {
    if (shopTarget?.mode !== "select" || !selectedShopId) return;
    if (shopTarget.shops.some((shop) => shop.shopId === selectedShopId)) return;

    setSelectedShopId(undefined);
    setSelectedHolidays([]);
    setValue("shopClosedDates", [], { shouldDirty: true });
    if (hasShopStep) setCurrentStep("shop");
  }, [hasShopStep, selectedShopId, setValue, shopTarget]);

  const handlePeriodChange = (value: DateValue[]) => {
    const nextValue = value.slice(0, 2);
    const start = nextValue[0] ? toIso(nextValue[0]) : "";
    const end = nextValue[1] ? toIso(nextValue[1]) : "";
    const defaultShopClosedDates = deriveShopClosedDatesFromRegularDays(start, end, activeRegularClosedDays);
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

  const handleShopChange = (shopId: string) => {
    if (shopTarget?.mode !== "select") return;
    const shop = shopTarget.shops.find((candidate) => candidate.shopId === shopId);
    if (!shop) return;

    const shopClosedDates = deriveShopClosedDatesFromRegularDays(periodStart, periodEnd, shop.regularClosedDays);
    setSelectedShopId(shop.shopId);
    setSelectedHolidays(shopClosedDates);
    setValue("shopClosedDates", shopClosedDates, { shouldDirty: true });
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

  const goToPeriodFromShop = () => {
    if (!selectedShop) return;
    setCurrentStep("period");
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
    if (shopTarget?.mode === "select" && !selectedShop) return;
    await submitOnce({ ...data, shopClosedDates: selectedHolidays }, selectedShop);
  });

  return (
    <CreateRecruitmentFormView
      currentStep={currentStep}
      isPeriodOnly={isPeriodOnly}
      hasShopStep={hasShopStep}
      canContinueFromShop={!!selectedShop}
      submitLoading={isSubmitBusy}
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
      confirmation={{ shopName: selectedShop?.shopName, periodLabel, holidaySummary, deadlineLabel }}
      shop={shopTarget?.mode === "select" ? { shops: shopTarget.shops, selectedShopId } : undefined}
      onSubmit={submitForm}
      onCancel={onCancel}
      onPeriodChange={handlePeriodChange}
      onHolidayChange={handleHolidayChange}
      onDeadlineChange={handleDeadlineChange}
      onShopChange={handleShopChange}
      onGoToShop={() => setCurrentStep("shop")}
      onGoToPeriodFromShop={goToPeriodFromShop}
      onGoToPeriod={() => setCurrentStep("period")}
      onGoToHolidays={goToHolidays}
      onGoToDeadline={goToDeadline}
      onGoToConfirm={goToConfirm}
    />
  );
};
