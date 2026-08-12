import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { selectSubmissionPattern } from "@/src/domains/shop/submissionPattern";
import { ShopFormView } from "./ShopFormView";
import {
  buildShopFormSubmission,
  getInitialStep,
  getNextStep,
  getPreviousStep,
  type RegularClosedDay,
  type ShiftSubmissionPattern,
  type ShopFormData,
  type ShopFormStep,
  shopFormSchema,
  sortRegularClosedDays,
  WEEKDAYS,
} from "./script";

export type { ShopFormData } from "./script";

type Props = {
  defaultValues: ShopFormData;
  onSubmit: (data: ShopFormData) => void | Promise<void>;
  onCancel?: () => void;
  initialStep?: ShopFormStep;
  submitLabel?: string;
};

export const ShopForm = ({
  defaultValues,
  onSubmit,
  onCancel,
  initialStep = "shopName",
  submitLabel = "変更を保存",
}: Props) => {
  const [currentStep, setCurrentStep] = useState<ShopFormStep>(() =>
    getInitialStep(initialStep, defaultValues.submissionPattern),
  );
  const [regularClosedDays, setRegularClosedDays] = useState<RegularClosedDay[]>(defaultValues.regularClosedDays);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    trigger,
    formState: { errors, isSubmitting },
  } = useForm<ShopFormData>({
    resolver: zodResolver(shopFormSchema),
    defaultValues,
  });

  const submissionPattern = watch("submissionPattern");
  const setSubmissionPattern = (next: ShiftSubmissionPattern) => {
    setValue("submissionPattern", next, { shouldDirty: true, shouldValidate: true });
  };

  const handleSubmissionPatternChange = (kind: ShiftSubmissionPattern["kind"]) => {
    setSubmissionPattern(selectSubmissionPattern(kind, submissionPattern));
  };

  const goToNextStep = () => {
    setCurrentStep((step) => getNextStep(step, getValues("submissionPattern")));
  };

  const goToPreviousStep = () => {
    setCurrentStep((step) => getPreviousStep(step, getValues("submissionPattern")));
  };

  const handlePatternSettingsNext = async () => {
    const isValid = await trigger("submissionPattern", { shouldFocus: true });
    if (!isValid) return;
    goToNextStep();
  };

  const toggleRegularClosedDay = (day: RegularClosedDay) => {
    setRegularClosedDays((current) => {
      const next = current.includes(day) ? current.filter((value) => value !== day) : [...current, day];
      return sortRegularClosedDays(next);
    });
  };

  const submitForm = handleSubmit(
    async (data) => {
      await onSubmit(buildShopFormSubmission(data, regularClosedDays));
    },
    (invalidErrors) => {
      if (invalidErrors.shopName) {
        setCurrentStep("shopName");
        return;
      }
      if (invalidErrors.submissionPattern) {
        setCurrentStep(submissionPattern.kind === "dateOnly" ? "submissionPattern" : "patternSettings");
        return;
      }
      setCurrentStep("regularClosedDays");
    },
  );

  const selectedClosedDayLabels = WEEKDAYS.filter((day) => regularClosedDays.includes(day.value)).map(
    (day) => day.label,
  );
  return (
    <ShopFormView
      currentStep={currentStep}
      submissionPatternKind={submissionPattern.kind}
      shopNameStep={{
        registration: register("shopName"),
        invalid: !!errors.shopName,
        errorMessage: errors.shopName?.message,
      }}
      submissionPatternStep={{ selectedKind: submissionPattern.kind, onSelect: handleSubmissionPatternChange }}
      patternSettings={{
        submissionPattern,
        error: errors.submissionPattern,
        showTimeFieldErrors: false,
        onChange: setSubmissionPattern,
      }}
      regularClosedDaysStep={{
        summary: selectedClosedDayLabels.length > 0 ? `毎週 ${selectedClosedDayLabels.join("・")}` : "定休日なし",
        options: WEEKDAYS.map((day) => ({
          ...day,
          isClosed: regularClosedDays.includes(day.value),
        })),
        onToggle: toggleRegularClosedDay,
      }}
      actions={{
        currentStep,
        isSubmitting,
        submitLabel,
        onCancel,
        onNext: goToNextStep,
        onPrevious: goToPreviousStep,
        onPatternSettingsNext: handlePatternSettingsNext,
        onSubmit: submitForm,
      }}
    />
  );
};
