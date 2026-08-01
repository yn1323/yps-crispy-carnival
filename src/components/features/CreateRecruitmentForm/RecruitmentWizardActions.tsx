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
        <Button type="button" variant="outline" onClick={onCancel} flex={{ base: 1, md: "unset" }}>
          キャンセル
        </Button>
        <Button type="button" colorPalette="teal" onClick={onGoToHolidays} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "holidays") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onGoToPeriod} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={onGoToDeadline} flex={{ base: 1, md: "unset" }}>
          次へ
        </Button>
      </>
    );
  }

  if (currentStep === "deadline") {
    return (
      <>
        <Button type="button" variant="outline" onClick={onGoToHolidays} flex={{ base: 1, md: "unset" }}>
          <LuChevronLeft />
          戻る
        </Button>
        <Button type="button" colorPalette="teal" onClick={onGoToConfirm} flex={{ base: 1, md: "unset" }}>
          確認へ
        </Button>
      </>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={onGoToDeadline} flex={{ base: 1, md: "unset" }}>
        <LuChevronLeft />
        戻る
      </Button>
      <Button type="submit" colorPalette="teal" loading={submitLoading} flex={{ base: 1, md: "unset" }}>
        募集をつくる
      </Button>
    </>
  );
};
