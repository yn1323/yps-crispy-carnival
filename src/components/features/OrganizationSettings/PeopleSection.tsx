import { Badge, Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuChevronDown, LuMailPlus, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { OrganizationUserDetailDialog } from "./OrganizationUserDetailDialog";
import { OrganizationUserRow } from "./OrganizationUserRow";
import type { ManagerInvitationStatus, ManagerInvitationView, OrganizationPersonView } from "./types";

type Props = {
  people: OrganizationPersonView[];
  invitations: ManagerInvitationView[];
  canInviteManager: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  inviteManagerDisabledReason?: string;
  onInviteManager: () => void;
  onRemoveManagerRole: (personId: string) => void;
  onRemovePerson: (personId: string) => void;
  onResendInvitation: (invitationId: string) => void;
  onRevokeInvitation: (invitationId: string) => void;
};

const INITIAL_VISIBLE_USER_COUNT = 10;
const LOAD_MORE_USER_COUNT = 10;

export const PeopleSection = ({
  people,
  invitations,
  canInviteManager,
  managerInvitationMode,
  inviteManagerDisabledReason,
  onInviteManager,
  onRemoveManagerRole,
  onRemovePerson,
  onResendInvitation,
  onRevokeInvitation,
}: Props) => {
  const [visibleUserCount, setVisibleUserCount] = useState(INITIAL_VISIBLE_USER_COUNT);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const selectedPerson = selectedPersonId ? (people.find((person) => person.id === selectedPersonId) ?? null) : null;
  const visiblePeople = people.slice(0, visibleUserCount);
  const canLoadMore = people.length > visibleUserCount;

  useEffect(() => {
    if (selectedPersonId && !selectedPerson) setSelectedPersonId(null);
  }, [selectedPerson, selectedPersonId]);

  const closeDetailAndOpenConfirmation = (action: (personId: string) => void) => {
    if (!selectedPerson) return;
    const personId = selectedPerson.id;
    setSelectedPersonId(null);
    action(personId);
  };

  return (
    <Stack gap={7}>
      <ManagerInvitationsSection
        invitations={invitations}
        canInviteManager={canInviteManager}
        managerInvitationMode={managerInvitationMode}
        inviteManagerDisabledReason={inviteManagerDisabledReason}
        onInviteManager={onInviteManager}
        onResendInvitation={onResendInvitation}
        onRevokeInvitation={onRevokeInvitation}
      />

      <Stack as="section" gap={4} aria-labelledby="organization-people-heading">
        <HStack gap={2}>
          <LuUsers aria-hidden />
          <Heading id="organization-people-heading" as="h2" fontSize="lg">
            グループ全体のユーザー
          </Heading>
        </HStack>

        {visiblePeople.length === 0 ? (
          <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" p={5} textAlign="center">
            <Text color="fg.muted">グループのユーザーはいません。</Text>
          </Box>
        ) : (
          <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
            <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
              {visiblePeople.map((person) => (
                <OrganizationUserRow
                  key={person.id}
                  person={person}
                  onOpenDetail={() => setSelectedPersonId(person.id)}
                />
              ))}
            </Stack>
          </Box>
        )}

        {canLoadMore && (
          <Flex justify="center">
            <Button
              variant="ghost"
              colorPalette="teal"
              size="sm"
              gap={1}
              onClick={() => setVisibleUserCount((count) => count + LOAD_MORE_USER_COUNT)}
            >
              <LuChevronDown aria-hidden />
              もっと見る
            </Button>
          </Flex>
        )}

        <OrganizationUserDetailDialog
          person={selectedPerson}
          isOpen={selectedPerson !== null}
          onClose={() => setSelectedPersonId(null)}
          onRemoveManagerRole={() => closeDetailAndOpenConfirmation(onRemoveManagerRole)}
          onRemovePerson={() => closeDetailAndOpenConfirmation(onRemovePerson)}
        />
      </Stack>
    </Stack>
  );
};

const INVITATION_STATUS: Record<
  ManagerInvitationStatus,
  { label: string; colorPalette: "teal" | "green" | "gray" | "orange" | "red" }
> = {
  pending: { label: "招待中", colorPalette: "teal" },
  expired: { label: "期限切れ", colorPalette: "orange" },
  revoked: { label: "取消済み", colorPalette: "gray" },
  accepted: { label: "承認済み", colorPalette: "green" },
  sendFailed: { label: "送信失敗", colorPalette: "red" },
  limitReached: { label: "上限到達", colorPalette: "orange" },
  conflict: { label: "確認が必要", colorPalette: "red" },
};

function ManagerInvitationsSection({
  invitations,
  canInviteManager,
  managerInvitationMode,
  inviteManagerDisabledReason,
  onInviteManager,
  onResendInvitation,
  onRevokeInvitation,
}: Pick<
  Props,
  | "invitations"
  | "canInviteManager"
  | "managerInvitationMode"
  | "inviteManagerDisabledReason"
  | "onInviteManager"
  | "onResendInvitation"
  | "onRevokeInvitation"
>) {
  const disabledReasonId = "organization-manager-invitation-disabled-reason";

  return (
    <Stack as="section" gap={3} aria-labelledby="manager-invitations-heading">
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <Stack gap={1}>
          <Heading id="manager-invitations-heading" as="h2" fontSize="lg">
            管理者招待
          </Heading>
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            管理者はグループ内のすべての店舗と契約設定を管理できます。
          </Text>
        </Stack>
        <Button
          size="sm"
          colorPalette="teal"
          gap={1.5}
          onClick={onInviteManager}
          disabled={!canInviteManager}
          title={!canInviteManager ? inviteManagerDisabledReason : undefined}
          aria-describedby={!canInviteManager && inviteManagerDisabledReason ? disabledReasonId : undefined}
        >
          <LuMailPlus aria-hidden />
          {managerInvitationMode === "freeManagerExchange" ? "管理者を交代" : "管理者を招待"}
        </Button>
      </Flex>

      {!canInviteManager && inviteManagerDisabledReason && (
        <Text id={disabledReasonId} fontSize="sm" color="orange.700">
          {inviteManagerDisabledReason}
        </Text>
      )}

      {invitations.length === 0 ? (
        <Box borderWidth="1px" borderStyle="dashed" borderRadius="xl" p={4} textAlign="center">
          <Text fontSize="sm" color="fg.muted">
            管理者を招待すると、ここで承認状況を確認できます。
          </Text>
        </Box>
      ) : (
        <Stack gap={2}>
          {invitations.map((invitation) => {
            const status = INVITATION_STATUS[invitation.status];
            return (
              <Flex
                key={invitation.id}
                borderWidth="1px"
                borderRadius="lg"
                bg="white"
                px={3}
                py={2.5}
                justify="space-between"
                align={{ base: "flex-start", md: "center" }}
                gap={3}
                direction={{ base: "column", md: "row" }}
              >
                <Stack gap={1} minW={0}>
                  <HStack gap={2} wrap="wrap">
                    <Text fontSize="sm" fontWeight="semibold" wordBreak="break-all">
                      {invitation.email}
                    </Text>
                    <Badge colorPalette={status.colorPalette} variant="subtle">
                      {status.label}
                    </Badge>
                  </HStack>
                  {(invitation.statusDetail || invitation.expiresAt) && (
                    <Text
                      fontSize="xs"
                      color={
                        invitation.status === "sendFailed" || invitation.status === "conflict" ? "red.700" : "fg.muted"
                      }
                    >
                      {invitation.statusDetail ?? `有効期限: ${invitation.expiresAt}`}
                    </Text>
                  )}
                </Stack>

                {(invitation.canResend || invitation.canRevoke) && (
                  <HStack gap={2} flexShrink={0}>
                    {invitation.canResend && (
                      <Button
                        size="xs"
                        variant="outline"
                        aria-label={`${invitation.email}への管理者招待を再送`}
                        onClick={() => onResendInvitation(invitation.id)}
                      >
                        再送
                      </Button>
                    )}
                    {invitation.canRevoke && (
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        aria-label={`${invitation.email}への管理者招待を取り消す`}
                        onClick={() => onRevokeInvitation(invitation.id)}
                      >
                        取り消す
                      </Button>
                    )}
                  </HStack>
                )}
              </Flex>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
