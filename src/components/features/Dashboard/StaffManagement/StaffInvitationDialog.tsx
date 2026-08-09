import { Flex, Stack, Tabs } from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { PeopleCapacityResolutionAlert } from "@/src/components/shared/PeopleCapacityResolutionAlert";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import type { PeopleCapacityResolution } from "@/src/domains/organizationBilling/peopleCapacity";
import type { AddStaffFormData } from "../AddStaffForm";
import { AddStaffForm } from "../AddStaffForm";
import { StaffRegistrationLinkPanel } from "../StaffRegistrationLinkPanel";
import { OrganizationPeopleCandidateList } from "./OrganizationPeopleCandidateList";

type DialogState = {
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
};

export type StaffInvitationTab = "link" | "manual" | "organization";

export type StaffInvitationViewModel = {
  dialog: DialogState;
  activeTab: StaffInvitationTab;
  showOrganizationPeopleAddition: boolean;
  registrationUrl: string | null;
  peopleCapacityResolution: PeopleCapacityResolution | null;
  isRegistrationUrlLoading: boolean;
  isAddingStaffs: boolean;
  addingOrganizationPersonId: Id<"organizationPeople"> | null;
  isAddingOrganizationPerson: boolean;
  onOpen: () => void | Promise<void>;
  onClose: () => void;
  onTabChange: (tab: StaffInvitationTab) => void;
  onAddStaffs: (data: AddStaffFormData) => void | Promise<void>;
  onAddOrganizationPerson: (personId: Id<"organizationPeople">) => void | Promise<void>;
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

type Props = {
  invitation: StaffInvitationViewModel;
  isReadOnly?: boolean;
};

export function StaffInvitationDialog({ invitation, isReadOnly = false }: Props) {
  return (
    <StaffInvitationDialogView
      invitation={invitation}
      isReadOnly={isReadOnly}
      organizationPeopleContent={
        <OrganizationPeopleCandidateList
          enabled={
            !isReadOnly &&
            invitation.showOrganizationPeopleAddition &&
            invitation.dialog.isOpen &&
            invitation.activeTab === "organization"
          }
          isReadOnly={isReadOnly}
          addingPersonId={invitation.addingOrganizationPersonId}
          isAdding={invitation.isAddingOrganizationPerson}
          onAdd={invitation.onAddOrganizationPerson}
        />
      }
    />
  );
}

type ViewProps = Props & {
  organizationPeopleContent: ReactNode;
};

export function StaffInvitationDialogView({ invitation, isReadOnly = false, organizationPeopleContent }: ViewProps) {
  const activeTab =
    !invitation.showOrganizationPeopleAddition && invitation.activeTab === "organization"
      ? "link"
      : invitation.activeTab;
  const isManualTab = activeTab === "manual";
  const isBusy = invitation.isAddingStaffs || invitation.isAddingOrganizationPerson;

  return (
    <Dialog
      title="スタッフを招待"
      isOpen={invitation.dialog.isOpen && !isReadOnly}
      onOpenChange={invitation.dialog.onOpenChange}
      formId={isManualTab ? "add-staff-form" : undefined}
      onClose={invitation.onClose}
      hideFooter={activeTab === "organization"}
      footer={
        isManualTab ? (
          <Flex w="full" align="center" justify="flex-end" gap={3}>
            <Button variant="outline" onClick={invitation.onClose} disabled={isReadOnly || isBusy}>
              閉じる
            </Button>
            <Button
              type="submit"
              form="add-staff-form"
              colorPalette="teal"
              loading={invitation.isAddingStaffs}
              disabled={isReadOnly || invitation.isAddingOrganizationPerson}
            >
              スタッフを登録する
            </Button>
          </Flex>
        ) : activeTab === "link" ? (
          <Flex w="full" justify="flex-end">
            <Button variant="outline" aria-label="スタッフ招待を閉じる" onClick={invitation.onClose} disabled={isBusy}>
              閉じる
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
      bodyProps={{ pt: 0 }}
    >
      <Tabs.Root
        value={activeTab}
        onValueChange={({ value }) => invitation.onTabChange(value as StaffInvitationTab)}
        colorPalette="teal"
        variant="line"
        h="full"
        minH={0}
        display="flex"
        flexDirection="column"
        lazyMount
      >
        <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" borderBottomWidth="1px">
          <Tabs.Trigger value="link" flexShrink={0} disabled={isBusy}>
            リンクから招待
          </Tabs.Trigger>
          <Tabs.Trigger value="manual" flexShrink={0} disabled={isBusy}>
            管理者が登録
          </Tabs.Trigger>
          {invitation.showOrganizationPeopleAddition && (
            <Tabs.Trigger value="organization" flexShrink={0} disabled={isBusy}>
              他店舗スタッフを招待
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <Tabs.Content value="link" pt={4} flex={1} minH={0}>
          <Stack gap={6}>
            <StaffRegistrationLinkPanel
              registrationUrl={invitation.registrationUrl}
              isLoading={invitation.isRegistrationUrlLoading}
            />
          </Stack>
        </Tabs.Content>

        <Tabs.Content value="manual" pt={4}>
          <Stack gap={4}>
            {invitation.peopleCapacityResolution && (
              <PeopleCapacityResolutionAlert
                resolution={invitation.peopleCapacityResolution}
                retryActionLabel="スタッフを追加"
              />
            )}
            <AddStaffForm onSubmit={invitation.onAddStaffs} />
          </Stack>
        </Tabs.Content>

        {invitation.showOrganizationPeopleAddition && (
          <Tabs.Content value="organization" pt={4}>
            {organizationPeopleContent}
          </Tabs.Content>
        )}
      </Tabs.Root>
    </Dialog>
  );
}
