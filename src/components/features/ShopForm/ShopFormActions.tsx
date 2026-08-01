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
        <Button type="button" variant="outline" onClick={onCancel} flex={{ base: 1, md: "unset" }}>
          キャンセル
        </Button>
        <Button type="button" colorPalette="teal" onClick={onNext} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "patternSettings") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onPrevious} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={onPatternSettingsNext} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "regularClosedDays") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onPrevious} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button
          type="button"
          colorPalette="teal"
          loading={isSubmitting}
          onClick={onSubmit}
          flex={{ base: 1, md: "unset" }}
        >
          {submitLabel}
        </Button>
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={onPrevious} flex={{ base: 1, md: "unset" }}>
        <LuChevronLeft />
        戻る
      </Button>
      <Button type="button" colorPalette="teal" onClick={onNext} flex={{ base: 1, md: "unset" }}>
        次へ
      </Button>
    </>
  );
};
