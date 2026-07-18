import { Box, Flex, Heading, HStack, Stack, Tabs, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuShieldMinus, LuShieldPlus } from "react-icons/lu";
import { ManagerAssignmentConfirmation } from "@/src/components/shared/ManagerAssignmentConfirmation";
import { PersonProfileForm, type PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { DeletionActionSection } from "./DeletionActionSection";
import { OrganizationUserRoleBadges } from "./OrganizationUserRoleBadges";
import type { OrganizationPersonView } from "./types";

type Props = {
  person: OrganizationPersonView | null;
  isOpen: boolean;
  defaultTab?: "information" | "settings";
  canAssignManager: boolean;
  isManagerInvitationResend: boolean;
  managerAssignmentMode: "addition" | "freeManagerExchange";
  managerAssignmentDisabledReason?: string;
  isUpdatingProfile: boolean;
  isAssigningManager: boolean;
  onClose: () => void;
  onUpdateProfile: (data: PersonProfileFormData) => Promise<boolean | undefined>;
  onAssignManager: () => Promise<boolean | undefined>;
  onRemoveManagerRole: () => void;
  onRemovePerson: () => void;
};

export function OrganizationUserDetailDialog({
  person,
  isOpen,
  defaultTab = "information",
  canAssignManager,
  isManagerInvitationResend,
  managerAssignmentMode,
  managerAssignmentDisabledReason,
  isUpdatingProfile,
  isAssigningManager,
  onClose,
  onUpdateProfile,
  onAssignManager,
  onRemoveManagerRole,
  onRemovePerson,
}: Props) {
  const [isManagerConfirmationOpen, setIsManagerConfirmationOpen] = useState(false);

  if (!person) return null;

  const handleClose = () => {
    setIsManagerConfirmationOpen(false);
    onClose();
  };

  const handleAssignManager = async () => {
    const succeeded = await onAssignManager();
    if (succeeded) setIsManagerConfirmationOpen(false);
  };

  return (
    <Dialog
      title="ユーザー詳細"
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open) handleClose();
      }}
      onClose={handleClose}
      closeLabel="閉じる"
      maxW={{ base: "100vw", lg: "720px" }}
      maxH={{ base: "100dvh", lg: "86dvh" }}
      contentProps={{
        w: "100%",
        h: { base: "100dvh", lg: "86dvh" },
        my: { base: 0, lg: "auto" },
        borderRadius: { base: 0, lg: "l3" },
      }}
      bodyProps={{
        px: { base: 4, lg: 6 },
        pt: 0,
        pb: { base: 6, lg: 6 },
      }}
    >
      <Stack gap={5}>
        <UserSummary person={person} />

        <Tabs.Root defaultValue={defaultTab} colorPalette="teal" variant="line">
          <Tabs.List overflowX="auto" overflowY="hidden" whiteSpace="nowrap" borderBottomWidth="1px">
            <Tabs.Trigger value="information" flexShrink={0}>
              情報
            </Tabs.Trigger>
            <Tabs.Trigger value="settings" flexShrink={0}>
              設定
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="information" pt={4}>
            <InformationTab person={person} isUpdating={isUpdatingProfile} onUpdate={onUpdateProfile} />
          </Tabs.Content>

          <Tabs.Content value="settings" pt={4}>
            <SettingsTab
              person={person}
              canAssignManager={canAssignManager && Boolean(person.email)}
              isManagerInvitationResend={isManagerInvitationResend}
              managerAssignmentMode={managerAssignmentMode}
              managerAssignmentDisabledReason={
                person.email ? managerAssignmentDisabledReason : "メールアドレスを登録してから管理者にしてください。"
              }
              isManagerConfirmationOpen={isManagerConfirmationOpen}
              isAssigningManager={isAssigningManager}
              onRequestManagerAssignment={() => setIsManagerConfirmationOpen(true)}
              onCancelManagerAssignment={() => setIsManagerConfirmationOpen(false)}
              onAssignManager={handleAssignManager}
              onRemoveManagerRole={onRemoveManagerRole}
              onRemovePerson={onRemovePerson}
            />
          </Tabs.Content>
        </Tabs.Root>
      </Stack>
    </Dialog>
  );
}

function UserSummary({ person }: { person: OrganizationPersonView }) {
  const initial = person.name.trim().charAt(0) || "?";
  const isManager = person.managerRole !== "none";

  return (
    <HStack gap={3} align="center">
      <Flex
        boxSize="48px"
        borderRadius="full"
        bg={isManager ? "teal.500" : "teal.50"}
        color={isManager ? "white" : "teal.700"}
        align="center"
        justify="center"
        fontWeight="semibold"
        flexShrink={0}
      >
        {initial}
      </Flex>
      <Stack gap={1} minW={0}>
        <HStack gap={2} align="center" wrap="wrap">
          <Text fontWeight="semibold" color="gray.900" truncate>
            {person.name}
          </Text>
          <OrganizationUserRoleBadges person={person} />
        </HStack>
        {person.email && (
          <Text fontSize="sm" color="fg.muted" truncate>
            {person.email}
          </Text>
        )}
      </Stack>
    </HStack>
  );
}

