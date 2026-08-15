import { Stack } from "@chakra-ui/react";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { Dialog } from "@/src/components/ui/Dialog";
import type { UserDetailData } from "./types";
import { UserInformationTab } from "./UserInformationTab";

type Props = {
  data: UserDetailData;
  isOpen: boolean;
  isUpdatingProfile: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onUpdateProfile: (data: PersonProfileFormData) => void | Promise<void>;
};

export function UserInformationDialog({
  data,
  isOpen,
  isUpdatingProfile,
  onOpenChange,
  onClose,
  onUpdateProfile,
}: Props) {
  const formId = `user-profile-${data.person.id}`;

  return (
    <Dialog
      title="スタッフ情報"
      role="dialog"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      onBackGuardRemoved={onClose}
      closeLabel={data.canWrite ? "キャンセル" : "閉じる"}
      formId={data.canWrite ? formId : undefined}
      submitLabel="変更を保存"
      isLoading={isUpdatingProfile}
      isSubmitDisabled={!data.canWrite || isUpdatingProfile}
      mobileActionLayout="inline"
      mobileFullScreen
      maxW={{ lg: "720px" }}
      maxH={{ lg: "86dvh" }}
      bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 6, lg: 6 } }}
    >
      <Stack>
        <UserInformationTab data={data} formId={formId} isReadOnly={!data.canWrite} onUpdate={onUpdateProfile} />
      </Stack>
    </Dialog>
  );
}
