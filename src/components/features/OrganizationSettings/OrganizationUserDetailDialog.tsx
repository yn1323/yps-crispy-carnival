import { Box, Flex, Heading, HStack, Stack, Tabs, Text } from "@chakra-ui/react";
import { LuShieldMinus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { OrganizationUserRoleBadges } from "./OrganizationUserRoleBadges";
import type { OrganizationPersonView } from "./types";

type Props = {
  person: OrganizationPersonView | null;
  isOpen: boolean;
  defaultTab?: "information" | "settings";
  onClose: () => void;
  onRemoveManagerRole: () => void;
  onRemovePerson: () => void;
};

export function OrganizationUserDetailDialog({
  person,
  isOpen,
  defaultTab = "information",
  onClose,
  onRemoveManagerRole,
  onRemovePerson,
}: Props) {
  if (!person) return null;

  return (
    <Dialog
      title="ユーザー詳細"
      isOpen={isOpen}
      onOpenChange={({ open }) => {
        if (!open) onClose();
      }}
      onClose={onClose}
      hideFooter
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
            <InformationTab person={person} />
          </Tabs.Content>

          <Tabs.Content value="settings" pt={4}>
            <SettingsTab person={person} onRemoveManagerRole={onRemoveManagerRole} onRemovePerson={onRemovePerson} />
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

function InformationTab({ person }: { person: OrganizationPersonView }) {
  return (
    <Stack gap={4}>
      <InformationRow label="名前" value={person.name} />
      {person.email && <InformationRow label="メールアドレス" value={person.email} />}
      <Stack gap={1.5}>
        <Text fontSize="xs" color="fg.muted">
          役割
        </Text>
        <OrganizationUserRoleBadges person={person} />
      </Stack>
      <InformationRow
        label="所属店舗"
        value={person.shopNames.length > 0 ? person.shopNames.join("、") : "店舗所属なし"}
      />
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
  onRemoveManagerRole,
  onRemovePerson,
}: {
  person: OrganizationPersonView;
  onRemoveManagerRole: () => void;
  onRemovePerson: () => void;
}) {
  const managerRoleDisabledReasonId = `organization-user-${person.id}-manager-role-disabled-reason`;
  const removalDisabledReasonId = `organization-user-${person.id}-removal-disabled-reason`;

  return (
    <Stack gap={6}>
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

      <SettingAction
        title="グループから削除"
        description="このグループのすべての店舗所属と権限を終了します。過去のシフト履歴は保持します。"
        action={
          <Button
            colorPalette="red"
            gap={1.5}
            onClick={onRemovePerson}
            disabled={!person.canRemove}
            title={!person.canRemove ? person.removeDisabledReason : undefined}
            aria-describedby={!person.canRemove && person.removeDisabledReason ? removalDisabledReasonId : undefined}
          >
            <LuTrash2 aria-hidden />
            グループから削除
          </Button>
        }
        disabledReason={!person.canRemove ? person.removeDisabledReason : undefined}
        disabledReasonId={removalDisabledReasonId}
      />
    </Stack>
  );
}

function SettingAction({
  title,
  description,
  action,
  disabledReason,
  disabledReasonId,
}: {
  title: string;
  description: string;
  action: React.ReactNode;
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
        {disabledReason && (
          <Text id={disabledReasonId} fontSize="xs" color="orange.700" textAlign="right">
            {disabledReason}
          </Text>
        )}
      </Stack>
    </Box>
  );
}
