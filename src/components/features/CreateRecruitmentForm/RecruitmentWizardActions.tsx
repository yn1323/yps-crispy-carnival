import { LuChevronLeft } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import type { CreateRecruitmentStep } from "./types";

type Props = {
  currentStep: CreateRecruitmentStep;
  submitLoading: boolean;
  onCancel?: () => void;
  onGoToPeriod: () => void;
  onGoToHolidays: () => void;
  onGoToDeadline: () => void;
  onGoToConfirm: () => void;
};

export const RecruitmentWizardActions = ({
  currentStep,
  submitLoading,
  onCancel,
  onGoToPeriod,
  onGoToHolidays,
  onGoToDeadline,
  onGoToConfirm,
}: Props) => {
  if (currentStep === "period") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitLoading}>
          キャンセル
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
        loadingText="募集をつくる"
        disabled={submitLoading}
      >
        募集をつくる
      </Button>
    </>
  );
};
