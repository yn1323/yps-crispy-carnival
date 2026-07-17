import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuChevronDown, LuMailPlus, LuUsers } from "react-icons/lu";
import type { PersonProfileFormData } from "@/src/components/shared/PersonProfileForm";
import { Button } from "@/src/components/ui/Button";
import { OrganizationUserDetailDialog } from "./OrganizationUserDetailDialog";
import { OrganizationUserRow } from "./OrganizationUserRow";
import type { OrganizationPersonView } from "./types";

type Props = {
  people: OrganizationPersonView[];
  canInviteManager: boolean;
  canOpenManagerInvitation: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  freeManagerExchangeCandidates: Array<{ id: string; name: string; email: string }>;
  inviteManagerDisabledReason?: string;
  isUpdatingPersonProfile: boolean;
  isAssigningManager: boolean;
  onInviteManager: () => void;
  onUpdatePersonProfile: (personId: string, data: PersonProfileFormData) => Promise<boolean | undefined>;
  onAssignManager: (personId: string) => Promise<boolean | undefined>;
  onRemoveManagerRole: (personId: string) => void;
  onRemovePerson: (personId: string) => void;
};

const INITIAL_VISIBLE_USER_COUNT = 10;
const LOAD_MORE_USER_COUNT = 10;

export const PeopleSection = ({
  people,
  canInviteManager,
  canOpenManagerInvitation,
  managerInvitationMode,
  freeManagerExchangeCandidates,
  inviteManagerDisabledReason,
  isUpdatingPersonProfile,
  isAssigningManager,
  onInviteManager,
  onUpdatePersonProfile,
  onAssignManager,
  onRemoveManagerRole,
  onRemovePerson,
}: Props) => {
  const [visibleUserCount, setVisibleUserCount] = useState(INITIAL_VISIBLE_USER_COUNT);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const selectedPerson = selectedPersonId ? (people.find((person) => person.id === selectedPersonId) ?? null) : null;
  const visiblePeople = people.slice(0, visibleUserCount);
  const canLoadMore = people.length > visibleUserCount;
  const freeManagerCandidateIds = new Set(freeManagerExchangeCandidates.map((candidate) => candidate.id));
  const selectedPersonCanBeManager = Boolean(
    selectedPerson?.managerRole === "none" &&
      (selectedPerson.hasManagerInvitation ||
        (selectedPerson.isStaff &&
          canInviteManager &&
          (managerInvitationMode === "addition" || freeManagerCandidateIds.has(selectedPerson.id)))),
  );
  const managerAssignmentDisabledReason = selectedPersonCanBeManager
    ? undefined
    : selectedPerson?.managerRole !== "none"
      ? "このユーザーはすでに管理者です。"
      : !selectedPerson?.isStaff
        ? "店舗に所属するスタッフを選んでください。"
        : inviteManagerDisabledReason;

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
    <Stack as="section" gap={4} aria-labelledby="organization-people-heading">
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <HStack gap={2}>
          <LuUsers aria-hidden />
          <Heading id="organization-people-heading" as="h2" fontSize="lg">
            グループ全体のユーザー
          </Heading>
        </HStack>
        <Button
          size="sm"
          colorPalette="teal"
          gap={1.5}
          onClick={onInviteManager}
          disabled={!canOpenManagerInvitation}
          title={!canOpenManagerInvitation ? inviteManagerDisabledReason : undefined}
          aria-describedby={
            !canOpenManagerInvitation && inviteManagerDisabledReason
              ? "organization-manager-invitation-disabled-reason"
              : undefined
          }
        >
          <LuMailPlus aria-hidden />
          {!canInviteManager && canOpenManagerInvitation
            ? "ログイン案内を再送"
            : managerInvitationMode === "freeManagerExchange"
              ? "次の管理者を招待"
              : "管理者を招待"}
        </Button>
      </Flex>

      {!canOpenManagerInvitation && inviteManagerDisabledReason && (
        <Text id="organization-manager-invitation-disabled-reason" fontSize="sm" color="orange.700">
          {inviteManagerDisabledReason}
        </Text>
      )}

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
        canAssignManager={selectedPersonCanBeManager}
        isManagerInvitationResend={selectedPerson?.hasManagerInvitation === true}
        managerAssignmentMode={managerInvitationMode}
        managerAssignmentDisabledReason={managerAssignmentDisabledReason}
        isUpdatingProfile={isUpdatingPersonProfile}
        isAssigningManager={isAssigningManager}
        onClose={() => setSelectedPersonId(null)}
        onUpdateProfile={(data) =>
          selectedPerson ? onUpdatePersonProfile(selectedPerson.id, data) : Promise.resolve(false)
        }
        onAssignManager={() => (selectedPerson ? onAssignManager(selectedPerson.id) : Promise.resolve(false))}
        onRemoveManagerRole={() => closeDetailAndOpenConfirmation(onRemoveManagerRole)}
        onRemovePerson={() => closeDetailAndOpenConfirmation(onRemovePerson)}
      />
    </Stack>
  );
};