function InformationTab({
  person,
  isUpdating,
  onUpdate,
}: {
  person: OrganizationPersonView;
  isUpdating: boolean;
  onUpdate: (data: PersonProfileFormData) => Promise<boolean | undefined>;
}) {
  const formId = `organization-person-profile-${person.id}`;

  return (
    <Stack gap={5}>
      <PersonProfileForm
        key={person.id}
        formId={formId}
        initialValues={{ name: person.name, email: person.email ?? "" }}
        onSubmit={async (data) => {
          await onUpdate(data);
        }}
      />
      <Flex justify="flex-end">
        <Button type="submit" form={formId} colorPalette="teal" loading={isUpdating}>
          変更を保存
        </Button>
      </Flex>
      <InformationRow label="所属店舗" value={person.shopNames.length > 0 ? person.shopNames.join("、") : "なし"} />
    </Stack>
  );
}

function InformationRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={1.5}>
      <Text fontSize="xs" color="fg.muted">
        {label}
      </Text>
      <Text fontSize="sm" color="gray.900">
        {value}
      </Text>
    </Stack>
  );
}

function SettingsTab({
  person,
  canAssignManager,
  isManagerInvitationResend,
  managerAssignmentMode,
  managerAssignmentDisabledReason,
  isManagerConfirmationOpen,
  isAssigningManager,
  onRequestManagerAssignment,
  onCancelManagerAssignment,
  onAssignManager,
  onRemoveManagerRole,
  onRemovePerson,
}: {
  person: OrganizationPersonView;
  canAssignManager: boolean;
  isManagerInvitationResend: boolean;
  managerAssignmentMode: "addition" | "freeManagerExchange";
  managerAssignmentDisabledReason?: string;
  isManagerConfirmationOpen: boolean;
  isAssigningManager: boolean;
  onRequestManagerAssignment: () => void;
  onCancelManagerAssignment: () => void;
  onAssignManager: () => void | Promise<void>;
  onRemoveManagerRole: () => void;
  onRemovePerson: () => void;
}) {
  const managerRoleDisabledReasonId = `organization-user-${person.id}-manager-role-disabled-reason`;
  const managerAssignmentDisabledReasonId = `organization-user-${person.id}-manager-assignment-disabled-reason`;
  const removalDisabledReasonId = `organization-user-${person.id}-removal-disabled-reason`;

  return (
    <Stack gap={6}>
      {person.managerRole === "none" && (
        <SettingAction
          title="管理者権限"
          description={
            isManagerInvitationResend
              ? "本人へ新しいログイン案内を送ります。以前のURLは利用できなくなります。"
              : "本人がログインし、アカウントと店舗人物の連携が完了した時点で管理者になります。"
          }
          action={
            <Button
              colorPalette="teal"
              gap={1.5}
              onClick={onRequestManagerAssignment}
              disabled={!canAssignManager || isAssigningManager}
              title={!canAssignManager ? managerAssignmentDisabledReason : undefined}
              aria-describedby={
                !canAssignManager && managerAssignmentDisabledReason ? managerAssignmentDisabledReasonId : undefined
              }
            >
              <LuShieldPlus aria-hidden />
              {isManagerInvitationResend ? "ログイン案内を再送" : "管理者として招待"}
            </Button>
          }
          confirmation={
            isManagerConfirmationOpen && person.email ? (
              <ManagerAssignmentConfirmation
                personName={person.name}
                personEmail={person.email}
                mode={managerAssignmentMode}
                isResend={isManagerInvitationResend}
                isRunning={isAssigningManager}
                onCancel={onCancelManagerAssignment}
                onConfirm={onAssignManager}
              />
            ) : undefined
          }
          disabledReason={!canAssignManager ? managerAssignmentDisabledReason : undefined}
          disabledReasonId={managerAssignmentDisabledReasonId}
        />
      )}

      {person.managerRole === "active" && (
        <SettingAction
          title="管理者権限"
          description="管理者権限を外しても、スタッフとしての店舗所属は維持します。"
          action={
            <Button
              variant="outline"
              gap={1.5}
              onClick={onRemoveManagerRole}
              disabled={!person.canRemoveManagerRole}
              title={!person.canRemoveManagerRole ? person.managerRoleRemovalDisabledReason : undefined}
              aria-describedby={
                !person.canRemoveManagerRole && person.managerRoleRemovalDisabledReason
                  ? managerRoleDisabledReasonId
                  : undefined
              }
            >
              <LuShieldMinus aria-hidden />
              管理者権限を外す
            </Button>
          }
          disabledReason={!person.canRemoveManagerRole ? person.managerRoleRemovalDisabledReason : undefined}
          disabledReasonId={managerRoleDisabledReasonId}
        />
      )}

      <DeletionActionSection
        description="このグループのすべての店舗所属と権限を終了します。過去のシフト履歴は保持します。"
        actionLabel="グループから削除"
        canDelete={person.canRemove}
        disabledReason={person.removeDisabledReason}
        disabledReasonId={removalDisabledReasonId}
        onDelete={onRemovePerson}
      />
    </Stack>
  );
}

function SettingAction({
  title,
  description,
  action,
  confirmation,
  disabledReason,
  disabledReasonId,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
  confirmation?: React.ReactNode;
  disabledReason?: string;
  disabledReasonId: string;
}) {
  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <Stack gap={3}>
        <Stack gap={1}>
          <Heading as="h3" fontSize="sm" fontWeight="semibold" color="gray.900">
            {title}
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            {description}
          </Text>
        </Stack>
        <Flex justify="flex-end">{action}</Flex>
        {confirmation}
        {disabledReason && (
          <Text id={disabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
            {disabledReason}
          </Text>
        )}
      </Stack>
    </Box>
  );
}
