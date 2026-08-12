import { Box, type DateValue, Field, Text } from "@chakra-ui/react";
import type { FormEventHandler } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { LuCalendarCheck, LuCalendarDays, LuStore, LuTimer } from "react-icons/lu";
import { StepperDialogContent, type StepperDialogStep } from "@/src/components/ui/StepperDialog";
import { CalendarPicker } from "./CalendarPicker";
import { RecruitmentConfirmation } from "./RecruitmentConfirmation";
import { RecruitmentWizardActions } from "./RecruitmentWizardActions";
import type { CreateRecruitmentStep } from "./types";

type PeriodViewModel = {
  value: DateValue[];
  min: DateValue;
  max: DateValue;
  initialFocus: DateValue;
  label: string;
  dayCount: number;
  startError?: string;
  endError?: string;
};

type HolidaysViewModel = {
  value: DateValue[];
  min?: DateValue;
  max?: DateValue;
  initialFocus?: DateValue;
  desktopMonths: 1 | 2;
  allPeriodDaysAreHolidays: boolean;
};

type DeadlineViewModel = {
  value: DateValue[];
  min: DateValue;
  max?: DateValue;
  initialFocus: DateValue;
  desktopMonths: 1 | 2;
  error?: string;
};

type ConfirmationViewModel = {
  periodLabel: string;
  holidaySummary: {
    value: string;
    detail?: string;
  };
  deadlineLabel: string;
};

type Props = {
  currentStep: CreateRecruitmentStep;
  isPeriodOnly: boolean;
  submitLoading: boolean;
  hiddenFields: {
    periodStart: UseFormRegisterReturn;
    periodEnd: UseFormRegisterReturn;
    deadline: UseFormRegisterReturn;
  };
  period: PeriodViewModel;
  holidays: HolidaysViewModel;
  deadline: DeadlineViewModel;
  confirmation: ConfirmationViewModel;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel?: () => void;
  onPeriodChange: (value: DateValue[]) => void;
  onHolidayChange: (value: DateValue[]) => void;
  onDeadlineChange: (value: DateValue[]) => void;
  onGoToPeriod: () => void;
  onGoToHolidays: () => void;
  onGoToDeadline: () => void;
  onGoToConfirm: () => void;
};

const steps: StepperDialogStep<CreateRecruitmentStep>[] = [
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
    label: "提出締切",
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

export const CreateRecruitmentFormView = ({
  currentStep,
  isPeriodOnly,
  submitLoading,
  hiddenFields,
  period,
  holidays,
  deadline,
  confirmation,
  onSubmit,
  onCancel,
  onPeriodChange,
  onHolidayChange,
  onDeadlineChange,
  onGoToPeriod,
  onGoToHolidays,
  onGoToDeadline,
  onGoToConfirm,
}: Props) => {
  const actions = isPeriodOnly ? undefined : (
    <RecruitmentWizardActions
      currentStep={currentStep}
      submitLoading={submitLoading}
      onCancel={onCancel}
      onGoToPeriod={onGoToPeriod}
      onGoToHolidays={onGoToHolidays}
      onGoToDeadline={onGoToDeadline}
      onGoToConfirm={onGoToConfirm}
    />
  );

  return (
    <form
      id="create-recruitment-form"
      onSubmit={onSubmit}
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}
    >
      <input type="hidden" {...hiddenFields.periodStart} />
      <input type="hidden" {...hiddenFields.periodEnd} />
      <input type="hidden" {...hiddenFields.deadline} />

      <StepperDialogContent steps={steps} currentStep={currentStep} actions={actions} showSteps={!isPeriodOnly}>
        {currentStep === "period" && (
          <>
            <CalendarPicker
              selectionMode="range"
              value={period.value}
              min={period.min}
              max={period.max}
              defaultFocusedValue={period.value[0] ?? period.initialFocus}
              desktopMonths={2}
              onValueChange={onPeriodChange}
            />
            <Field.Root display={{ base: "block", md: "none" }}>
              <Field.Label>選択中の期間</Field.Label>
              <Box p={3} borderWidth={1} borderColor="border.default" borderRadius="md" bg="gray.50">
                <Text fontSize="sm" fontWeight="semibold">
                  {period.label}
                </Text>
                <Text mt={1} fontSize="xs" color="fg.muted">
                  {period.dayCount > 0 ? `${period.dayCount}日間` : "カレンダーから開始日と終了日を選んでください"}
                </Text>
              </Box>
            </Field.Root>
            {(period.startError || period.endError) && (
              <Field.Root invalid>
                {period.startError && <Field.ErrorText>{period.startError}</Field.ErrorText>}
                {period.endError && <Field.ErrorText>{period.endError}</Field.ErrorText>}
              </Field.Root>
            )}
          </>
        )}

        {currentStep === "holidays" && (
          <>
            <CalendarPicker
              selectionMode="multiple"
              value={holidays.value}
              min={holidays.min}
              max={holidays.max}
              defaultFocusedValue={holidays.initialFocus}
              desktopMonths={holidays.desktopMonths}
              highlightSelectableDates
              onValueChange={onHolidayChange}
            />
            {holidays.allPeriodDaysAreHolidays && (
              <Field.Root invalid>
                <Field.ErrorText>シフト期間のすべてをお休みにはできません</Field.ErrorText>
              </Field.Root>
            )}
          </>
        )}

        {currentStep === "deadline" && (
          <Field.Root invalid={!!deadline.error}>
            <CalendarPicker
              selectionMode="single"
              value={deadline.value}
              min={deadline.min}
              max={deadline.max}
              defaultFocusedValue={deadline.initialFocus}
              desktopMonths={deadline.desktopMonths}
              onValueChange={onDeadlineChange}
            />
            {deadline.error && <Field.ErrorText>{deadline.error}</Field.ErrorText>}
          </Field.Root>
        )}

        {currentStep === "confirm" && <RecruitmentConfirmation {...confirmation} />}
      </StepperDialogContent>
    </form>
  );
};
