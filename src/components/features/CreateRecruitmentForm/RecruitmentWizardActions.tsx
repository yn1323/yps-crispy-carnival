import { LuChevronLeft } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { CreateRecruitmentStep } from "./types";

type Props = {
  currentStep: CreateRecruitmentStep;
  isEditing?: boolean;
  hasShopStep: boolean;
  canContinueFromShop: boolean;
  submitLoading: boolean;
  submitDisabled?: boolean;
  onCancel?: () => void;
  onGoToShop: () => void;
  onGoToPeriodFromShop: () => void;
  onGoToPeriod: () => void;
  onGoToHolidays: () => void;
  onGoToDeadline: () => void;
  onGoToConfirm: () => void;
};

export const RecruitmentWizardActions = ({
  currentStep,
  isEditing = false,
  hasShopStep,
  canContinueFromShop,
  submitLoading,
  submitDisabled = false,
  onCancel,
  onGoToShop,
  onGoToPeriodFromShop,
  onGoToPeriod,
  onGoToHolidays,
  onGoToDeadline,
  onGoToConfirm,
}: Props) => {
  if (currentStep === "shop") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitLoading}>
          キャンセル
        </Button>
        <Button
          type="button"
          colorPalette="teal"
          onClick={onGoToPeriodFromShop}
          disabled={!canContinueFromShop || submitLoading}
        >
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "period") {
    return (
      <>
        <Button type="button" variant="outline" onClick={hasShopStep ? onGoToShop : onCancel} disabled={submitLoading}>
          {hasShopStep && <LuChevronLeft />}
          {hasShopStep ? "戻る" : "キャンセル"}
        </Button>
        <Button type="button" colorPalette="teal" onClick={onGoToHolidays} disabled={submitLoading}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "holidays") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onGoToPeriod} disabled={submitLoading}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={onGoToDeadline} disabled={submitLoading}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "deadline") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onGoToHolidays} disabled={submitLoading}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={onGoToConfirm} disabled={submitLoading}>
          確認へ
        </Button>
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={onGoToDeadline} disabled={submitLoading}>
        <LuChevronLeft />
        戻る
      </Button>
      <Button
        type="submit"
        colorPalette="teal"
        loading={submitLoading}
        loadingText={isEditing ? "変更を保存" : "募集をつくる"}
        disabled={submitLoading || submitDisabled}
      >
        {isEditing ? "変更を保存" : "募集をつくる"}
      </Button>
    </>
  );
};
