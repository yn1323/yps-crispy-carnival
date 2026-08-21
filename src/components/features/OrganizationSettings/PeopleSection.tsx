import { Badge, Box, Flex, Heading, HStack, Skeleton, Stack } from "@chakra-ui/react";
import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { LuChevronDown, LuGripVertical, LuPlus, LuShieldCheck, LuUsers } from "react-icons/lu";
import { StaffListRow } from "@/src/components/shared/StaffListRow";
import { Button, IconButton } from "@/src/components/ui/Button";
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
  staffOrder?: PeopleSectionStaffOrder;
};

export type PeopleSectionStaffOrder = {
  disabled: boolean;
  disabledReason?: string;
  isSaving: boolean;
  onReorder: (activePersonId: string, overPersonId: string) => void;
};

const screenReaderInstructions = {
  draggable:
    "並べ替えるにはスペースキーを押します。上下の矢印キーで移動し、もう一度スペースキーを押して確定します。エスケープキーで取り消します。",
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
  staffOrder,
}: Props) => {
  const [visibleUserCount, setVisibleUserCount] = useState(initialVisibleUserCount);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const visiblePeople = people.slice(0, visibleUserCount);
  const hasLocallyHiddenPeople = people.length > visibleUserCount;
  const canLoadMore = hasLocallyHiddenPeople || canLoadMorePeople;
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const personNameById = useMemo<ReadonlyMap<string, string>>(
    () => new Map(people.map((person) => [person.id, person.name])),
    [people],
  );
  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => `${personNameById.get(String(active.id)) ?? "スタッフ"}の移動を開始しました。`,
      onDragOver: ({ active, over }) => {
        if (!over) return "移動先がありません。";
        const overIndex = people.findIndex((person) => person.id === String(over.id));
        return `${personNameById.get(String(active.id)) ?? "スタッフ"}を${overIndex + 1}番目へ移動します。`;
      },
      onDragEnd: ({ active, over }) => {
        if (!over) return "並べ替えを取り消しました。";
        const overIndex = people.findIndex((person) => person.id === String(over.id));
        return `${personNameById.get(String(active.id)) ?? "スタッフ"}を${overIndex + 1}番目へ移動しました。`;
      },
      onDragCancel: ({ active }) =>
        `${personNameById.get(String(active.id)) ?? "スタッフ"}の並べ替えを取り消しました。`,
    }),
    [people, personNameById],
  );

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

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActivePersonId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActivePersonId(null);
    if (!over || active.id === over.id) return;
    staffOrder?.onReorder(String(active.id), String(over.id));
  };

  const activePerson = people.find((person) => person.id === activePersonId);

  return (
    <Stack as="section" gap={4} aria-labelledby="organization-people-heading">
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <HStack gap={2} flex={{ base: "1 1 auto", md: "0 0 auto" }} minW={0}>
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
        <Flex display={{ base: "contents", md: "flex" }} gap={2} align="center" ms={{ md: "auto" }}>
          <Flex direction={{ base: "column", md: "row" }} gap={2} w={{ base: "full", md: "auto" }}>
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
                w={{ base: "full", md: "auto" }}
                bg={{ base: "white", md: "transparent" }}
                borderColor={{ base: "border.emphasized", md: "transparent" }}
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
                w={{ base: "full", md: "auto" }}
                bg={{ base: "white", md: "transparent" }}
                borderColor={{ base: "border.emphasized", md: "transparent" }}
              >
                <LuShieldCheck aria-hidden />
                管理者を設定
              </Button>
            )}
          </Flex>
        </Flex>
      </Flex>

      {visiblePeople.length === 0 ? (
        <Empty icon={LuUsers} title="この組織にスタッフはいません。" titleAs="h3" variant="section" py={6} />
      ) : staffOrder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements, screenReaderInstructions }}
          onDragStart={handleDragStart}
          onDragCancel={() => setActivePersonId(null)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={visiblePeople.map((person) => person.id)} strategy={verticalListSortingStrategy}>
            <PeopleList isSaving={staffOrder.isSaving}>
              {visiblePeople.map((person, index) => (
                <SortablePersonRow
                  key={person.id}
                  person={person}
                  index={index}
                  visibleUserCount={visibleUserCount}
                  disabled={staffOrder.disabled}
                  disabledReason={staffOrder.disabledReason}
                  onOpenUser={onOpenUser}
                />
              ))}
            </PeopleList>
          </SortableContext>
          <DragOverlay>
            {activePerson ? (
              <Box
                bg="white"
                borderWidth="1px"
                borderColor="blackAlpha.200"
                borderRadius="xl"
                boxShadow="lg"
                px={4}
                py={3}
                fontWeight="semibold"
              >
                {activePerson.name}
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <PeopleList>
          {visiblePeople.map((person) => (
            <Box as="li" key={person.id} listStyleType="none">
              <PersonRow person={person} visibleUserCount={visibleUserCount} onOpenUser={onOpenUser} />
            </Box>
          ))}
        </PeopleList>
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

function PeopleList({ children, isSaving = false }: { children: ReactNode; isSaving?: boolean }) {
  return (
    <Box bg="white" borderRadius="xl" borderWidth="1px" borderColor="blackAlpha.100" overflow="hidden">
      <Stack
        as="ol"
        aria-label="スタッフ一覧"
        aria-busy={isSaving || undefined}
        gap={0}
        divideY="1px"
        divideColor="blackAlpha.100"
        listStyleType="none"
        m={0}
        p={0}
      >
        {children}
      </Stack>
    </Box>
  );
}

function SortablePersonRow({
  person,
  index,
  visibleUserCount,
  disabled,
  disabledReason,
  onOpenUser,
}: {
  person: OrganizationPersonView;
  index: number;
  visibleUserCount: number;
  disabled: boolean;
  disabledReason?: string;
  onOpenUser: (personId: string, visibleUserCount: number) => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: person.id,
    disabled,
  });
  const isManager = person.managerRole !== "none";
  const handleLabel = `${person.name}をドラッグして並べ替え。現在${index + 1}番目。`;

  return (
    <Flex
      ref={setNodeRef}
      as="li"
      position="relative"
      zIndex={isDragging ? 1 : undefined}
      opacity={isDragging ? 0.35 : 1}
      transform={CSS.Transform.toString(transform)}
      transition={transition}
      align="stretch"
      bg={isManager ? "teal.50/50" : "white"}
      listStyleType="none"
    >
      <Flex align="center" ps={{ base: 1, md: 2 }} flexShrink={0}>
        <IconButton
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={disabled && disabledReason ? `${handleLabel} ${disabledReason}` : handleLabel}
          aria-disabled={disabled || undefined}
          variant="ghost"
          colorPalette="gray"
          minW="44px"
          minH="44px"
          touchAction="none"
          cursor={disabled ? "not-allowed" : isDragging ? "grabbing" : "grab"}
          opacity={disabled ? 0.45 : 1}
          title={disabled ? disabledReason : undefined}
        >
          <LuGripVertical size={20} aria-hidden />
        </IconButton>
      </Flex>
      <Box flex={1} minW={0}>
        <PersonRow person={person} visibleUserCount={visibleUserCount} onOpenUser={onOpenUser} />
      </Box>
    </Flex>
  );
}

function PersonRow({
  person,
  visibleUserCount,
  onOpenUser,
}: {
  person: OrganizationPersonView;
  visibleUserCount: number;
  onOpenUser: (personId: string, visibleUserCount: number) => void;
}) {
  const isManager = person.managerRole !== "none";
  const lineStatus = person.lineStatus ?? (person.isLineConnected ? "linked_following" : "unlinked");

  return (
    <StaffListRow
      id={`settings-user-${person.id}`}
      name={person.name}
      role={isManager ? "manager" : "staff"}
      detail={{ kind: "shopNames", names: person.shopNames }}
      badges={[{ kind: "role" }, { kind: "line", status: lineStatus }]}
      onOpen={() => onOpenUser(person.id, visibleUserCount)}
    />
  );
}

type PeopleSectionSkeletonProps = {
  showAddStaff?: boolean;
  showStaffOrderHandle?: boolean;
  showManagerInvitation?: boolean;
  rowCount?: number;
};

export function PeopleSectionSkeleton({
  showAddStaff = false,
  showStaffOrderHandle = false,
  showManagerInvitation = false,
  rowCount = 3,
}: PeopleSectionSkeletonProps) {
  return (
    <Stack as="section" gap={4} aria-hidden>
      <Flex justify="space-between" align={{ base: "flex-start", md: "center" }} gap={3} wrap="wrap">
        <HStack gap={2} flex={{ base: "1 1 auto", md: "0 0 auto" }} minW={0}>
          <Skeleton boxSize={5} borderRadius="sm" flexShrink={0} />
          <Skeleton h="28px" w="184px" maxW="70vw" />
        </HStack>
        {(showAddStaff || showManagerInvitation) && (
          <Flex display={{ base: "contents", md: "flex" }} gap={2} align="center" ms={{ md: "auto" }}>
            <Flex direction={{ base: "column", md: "row" }} gap={2} w={{ base: "full", md: "auto" }}>
              {showAddStaff && <Skeleton h="36px" w={{ base: "full", md: "120px" }} borderRadius="md" />}
              {showManagerInvitation && <Skeleton h="36px" w={{ base: "full", md: "136px" }} borderRadius="md" />}
            </Flex>
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
              {showStaffOrderHandle && <Skeleton boxSize="44px" borderRadius="md" flexShrink={0} />}
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
