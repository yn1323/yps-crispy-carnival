import type { ReactNode } from "react";
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
  isSubmitting: boolean;
  onComplete: Parameters<typeof SetupModal>[0]["onComplete"];
};

export function SetupView({ announcement, dialog, managerProfileDefaults, isSubmitting, onComplete }: Props) {
  return (
    <>
      <ContentWrapper>
        {announcement}
        <WelcomeHero onSetupClick={dialog.open} />
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
