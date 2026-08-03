import { Flex } from "@chakra-ui/react";
import { useState } from "react";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { toaster } from "@/src/components/ui/toaster";
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
  onOpenEmailChange: () => void;
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
  onOpenEmailChange,
  onRequestManagerAssignment,
  onCancelManagerAssignment,
  onAssignManager,
  onRequestRemoveManagerRole,
  onConfirmManagerSetting,
  onCancelManagerSetting,
}: Props) {
  const formId = `user-profile-${data.person.id}`;
  const [isProfileDirty, setIsProfileDirty] = useState(false);
  const handleOpenEmailChange = () => {
    if (isProfileDirty) {
      toaster.create({
        title: "名前の変更を先に保存するか、入力を取り消してください。",
        type: "info",
      });
      return;
    }
    onOpenEmailChange();
  };

  return (
    <Dialog
      title="スタッフ情報"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      onBackGuardRemoved={onClose}
      footer={
        <Flex justify="space-between" gap={3} w="full">
          <Button type="button" variant="outline" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            type="submit"
            form={formId}
            colorPalette="teal"
            loading={isUpdatingProfile}
            disabled={!data.canWrite || isUpdatingProfile}
          >
            変更を保存
          </Button>
        </Flex>
      }
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
        formId={formId}
        isReadOnly={!data.canWrite}
        onDirtyChange={setIsProfileDirty}
        onOpenEmailChange={handleOpenEmailChange}
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
