import { Alert, Flex, Stack, Text } from "@chakra-ui/react";
import { LuUserPlus } from "react-icons/lu";
import type { Id } from "@/convex/_generated/dataModel";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";
import type { AddStaffFormData } from "../AddStaffForm";
import { AddStaffForm } from "../AddStaffForm";
import type { EditStaffFormData } from "../EditStaffForm";
import { StaffRegistrationLinkPanel } from "../StaffRegistrationLinkPanel";
import { StaffRoster } from "../StaffRoster";
import { StaffDetailDialog } from "../StaffRoster/StaffDetailDialog";
import type { PaginationStatus, Recruitment, Staff } from "../types";

type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

type InvitationViewModel = {
  dialog: DialogState;
  mode: "qr" | "manual";
  registrationUrl: string | null;
  peopleCapacityResolution: PeopleCapacityResolution | null;
  isRegistrationUrlLoading: boolean;
  isAddingStaffs: boolean;
  onOpen: () => void | Promise<void>;
  onBackOrClose: () => void;
  onShowManualEntry: () => void;
  onAddStaffs: (data: AddStaffFormData) => void | Promise<void>;
  reactivationConfirmation: {
    dialog: DialogState;
    candidates: Array<{
      personId: Id<"organizationPeople">;
      name: string;
      email: string;
    }>;
    isConfirming: boolean;
    onConfirm: () => void | Promise<void>;
    onClose: () => void;
  };
};

type StaffDetailViewModel = {
  staff: Staff | null;
  dialog: DialogState;
  onOpen: (staff: Staff) => void;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onEdit: (data: EditStaffFormData) => void | Promise<void>;
  isEditing: boolean;
  onDelete: (staff: Staff) => void | Promise<void>;
  isDeleting: boolean;
  onShowLineQr: (staff: Staff) => void | Promise<void>;
  lineQrState: {
    staffId: Staff["_id"] | null;
    authorizeUrl: string | null;
    isLoading: boolean;
  };
  onSendLineInvite: (staff: Staff) => void | Promise<void>;
  isSendingLineInvite: boolean;
  onSendRecruitments: (staff: Staff) => void | Promise<void>;
  isSendingRecruitments: boolean;
  onSendCurrentShift: (staff: Staff) => void | Promise<void>;
  isSendingCurrentShift: boolean;
  onChangeShiftTarget: (staff: Staff, isShiftTarget: boolean) => void | Promise<void>;
  isChangingShiftTarget: boolean;
};

type Props = {
  staffs: Staff[];
  isReadOnly?: boolean;
  status: PaginationStatus;
  canLoadMore: boolean;
  onLoadMore: () => void;
  openRecruitments: Recruitment[];
  currentRecruitments: Recruitment[];
  invitation: InvitationViewModel;
  detail: StaffDetailViewModel;
};

