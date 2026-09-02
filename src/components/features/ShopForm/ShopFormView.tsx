import { Stack } from "@chakra-ui/react";
import { type ComponentProps, useMemo } from "react";
import { LuCalendarDays, LuClock3, LuListChecks, LuStore } from "react-icons/lu";
import {
  RegularClosedDaysField,
  ShopNameField,
  SubmissionPatternField,
  SubmissionPatternSettingsFields,
} from "@/src/components/shared/ShopSettingsFields";
import { StepperDialogContent, type StepperDialogStep } from "@/src/components/ui/StepperDialog";
import { ShopFormActions } from "./ShopFormActions";
import type { ShiftSubmissionPattern, ShopFormStep } from "./script";

const BASE_STEPS: StepperDialogStep<ShopFormStep>[] = [
  {
    value: "shopName",
    label: "店舗名設定",
    icon: LuStore,
    title: "店舗名設定",
    description: "店舗名を入力してください",
  },
  {
    value: "submissionPattern",
    label: "シフト提出方法",
    icon: LuListChecks,
    title: "シフトの提出方法",
    description: "スタッフがシフトを提出する方法を選んでください。",
  },
  {
    value: "patternSettings",
    label: "勤務時間",
    icon: LuClock3,
    title: "勤務時間",
    description: "スタッフが提出できる時間帯を設定します。",
  },
  {
    value: "regularClosedDays",
    label: "定休日",
    icon: LuCalendarDays,
    title: "定休日",
    description: "定休日があれば選択してください。\n定休日はシフト募集時にも変更できます。",
  },
];

const getPatternSettingsStep = (kind: ShiftSubmissionPattern["kind"]): StepperDialogStep<ShopFormStep> => ({
  value: "patternSettings",
  label: kind === "shiftType" ? "勤務区分" : "勤務時間",
  icon: kind === "shiftType" ? LuListChecks : LuClock3,
  title: kind === "shiftType" ? "勤務区分" : "勤務時間",
  description:
    kind === "shiftType"
      ? "スタッフが選べる早番・遅番などの区分を設定します。"
      : "スタッフが選択できる開始時間と終了時間の範囲を設定します。",
});

type Props = {
  currentStep: ShopFormStep;
  submissionPatternKind: ShiftSubmissionPattern["kind"];
  shopNameStep: ComponentProps<typeof ShopNameField>;
  submissionPatternStep: ComponentProps<typeof SubmissionPatternField>;
  patternSettings: ComponentProps<typeof SubmissionPatternSettingsFields>;
  regularClosedDaysStep: ComponentProps<typeof RegularClosedDaysField>;
  actions: ComponentProps<typeof ShopFormActions>;
};

export const ShopFormView = ({
  currentStep,
  submissionPatternKind,
  shopNameStep,
  submissionPatternStep,
  patternSettings,
  regularClosedDaysStep,
  actions,
}: Props) => {
  const steps = useMemo(() => {
    if (submissionPatternKind === "dateOnly") {
      return BASE_STEPS.filter((step) => step.value !== "patternSettings");
    }
    return BASE_STEPS.map((step) =>
      step.value === "patternSettings" ? getPatternSettingsStep(submissionPatternKind) : step,
    );
  }, [submissionPatternKind]);

  return (
    <form
      id="shop-form"
      noValidate
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <StepperDialogContent steps={steps} currentStep={currentStep} actions={<ShopFormActions {...actions} />}>
        {currentStep === "shopName" && <ShopNameField {...shopNameStep} />}
        {currentStep === "submissionPattern" && <SubmissionPatternField {...submissionPatternStep} />}
        {currentStep === "patternSettings" && (
          <Stack gap={3}>
            <SubmissionPatternSettingsFields {...patternSettings} />
          </Stack>
        )}
        {currentStep === "regularClosedDays" && <RegularClosedDaysField {...regularClosedDaysStep} />}
      </StepperDialogContent>
    </form>
  );
};
