import { Badge, Box, Flex, Heading, HStack, Stack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuChevronDown, LuShieldCheck, LuUsers } from "react-icons/lu";
import { StaffListRow } from "@/src/components/shared/StaffListRow";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { useScrollToListItem } from "@/src/hooks/useScrollToListItem";
import { DEFAULT_USER_LIST_COUNT, USER_LIST_PAGE_SIZE } from "@/src/lib/userListSearch";
import type { BillingUsageView, OrganizationPersonView } from "./types";

type Props = {
  people: OrganizationPersonView[];
  peopleUsage: BillingUsageView;
  showManagerInvitation: boolean;
  onManageManagers: () => void;
  onOpenUser: (personId: string, visibleUserCount: number) => void;
  initialVisibleUserCount?: number;
  focusedPersonId?: string;
  filterResultCount?: number;
  onVisibleUserCountChange?: (count: number) => void;
};

export const PeopleSection = ({
  people,
  peopleUsage,
  showManagerInvitation,
  onManageManagers,
  onOpenUser,
  initialVisibleUserCount = DEFAULT_USER_LIST_COUNT,
  focusedPersonId,
  filterResultCount,
  onVisibleUserCountChange,
}: Props) => {
  const [visibleUserCount, setVisibleUserCount] = useState(initialVisibleUserCount);
  const visiblePeople = people.slice(0, visibleUserCount);
  const canLoadMore = people.length > visibleUserCount;

  useEffect(() => {
    setVisibleUserCount(initialVisibleUserCount);
  }, [initialVisibleUserCount]);

  const focusedItemId = focusedPersonId ? `settings-user-${focusedPersonId}` : undefined;
  const isFocusedItemRendered = Boolean(
    focusedPersonId && visiblePeople.some((person) => person.id === focusedPersonId),
  );
  useScrollToListItem(focusedItemId, isFocusedItemRendered);

  const handleLoadMore = () => {
    const nextVisibleUserCount = visibleUserCount + USER_LIST_PAGE_SIZE;
    setVisibleUserCount(nextVisibleUserCount);
    onVisibleUserCountChange?.(nextVisibleUserCount);
  };

  return (
    <Stack as="section" gap={4} aria-labelledby="organization-people-heading">
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <HStack gap={2}>
          <LuUsers aria-hidden />
          <Heading id="organization-people-heading" as="h2" fontSize="lg">
            全スタッフ{peopleUsage.max > 0 ? ` (${peopleUsage.current}/${peopleUsage.max})` : ""}
          </Heading>
          {filterResultCount !== undefined && (
            <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5} py={1}>
              表示 {filterResultCount}人
            </Badge>
          )}
        </HStack>
        {showManagerInvitation && (
          <Button
            variant="ghost"
            size="sm"
            colorPalette="teal"
            gap={1.5}
            fontWeight="semibold"
            onClick={onManageManagers}
          >
            <LuShieldCheck aria-hidden />
            管理者を変更
          </Button>
        )}
      </Flex>

      {visiblePeople.length === 0 ? (
        <Empty icon={LuUsers} title="この組織にスタッフはいません。" titleAs="h3" variant="section" py={6} />
      ) : (
        <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
          <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
            {visiblePeople.map((person) => {
              const isManager = person.managerRole !== "none";
              const lineStatus = person.lineStatus ?? (person.isLineConnected ? "linked_following" : "unlinked");

              return (
                <StaffListRow
                  key={person.id}
                  id={`settings-user-${person.id}`}
                  name={person.name}
                  role={isManager ? "manager" : "staff"}
                  detail={{ kind: "shopNames", names: person.shopNames }}
                  badges={[{ kind: "role" }, { kind: "line", status: lineStatus }]}
                  onOpen={() => onOpenUser(person.id, visibleUserCount)}
                />
              );
            })}
          </Stack>
        </Box>
      )}

      {canLoadMore && (
        <Flex justify="center">
          <Button variant="ghost" colorPalette="teal" size="sm" gap={1} onClick={handleLoadMore}>
            <LuChevronDown aria-hidden />
            もっと見る
          </Button>
        </Flex>
      )}
    </Stack>
  );
};
