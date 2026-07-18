import { Stack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { AccountDeletion } from "@/src/components/features/AccountDeletion";
import { ContentWrapper } from "@/src/components/templates/ContentWrapper";
import { ACCOUNT_DELETION_ENABLED } from "@/src/configs/env";
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
  isSubmitting: boolean;
  onComplete: Parameters<typeof SetupModal>[0]["onComplete"];
};

export function SetupView({ announcement, dialog, managerProfileDefaults, isSubmitting, onComplete }: Props) {
  return (
    <>
      <ContentWrapper>
        {announcement}
        <Stack gap={3}>
          <WelcomeHero onSetupClick={dialog.open} />
          {ACCOUNT_DELETION_ENABLED ? <AccountDeletion variant="setup" /> : null}
        </Stack>
      </ContentWrapper>
      <SetupModal
        isOpen={dialog.isOpen}
        onOpenChange={dialog.onOpenChange}
        onComplete={onComplete}
        managerProfileDefaults={managerProfileDefaults}
        isSubmitting={isSubmitting}
      />
    </>
  );
}
