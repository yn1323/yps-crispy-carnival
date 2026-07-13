import { Stack } from "@chakra-ui/react";
import { type ComponentProps, useMemo } from "react";
import { LuCalendarDays, LuClock3, LuListChecks, LuStore } from "react-icons/lu";
import { StepperDialogContent, type StepperDialogStep } from "@/src/components/ui/StepperDialog";
import { EditShopFormActions } from "./EditShopFormActions";
import { RegularClosedDaysStep } from "./RegularClosedDaysStep";
import { ShiftTypePatternSettings } from "./ShiftTypePatternSettings";
import { ShopNameStep } from "./ShopNameStep";
import { SubmissionPatternStep } from "./SubmissionPatternStep";
import type { EditShopFormStep, ShiftSubmissionPattern } from "./script";
import { TimePatternSettings } from "./TimePatternSettings";

const BASE_STEPS: StepperDialogStep<EditShopFormStep>[] = [
  {
    value: "shopName",
    label: "店舗名",
    icon: LuStore,
    title: "店舗名",
    description: "管理画面やスタッフへの案内に表示するお店の名前です。",
  },
  {
    value: "submissionPattern",
    label: "集め方",
    icon: LuListChecks,
    title: "希望シフトの集め方",
    description: "スタッフが希望シフトを提出する方法を設定します。",
  },
  {
    value: "patternSettings",
    label: "勤務時間",
    icon: LuClock3,
    title: "勤務時間",
    description: "スタッフが選択可能な時間帯を設定します。",
  },
  {
    value: "regularClosedDays",
    label: "定休日",
    icon: LuCalendarDays,
    title: "定休日",
    description: "定休日があれば選択してください。休みはシフト募集時にも変更できます。",
  },
];

const getPatternSettingsStep = (kind: ShiftSubmissionPattern["kind"]): StepperDialogStep<EditShopFormStep> => ({
  value: "patternSettings",
  label: kind === "shiftType" ? "勤務区分" : "勤務時間",
  icon: kind === "shiftType" ? LuListChecks : LuClock3,
  title: kind === "shiftType" ? "勤務区分" : "勤務時間",
  description:
    kind === "shiftType"
      ? "スタッフが選べる早番・遅番などの区分を設定します。"
      : "スタッフが選択できる開始時間と終了時間の範囲を設定します。",
});

type PatternSettingsProps =
  | { kind: "dateOnly" }
  | { kind: "time"; props: ComponentProps<typeof TimePatternSettings> }
  | { kind: "shiftType"; props: ComponentProps<typeof ShiftTypePatternSettings> };

type Props = {
  currentStep: EditShopFormStep;
  submissionPatternKind: ShiftSubmissionPattern["kind"];
  shopNameStep: ComponentProps<typeof ShopNameStep>;
  submissionPatternStep: ComponentProps<typeof SubmissionPatternStep>;
  patternSettings: PatternSettingsProps;
  regularClosedDaysStep: ComponentProps<typeof RegularClosedDaysStep>;
  actions: ComponentProps<typeof EditShopFormActions>;
};

export const EditShopFormView = ({
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
      id="edit-shop-form"
      noValidate
      style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0 }}
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <StepperDialogContent steps={steps} currentStep={currentStep} actions={<EditShopFormActions {...actions} />}>
        {currentStep === "shopName" && <ShopNameStep {...shopNameStep} />}
        {currentStep === "submissionPattern" && <SubmissionPatternStep {...submissionPatternStep} />}
        {currentStep === "patternSettings" && (
          <Stack gap={3}>
            {patternSettings.kind === "time" && <TimePatternSettings {...patternSettings.props} />}
            {patternSettings.kind === "shiftType" && <ShiftTypePatternSettings {...patternSettings.props} />}
          </Stack>
        )}
        {currentStep === "regularClosedDays" && <RegularClosedDaysStep {...regularClosedDaysStep} />}
      </StepperDialogContent>
    </form>
  );
};