export function StaffManagementView({
  staffs,
  isReadOnly = false,
  status,
  canLoadMore,
  onLoadMore,
  openRecruitments,
  currentRecruitments,
  invitation,
  detail,
}: Props) {
  return (
    <>
      <StaffRoster
        staffs={staffs}
        isReadOnly={isReadOnly}
        status={status}
        canLoadMore={canLoadMore}
        onAddClick={invitation.onOpen}
        onOpenDetail={detail.onOpen}
        onLoadMore={onLoadMore}
      />

      <Dialog
        title="スタッフを招待"
        isOpen={invitation.dialog.isOpen && !isReadOnly}
        onOpenChange={invitation.dialog.onOpenChange}
        formId={invitation.mode === "manual" ? "add-staff-form" : undefined}
        submitLabel={invitation.mode === "manual" ? "スタッフを追加する" : undefined}
        onClose={invitation.onBackOrClose}
        closeLabel={invitation.mode === "manual" ? "戻る" : "閉じる"}
        hideFooter={invitation.mode === "qr"}
        footer={
          invitation.mode === "manual" ? (
            <Flex w="full" align="center" justify="space-between" gap={3}>
              <Button
                variant="outline"
                onClick={invitation.onBackOrClose}
                disabled={isReadOnly || invitation.isAddingStaffs}
              >
                戻る
              </Button>
              <Button
                type="submit"
                form="add-staff-form"
                colorPalette="teal"
                loading={invitation.isAddingStaffs}
                disabled={isReadOnly}
              >
                スタッフを追加する
              </Button>
            </Flex>
          ) : undefined
        }
        maxW={{ base: "100vw", lg: "640px" }}
        maxH={{ base: "100dvh", lg: "85dvh" }}
        contentProps={{
          w: "100%",
          h: { base: "100dvh", lg: "auto" },
          my: { base: 0, lg: "auto" },
          borderRadius: { base: 0, lg: "l3" },
        }}
      >
        {invitation.mode === "qr" ? (
          <StaffRegistrationLinkPanel
            registrationUrl={invitation.registrationUrl}
            isLoading={invitation.isRegistrationUrlLoading}
            manualEntryAction={
              <Button
                onClick={invitation.onShowManualEntry}
                size="sm"
                colorPalette="teal"
                disabled={isReadOnly}
                gap={1.5}
              >
                <LuUserPlus />
                スタッフ情報を手入力する
              </Button>
            }
          />
        ) : (
          <Stack gap={4}>
            {invitation.peopleCapacityResolution && (
              <PeopleCapacityResolutionAlert
                resolution={invitation.peopleCapacityResolution}
                retryActionLabel="スタッフを追加"
              />
            )}
            <AddStaffForm onSubmit={invitation.onAddStaffs} />
          </Stack>
        )}
      </Dialog>

      <Dialog
        title="削除済みの人物を再追加しますか？"
        isOpen={invitation.reactivationConfirmation.dialog.isOpen && !isReadOnly}
        onOpenChange={invitation.reactivationConfirmation.dialog.onOpenChange}
        role="alertdialog"
        submitLabel="確認して再追加する"
        onSubmit={invitation.reactivationConfirmation.onConfirm}
        onClose={invitation.reactivationConfirmation.onClose}
        isLoading={invitation.reactivationConfirmation.isConfirming}
        isSubmitDisabled={isReadOnly}
      >
        <Stack gap={4}>
          {invitation.peopleCapacityResolution && (
            <PeopleCapacityResolutionAlert
              resolution={invitation.peopleCapacityResolution}
              retryActionLabel="スタッフを再追加"
            />
          )}
          <Text fontSize="sm">入力したメールアドレスは、以前この事業者から削除された人物と一致しました。</Text>
          <Stack gap={2}>
            {invitation.reactivationConfirmation.candidates.map((candidate) => (
              <Stack key={candidate.personId} gap={0} rounded="md" borderWidth="1px" px={3} py={2}>
                <Text fontWeight="medium">{candidate.name}</Text>
                <Text fontSize="sm" color="fg.muted">
                  {candidate.email}
                </Text>
              </Stack>
            ))}
          </Stack>
          <Alert.Root status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>この店舗のスタッフとしてのみ再追加します</Alert.Title>
              <Alert.Description>
                以前の管理者権限や他店舗への所属は復元しません。必要な権限と店舗所属は、再追加後に個別に設定してください。
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </Stack>
      </Dialog>

      <StaffDetailDialog
        staff={detail.staff}
        isReadOnly={isReadOnly}
        isOpen={detail.dialog.isOpen}
        onOpenChange={detail.onOpenChange}
        onClose={detail.onClose}
        openRecruitments={openRecruitments}
        currentRecruitments={currentRecruitments}
        onEdit={detail.onEdit}
        isEditing={detail.isEditing}
        onDelete={detail.onDelete}
        isDeleting={detail.isDeleting}
        onShowLineQr={detail.onShowLineQr}
        lineQrState={detail.lineQrState}
        onSendLineInvite={detail.onSendLineInvite}
        isSendingLineInvite={detail.isSendingLineInvite}
        onSendRecruitments={detail.onSendRecruitments}
        isSendingRecruitments={detail.isSendingRecruitments}
        onSendCurrentShift={detail.onSendCurrentShift}
        isSendingCurrentShift={detail.isSendingCurrentShift}
        onChangeShiftTarget={detail.onChangeShiftTarget}
        isChangingShiftTarget={detail.isChangingShiftTarget}
      />
    </>
  );
}
