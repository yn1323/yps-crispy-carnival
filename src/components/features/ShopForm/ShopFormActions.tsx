import { LuChevronLeft } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { ShopFormStep } from "./script";

export type ShopFormActionsProps = {
  currentStep: ShopFormStep;
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onPatternSettingsNext: () => void;
  onSubmit: () => void;
};

export const ShopFormActions = ({
  currentStep,
  isSubmitting,
  submitLabel,
  onCancel,
  onNext,
  onPrevious,
  onPatternSettingsNext,
  onSubmit,
}: ShopFormActionsProps) => {
  if (currentStep === "shopName") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          キャンセル
        </Button>
        <Button type="button" colorPalette="teal" onClick={onNext} disabled={isSubmitting}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "patternSettings") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onPrevious} disabled={isSubmitting}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={onPatternSettingsNext} disabled={isSubmitting}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "regularClosedDays") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onPrevious} disabled={isSubmitting}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button
          type="button"
          colorPalette="teal"
          loading={isSubmitting}
          loadingText={submitLabel}
          disabled={isSubmitting}
          onClick={onSubmit}
        >
          {submitLabel}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={onPrevious} disabled={isSubmitting}>
        <LuChevronLeft />
        戻る
      </Button>
      <Button type="button" colorPalette="teal" onClick={onNext} disabled={isSubmitting}>
        次へ
      </Button>
    </>
  );
};
