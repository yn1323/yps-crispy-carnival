import { useCallback, useState } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { ManagerInvitationDialog, type ManagerInvitationDialogMode } from "./ManagerInvitationDialog";
import { ManagerSettingsConfirmationDialog } from "./ManagerSettingsConfirmationDialog";
import { ManagerSettingsView } from "./ManagerSettingsView";
import type { ReadyManagerSettingsOverview } from "./types";
import { useManagerSettingsController } from "./useManagerSettingsController";

export function ManagerSettings({
  overview,
  organizationId,
}: {
  overview: ReadyManagerSettingsOverview;
  organizationId: Id<"organizations">;
}) {
  const controller = useManagerSettingsController({ overview, organizationId });
  const [invitationMode, setInvitationMode] = useState<ManagerInvitationDialogMode | null>(null);
  const closeInvitation = useCallback(() => setInvitationMode(null), []);

  return (
    <>
      <ManagerSettingsView
        overview={overview}
        onBack={controller.onBack}
        onOpenInvitation={setInvitationMode}
        onRequestResend={controller.onRequestResend}
        onRequestRevoke={controller.onRequestRevoke}
        onRequestRemoveRole={controller.onRequestRemoveRole}
      />
      <ManagerInvitationDialog
        mode={invitationMode}
        overview={overview}
        organizationId={organizationId}
        onClose={closeInvitation}
      />
      <ManagerSettingsConfirmationDialog
        confirmation={controller.confirmation}
        isRunning={controller.isRunning}
        onClose={controller.onCloseConfirmation}
        onConfirm={controller.onConfirm}
      />
    </>
  );
}

export { ManagerCandidateListView } from "./ManagerCandidateListView";
export { ManagerCandidatePageContent } from "./ManagerCandidatePageContent";
export { ManagerExternalInviteForm, ManagerExternalInviteFormView } from "./ManagerExternalInviteForm";
export {
  ManagerCandidatePageSkeleton,
  ManagerExternalInvitePageSkeleton,
  ManagerSettingsSkeleton,
} from "./ManagerSettingsSkeleton";
export { ManagerSettingsView } from "./ManagerSettingsView";
export type {
  ManagerSettingsCandidate,
  ManagerSettingsInvitation,
  ManagerSettingsManager,
  ReadyManagerSettingsOverview,
} from "./types";
