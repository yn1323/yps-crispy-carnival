import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData, UserDetailDialog } from "./types";
import { UserInformationTab } from "./UserInformationTab";
import { UserManagerSettings } from "./UserSettingsTab";

type Props = {
  data: UserDetailData;
  isOpen: boolean;
  isUpdatingProfile: boolean;
  managerDialog: UserDetailDialog;
  isManagerAssignmentConfirmationOpen: boolean;
  isAssigningManager: boolean;
  isRemovingManagerSetting: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onUpdateProfile: (data: PersonProfileFormData) => void | Promise<void>;
  onRequestManagerAssignment: () => void;
  onCancelManagerAssignment: () => void;
  onAssignManager: () => void | Promise<void>;
  onRequestRemoveManagerRole: () => void;
  onConfirmManagerSetting: () => void | Promise<void>;
  onCancelManagerSetting: () => void;
};

export function UserInformationDialog({
  data,
  isOpen,
  isUpdatingProfile,
  managerDialog,
  isManagerAssignmentConfirmationOpen,
  isAssigningManager,
  isRemovingManagerSetting,
  onOpenChange,
  onClose,
  onUpdateProfile,
  onRequestManagerAssignment,
  onCancelManagerAssignment,
  onAssignManager,
  onRequestRemoveManagerRole,
  onConfirmManagerSetting,
  onCancelManagerSetting,
}: Props) {
  return (
    <Dialog
      title="基本情報"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      hideFooter
      maxW={{ base: "100vw", lg: "720px" }}
      maxH={{ base: "100dvh", lg: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "auto" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 6, lg: 6 } }}
    >
      <UserInformationTab
        data={data}
        isReadOnly={!data.canWrite}
        isUpdating={isUpdatingProfile}
        managerSettings={
          data.managerInvitationState.kind === "hidden" ? null : (
            <UserManagerSettings
              data={data}
              isAssignmentConfirmationOpen={isManagerAssignmentConfirmationOpen}
              isAssigningManager={isAssigningManager}
              onRequestManagerAssignment={onRequestManagerAssignment}
              onCancelManagerAssignment={onCancelManagerAssignment}
              onAssignManager={onAssignManager}
              onRequestRemoveManagerRole={onRequestRemoveManagerRole}
              isRemovalConfirmationOpen={managerDialog?.kind === "removeManagerRole"}
              isRemovingManagerRole={isRemovingManagerSetting}
              onCancelRemoveManagerRole={onCancelManagerSetting}
              onConfirmRemoveManagerRole={onConfirmManagerSetting}
            />
          )
        }
        onUpdate={onUpdateProfile}
      />
    </Dialog>
  );
}
