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
          enabled={!isReadOnly && invitation.dialog.isOpen && invitation.activeTab === "organization"}
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
  const isManualTab = invitation.activeTab === "manual";
  const isBusy = invitation.isAddingStaffs || invitation.isAddingOrganizationPerson;

  return (
    <Dialog
      title="スタッフを招待"
      isOpen={invitation.dialog.isOpen && !isReadOnly}
      onOpenChange={invitation.dialog.onOpenChange}
      formId={isManualTab ? "add-staff-form" : undefined}
      onClose={invitation.onClose}
      hideFooter={!isManualTab}
      footer={
        isManualTab ? (
          <Flex w="full" align="center" justify="space-between" gap={3}>
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
      bodyProps={{ pt: 0 }}
    >
      <Tabs.Root
        value={invitation.activeTab}
        onValueChange={({ value }) => invitation.onTabChange(value as StaffInvitationTab)}
        colorPalette="teal"
        variant="line"
      >
        <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" borderBottomWidth="1px">
          <Tabs.Trigger value="link" flexShrink={0} disabled={isBusy}>
            リンクから招待
          </Tabs.Trigger>
          <Tabs.Trigger value="manual" flexShrink={0} disabled={isBusy}>
            管理者が登録
          </Tabs.Trigger>
          <Tabs.Trigger value="organization" flexShrink={0} disabled={isBusy}>
            他店舗スタッフを招待
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="link" pt={4}>
          <StaffRegistrationLinkPanel
            registrationUrl={invitation.registrationUrl}
            isLoading={invitation.isRegistrationUrlLoading}
          />
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

        <Tabs.Content value="organization" pt={4}>
          {organizationPeopleContent}
        </Tabs.Content>
      </Tabs.Root>
    </Dialog>
  );
}
