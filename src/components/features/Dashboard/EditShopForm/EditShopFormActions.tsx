import { LuChevronLeft } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { EditShopFormStep } from "./script";

export type EditShopFormActionsProps = {
  currentStep: EditShopFormStep;
  isSubmitting: boolean;
  onCancel?: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onPatternSettingsNext: () => void;
  onSubmit: () => void;
};

export const EditShopFormActions = ({
  currentStep,
  isSubmitting,
  onCancel,
  onNext,
  onPrevious,
  onPatternSettingsNext,
  onSubmit,
}: EditShopFormActionsProps) => {
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
          変更を保存
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
