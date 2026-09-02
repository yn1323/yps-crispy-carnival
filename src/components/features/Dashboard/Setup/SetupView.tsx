import { Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { AccountDeletion } from "@/src/components/features/AccountDeletion";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { WelcomeHero } from "../HeroSummary";
import { SetupModal } from "../SetupModal";

type Props = {
  announcement: ReactNode;
  dialog: {
    isOpen: boolean;
    open: () => void;
    onOpenChange: (details: { open: boolean }) => void;
  };
  managerProfileDefaults?: {
    name: string;
    email: string;
  };
  showAccountDeletion: boolean;
  isSubmitting: boolean;
  onVerifyPromotionCode: Parameters<typeof SetupModal>[0]["onVerifyPromotionCode"];
  onComplete: Parameters<typeof SetupModal>[0]["onComplete"];
};

export function SetupView({
  announcement,
  dialog,
  managerProfileDefaults,
  showAccountDeletion,
  isSubmitting,
  onVerifyPromotionCode,
  onComplete,
}: Props) {
  return (
    <>
      <ContentWrapper>
        {announcement}
        <Stack gap={3}>
          <WelcomeHero onSetupClick={dialog.open} />
          {showAccountDeletion ? <AccountDeletion variant="setup" /> : null}
        </Stack>
      </ContentWrapper>
      <SetupModal
        isOpen={dialog.isOpen}
        onOpenChange={dialog.onOpenChange}
        onComplete={onComplete}
        managerProfileDefaults={managerProfileDefaults}
        isSubmitting={isSubmitting}
        onVerifyPromotionCode={onVerifyPromotionCode}
      />
    </>
  );
}
