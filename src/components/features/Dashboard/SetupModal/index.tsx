import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { LuChevronLeft, LuClock3, LuListChecks, LuStore, LuUserRound } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { StepperDialog, StepperDialogContent, type StepperDialogStep } from "@/src/components/ui/StepperDialog";
import { normalizeShiftTypeOptions } from "../submissionPatternForm";
import type { Step1Data } from "./SetupStep1";
import { step1Schema } from "./SetupStep1";
import { DEFAULT_TIME_PATTERN, SetupPatternSettingsStep, SetupShopInfoStep } from "./SetupStep1/index.tsx";
import type { Step2Data } from "./SetupStep2";
import { SetupStep2 } from "./SetupStep2/index.tsx";

export type SetupData = Step1Data & Step2Data;

type Props = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onComplete: (data: SetupData) => void | Promise<void>;
  managerProfileDefaults?: Pick<Step2Data, "name" | "email">;
  isSubmitting?: boolean;
};

type Step = "shopInfo" | "patternSettings" | "manager";

const INITIAL_STEP1: Step1Data = { shopName: "", submissionPattern: { kind: "dateOnly" } };

const baseSteps: StepperDialogStep<Step>[] = [
  {
    value: "shopInfo",
    label: "お店",
    icon: LuStore,
    title: "お店の情報",
    description: "お店の名前と、スタッフから希望シフトを集める方法を選びます。",
  },
  {
    value: "patternSettings",
    label: "勤務時間",
    icon: LuClock3,
  },
  {
    value: "manager",
    label: "あなた",
    icon: LuUserRound,
    title: "あなたの名前",
    description: "管理者として表示する名前と連絡先を登録します。",
  },
];

const getPatternSettingsStep = (kind: Step1Data["submissionPattern"]["kind"]): StepperDialogStep<Step> => ({
  value: "patternSettings",
  label: kind === "shiftType" ? "勤務区分" : "勤務時間",
  icon: kind === "shiftType" ? LuListChecks : LuClock3,
  title: kind === "shiftType" ? "勤務区分" : "勤務時間",
  description:
    kind === "shiftType"
      ? "スタッフが選べる早番・遅番などの区分を設定します。"
      : "スタッフが選択できる開始時間と終了時間の範囲を設定します。",
});

const normalizeSetupData = (data: Step1Data): Step1Data => ({
  ...data,
  submissionPattern:
    data.submissionPattern.kind === "shiftType"
      ? { kind: "shiftType", options: normalizeShiftTypeOptions(data.submissionPattern.options) }
      : data.submissionPattern,
});

export const SetupModal = ({
  isOpen,
  onOpenChange,
  onComplete,
  managerProfileDefaults,
  isSubmitting = false,
}: Props) => {
  const [currentStep, setCurrentStep] = useState<Step>("shopInfo");
  const {
    getValues,
    setValue,
    trigger,
    watch,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: INITIAL_STEP1,
  });

  const shopName = watch("shopName");
  const submissionPattern = watch("submissionPattern");
  const steps = useMemo(() => {
    if (submissionPattern.kind === "dateOnly") {
      return baseSteps.filter((step) => step.value !== "patternSettings");
    }
    return baseSteps.map((step) =>
      step.value === "patternSettings" ? getPatternSettingsStep(submissionPattern.kind) : step,
    );
  }, [submissionPattern.kind]);

  const close = useCallback(() => {
    onOpenChange({ open: false });
  }, [onOpenChange]);

  const handleShopInfoNext = useCallback(async () => {
    const isValid = await trigger("shopName", { shouldFocus: true });
    if (!isValid) return;
    setCurrentStep(submissionPattern.kind === "dateOnly" ? "manager" : "patternSettings");
  }, [submissionPattern.kind, trigger]);

  const handlePatternSettingsNext = useCallback(async () => {
    const isValid = await trigger("submissionPattern", { shouldFocus: true });
    if (!isValid) return;
    setCurrentStep("manager");
  }, [trigger]);

  const handleBack = useCallback(() => {
    setCurrentStep((step) => {
      if (step === "manager")
        return getValues("submissionPattern").kind === "dateOnly" ? "shopInfo" : "patternSettings";
      return "shopInfo";
    });
  }, [getValues]);

  const handleStep2Submit = useCallback(
    async (data: Step2Data) => {
      await onComplete({ ...normalizeSetupData(getValues()), ...data });
    },
    [getValues, onComplete],
  );

  const actions =
    currentStep === "shopInfo" ? (
      <>
        <Button type="button" variant="outline" onClick={close} flex={{ base: 1, md: "unset" }}>
          閉じる
        </Button>
        <Button type="button" colorPalette="teal" onClick={handleShopInfoNext} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    ) : currentStep === "patternSettings" ? (
      <>
        <Button type="button" variant="outline" onClick={handleBack} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={handlePatternSettingsNext} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    ) : (
      <>
        <Button type="button" variant="outline" onClick={handleBack} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button
          type="submit"
          form="setup-step2"
          colorPalette="teal"
          loading={isSubmitting}
          flex={{ base: 1, md: "unset" }}
        >
          お店を登録する
        </Button>
      </>
    );

  return (
    <StepperDialog title="初回登録" isOpen={isOpen} onOpenChange={onOpenChange} onClose={close}>
      <StepperDialogContent steps={steps} currentStep={currentStep} actions={actions}>
        {currentStep === "shopInfo" && (
          <SetupShopInfoStep
            shopName={shopName}
            submissionPattern={submissionPattern}
            shopNameError={errors.shopName?.message}
            onShopNameChange={(value) => setValue("shopName", value, { shouldDirty: true, shouldValidate: true })}
            onSubmissionPatternChange={(next) =>
              setValue("submissionPattern", next.kind === "time" ? { ...DEFAULT_TIME_PATTERN, ...next } : next, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        )}

        {currentStep === "patternSettings" && (
          <SetupPatternSettingsStep
            submissionPattern={submissionPattern}
            submissionPatternError={errors.submissionPattern}
            onSubmissionPatternChange={(next) =>
              setValue("submissionPattern", next, { shouldDirty: true, shouldValidate: true })
            }
          />
        )}

        {currentStep === "manager" && (
          <SetupStep2 defaultValues={managerProfileDefaults} onSubmit={handleStep2Submit} />
        )}
      </StepperDialogContent>
    </StepperDialog>
  );
};
