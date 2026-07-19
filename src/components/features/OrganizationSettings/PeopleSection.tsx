import { Box, Flex, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { LuChevronDown, LuMailPlus, LuUsers } from "react-icons/lu";
import { Button } from "@/src/components/ui/Button";
import { OrganizationUserRow } from "./OrganizationUserRow";
import type { OrganizationPersonView } from "./types";

type Props = {
  people: OrganizationPersonView[];
  canInviteManager: boolean;
  canOpenManagerInvitation: boolean;
  managerInvitationMode: "addition" | "freeManagerExchange";
  inviteManagerDisabledReason?: string;
  onInviteManager: () => void;
  onOpenUser: (personId: string) => void;
};

const INITIAL_VISIBLE_USER_COUNT = 10;
const LOAD_MORE_USER_COUNT = 10;

export const PeopleSection = ({
  people,
  canInviteManager,
  canOpenManagerInvitation,
  managerInvitationMode,
  inviteManagerDisabledReason,
  onInviteManager,
  onOpenUser,
}: Props) => {
  const [visibleUserCount, setVisibleUserCount] = useState(INITIAL_VISIBLE_USER_COUNT);
  const visiblePeople = people.slice(0, visibleUserCount);
  const canLoadMore = people.length > visibleUserCount;

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
              <OrganizationUserRow key={person.id} person={person} onOpenUser={() => onOpenUser(person.id)} />
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
    </Stack>
  );
};
