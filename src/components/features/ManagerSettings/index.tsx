import { ManagerSettingsConfirmationDialog } from "./ManagerSettingsConfirmationDialog";
import { ManagerSettingsView } from "./ManagerSettingsView";
import type { ReadyManagerSettingsOverview } from "./types";
import { useManagerSettingsController } from "./useManagerSettingsController";

export function ManagerSettings({ overview, shopId }: { overview: ReadyManagerSettingsOverview; shopId: string }) {
  const controller = useManagerSettingsController({ overview, shopId });
  return (
    <>
      <ManagerSettingsView
        overview={overview}
        shopId={shopId}
        onBack={controller.onBack}
        onRequestResend={controller.onRequestResend}
        onRequestRevoke={controller.onRequestRevoke}
        onRequestRemoveRole={controller.onRequestRemoveRole}
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
export { isLegacyFreeManagerExchangeMode } from "./types";
