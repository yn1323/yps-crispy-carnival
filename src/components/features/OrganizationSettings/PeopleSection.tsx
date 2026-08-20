import { Badge, Box, Flex, Heading, HStack, Skeleton, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { LuArrowUpDown, LuChevronDown, LuPlus, LuShieldCheck, LuUsers } from "react-icons/lu";
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
  peopleUsageHasOverflow?: boolean;
  filterResultCount?: number;
  filterResultCountHasOverflow?: boolean;
  onVisibleUserCountChange?: (count: number) => void;
  canLoadMorePeople?: boolean;
  isLoadingMorePeople?: boolean;
  onLoadMorePeople?: () => void;
  onAddStaff?: () => void;
  canAddStaff?: boolean;
  addStaffDisabledReason?: string;
  onChangeStaffOrder?: () => void;
  canChangeStaffOrder?: boolean;
  changeStaffOrderDisabledReason?: string;
};

export const PeopleSection = ({
  people,
  peopleUsage,
  showManagerInvitation,
  onManageManagers,
  onOpenUser,
  initialVisibleUserCount = DEFAULT_USER_LIST_COUNT,
  focusedPersonId,
  peopleUsageHasOverflow = false,
  filterResultCount,
  filterResultCountHasOverflow = false,
  onVisibleUserCountChange,
  canLoadMorePeople = false,
  isLoadingMorePeople = false,
  onLoadMorePeople,
  onAddStaff,
  canAddStaff = true,
  addStaffDisabledReason,
  onChangeStaffOrder,
  canChangeStaffOrder = true,
  changeStaffOrderDisabledReason,
}: Props) => {
  const [visibleUserCount, setVisibleUserCount] = useState(initialVisibleUserCount);
  const visiblePeople = people.slice(0, visibleUserCount);
  const hasLocallyHiddenPeople = people.length > visibleUserCount;
  const canLoadMore = hasLocallyHiddenPeople || canLoadMorePeople;
  const changeStaffOrderDisabledReasonId = "organization-people-staff-order-disabled-reason";

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
    if (!hasLocallyHiddenPeople) onLoadMorePeople?.();
  };

  return (
    <Stack as="section" gap={4} aria-labelledby="organization-people-heading">
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <HStack gap={2}>
          <LuUsers aria-hidden />
          <Heading id="organization-people-heading" as="h2" fontSize="lg">
            全スタッフ
            {peopleUsage.max > 0
              ? peopleUsageHasOverflow
                ? ` (${peopleUsage.current}人以上 / 上限${peopleUsage.max}人)`
                : ` (${peopleUsage.current}/${peopleUsage.max})`
              : ""}
          </Heading>
          {filterResultCount !== undefined && (
            <Badge colorPalette="gray" variant="subtle" borderRadius="full" px={2.5} py={1}>
              店舗所属スタッフ {filterResultCount}人{filterResultCountHasOverflow ? "以上" : ""}
            </Badge>
          )}
        </HStack>
        <Flex gap={2} wrap="wrap" justify="flex-end" ms="auto">
          {onChangeStaffOrder && (
            <Button
              variant="outline"
              size="sm"
              colorPalette="gray"
              gap={1.5}
              fontWeight="semibold"
              onClick={onChangeStaffOrder}
              disabled={!canChangeStaffOrder}
              aria-describedby={
                !canChangeStaffOrder && changeStaffOrderDisabledReason ? changeStaffOrderDisabledReasonId : undefined
              }
            >
              <LuArrowUpDown aria-hidden />
              並び順を変更
            </Button>
          )}
          {onAddStaff && (
            <Button
              variant="ghost"
              size="sm"
              colorPalette="teal"
              gap={1.5}
              fontWeight="semibold"
              onClick={onAddStaff}
              disabled={!canAddStaff}
              title={!canAddStaff ? addStaffDisabledReason : undefined}
            >
              <LuPlus aria-hidden />
              スタッフを追加
            </Button>
          )}
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
              管理者を設定
            </Button>
          )}
        </Flex>
      </Flex>

      {onChangeStaffOrder && !canChangeStaffOrder && changeStaffOrderDisabledReason && (
        <Text id={changeStaffOrderDisabledReasonId} textStyle="bodySm" color="orange.700">
          {changeStaffOrderDisabledReason}
        </Text>
      )}

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
          <Button
            variant="ghost"
            colorPalette="teal"
            size="sm"
            gap={1}
            onClick={handleLoadMore}
            loading={isLoadingMorePeople}
          >
            <LuChevronDown aria-hidden />
            もっと見る
          </Button>
        </Flex>
      )}
    </Stack>
  );
};

type PeopleSectionSkeletonProps = {
  showAddStaff?: boolean;
  showChangeStaffOrder?: boolean;
  showManagerInvitation?: boolean;
  rowCount?: number;
};

export function PeopleSectionSkeleton({
  showAddStaff = false,
  showChangeStaffOrder = false,
  showManagerInvitation = false,
  rowCount = 3,
}: PeopleSectionSkeletonProps) {
  return (
    <Stack as="section" gap={4} aria-hidden>
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <HStack gap={2}>
          <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
          <Skeleton h="28px" w="184px" maxW="70vw" />
        </HStack>
        {(showAddStaff || showChangeStaffOrder || showManagerInvitation) && (
          <Flex gap={2} wrap="wrap" justify="flex-end" ms="auto">
            {showChangeStaffOrder && <Skeleton h="36px" w="136px" borderRadius="md" />}
            {showAddStaff && <Skeleton h="36px" w="120px" borderRadius="md" />}
            {showManagerInvitation && <Skeleton h="36px" w="136px" borderRadius="md" />}
          </Flex>
        )}
      </Flex>

      <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
        <Stack gap={0} divideY="1px" divideColor="blackAlpha.100">
          {Array.from({ length: rowCount }, (_, index) => (
            <Flex
              key={index}
              gap={3}
              align="center"
              px={{ base: 3, md: 4 }}
              py={3.5}
              bg={index === 0 ? "teal.50/50" : "transparent"}
            >
              <Skeleton boxSize="40px" borderRadius="full" flexShrink={0} />

              <Flex gap={2} align="center" wrap="wrap" flex={1} minW={0}>
                <Stack gap={1} flex="1 1 10rem" minW={0}>
                  <Skeleton h="20px" w={index === 1 ? "152px" : "112px"} maxW="full" />
                  <HStack display={{ base: "none", md: "flex" }} gap={1.5}>
                    <Skeleton boxSize={4} borderRadius="sm" flexShrink={0} />
                    <Skeleton h="18px" w={index === 2 ? "96px" : "152px"} maxW="75%" />
                  </HStack>
                </Stack>

                <Flex gap={1.5} ms="auto" w={{ base: "full", sm: "auto" }} maxW="full" justify="flex-end" wrap="wrap">
                  <Skeleton h="20px" w={index === 0 ? "64px" : "56px"} borderRadius="full" />
                  <Skeleton h="20px" w={index === 2 ? "80px" : "96px"} borderRadius="full" />
                </Flex>
              </Flex>

              <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
            </Flex>
          ))}
        </Stack>
      </Box>
    </Stack>
  );
}
