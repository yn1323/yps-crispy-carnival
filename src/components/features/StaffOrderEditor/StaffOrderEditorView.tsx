import { Alert, Box, Flex, HStack, Menu, Portal, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
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
import { useMemo, useRef, useState } from "react";
import {
  LuArrowDown,
  LuArrowUp,
  LuChevronsDown,
  LuChevronsUp,
  LuEllipsis,
  LuGripVertical,
  LuListOrdered,
  LuRefreshCw,
  LuSave,
  LuStore,
  LuUsers,
} from "react-icons/lu";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { reorderStaffOrderPeople } from "./script";
import type { StaffOrderAvailability, StaffOrderPerson } from "./types";

type Props = {
  people: readonly StaffOrderPerson[];
  canWrite: boolean;
  writeDisabledReason?: string;
  isDirty: boolean;
  isSaving: boolean;
  hasServerConflict: boolean;
  filteredShopName?: string;
  onOrderChange: (people: StaffOrderPerson[]) => void;
  onReloadLatest: () => void;
  onSave: () => void;
};

const screenReaderInstructions = {
  draggable:
    "並べ替えるにはスペースキーを押します。上下の矢印キーで移動し、もう一度スペースキーを押して確定します。エスケープキーで取り消します。",
};

export function StaffOrderEditorView({
  people,
  canWrite,
  writeDisabledReason,
  isDirty,
  isSaving,
  hasServerConflict,
  filteredShopName,
  onOrderChange,
  onReloadLatest,
  onSave,
}: Props) {
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const personNameById = useMemo<ReadonlyMap<string, string>>(
    () => new Map(people.map((person) => [String(person.personId), person.name])),
    [people],
  );
  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => `${personNameById.get(String(active.id)) ?? "スタッフ"}の移動を開始しました。`,
      onDragOver: ({ active, over }) => {
        if (!over) return "移動先がありません。";
        const overIndex = people.findIndex((person) => person.personId === String(over.id));
        return `${personNameById.get(String(active.id)) ?? "スタッフ"}を${overIndex + 1}番目へ移動します。`;
      },
      onDragEnd: ({ active, over }) => {
        if (!over) return "並べ替えを取り消しました。";
        const overIndex = people.findIndex((person) => person.personId === String(over.id));
        return `${personNameById.get(String(active.id)) ?? "スタッフ"}を${overIndex + 1}番目へ移動しました。`;
      },
      onDragCancel: ({ active }) =>
        `${personNameById.get(String(active.id)) ?? "スタッフ"}の並べ替えを取り消しました。`,
    }),
    [people, personNameById],
  );

  const movePerson = (personId: string, nextIndex: number, announce = true) => {
    const currentIndex = people.findIndex((person) => person.personId === personId);
    if (currentIndex < 0) return;
    const boundedIndex = Math.max(0, Math.min(nextIndex, people.length - 1));
    if (currentIndex === boundedIndex) return;
    const targetPerson = people[boundedIndex];
    if (!targetPerson) return;
    const nextPeople = reorderStaffOrderPeople(people, personId, targetPerson.personId);
    onOrderChange(nextPeople);
    if (announce) {
      setMoveAnnouncement(`${people[currentIndex]?.name ?? "スタッフ"}を${boundedIndex + 1}番目へ移動しました。`);
    }
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActivePersonId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActivePersonId(null);
    if (!over || active.id === over.id) return;
    const overIndex = people.findIndex((person) => person.personId === String(over.id));
    if (overIndex >= 0) movePerson(String(active.id), overIndex, false);
  };

  const activePerson = people.find((person) => person.personId === activePersonId);

  return (
    <Stack as="main" gap={{ base: 5, md: 6 }}>
      <HStack gap={2.5} color="gray.900">
        <LuListOrdered size={24} aria-hidden />
        <Text as="h2" textStyle="sectionTitle">
          表示する順番
        </Text>
      </HStack>

      <Stack gap={2}>
        <Text color="fg.muted" lineHeight="tall">
          ここで決めた順番は組織全体で共通です。各店舗の一覧には、所属するスタッフだけがこの順番で表示されます。
        </Text>
        {filteredShopName && (
          <Alert.Root status="info" borderRadius="xl" alignItems="flex-start">
            <Alert.Indicator mt={1} />
            <Alert.Content>
              <Alert.Title>{filteredShopName}で絞り込んだ一覧から開いています</Alert.Title>
              <Alert.Description>並び替えの対象は、この店舗だけでなく組織の全スタッフです。</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        {hasServerConflict && (
          <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
            <Alert.Indicator mt={1} />
            <Alert.Content gap={3}>
              <Box>
                <Alert.Title>スタッフ情報が更新されました</Alert.Title>
                <Alert.Description>
                  編集中の並び順は保持しています。最新の内容を読み込むと、編集中の並び順は破棄されます。
                </Alert.Description>
              </Box>
              <Button
                alignSelf="flex-start"
                variant="outline"
                colorPalette="gray"
                size="sm"
                onClick={onReloadLatest}
                disabled={isSaving}
                gap={1.5}
              >
                <LuRefreshCw aria-hidden />
                最新の内容を読み込む
              </Button>
            </Alert.Content>
          </Alert.Root>
        )}
        {!canWrite && writeDisabledReason && (
          <Alert.Root status="warning" borderRadius="xl" alignItems="flex-start">
            <Alert.Indicator mt={1} />
            <Alert.Content>
              <Alert.Title>並び順は変更できません</Alert.Title>
              <Alert.Description>{writeDisabledReason}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
      </Stack>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        accessibility={{ announcements, screenReaderInstructions }}
        onDragStart={handleDragStart}
        onDragCancel={() => setActivePersonId(null)}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={people.map((person) => person.personId)} strategy={verticalListSortingStrategy}>
          <Stack as="ol" aria-label="スタッフの並び順" gap={2} listStyleType="none" m={0} p={0}>
            {people.map((person, index) => (
              <SortableStaffOrderRow
                key={person.personId}
                person={person}
                index={index}
                itemCount={people.length}
                disabled={!canWrite || isSaving}
                onMove={(nextIndex) => movePerson(person.personId, nextIndex)}
              />
            ))}
          </Stack>
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

      <VisuallyHidden aria-live="polite">{moveAnnouncement}</VisuallyHidden>

      <Flex justify="flex-end" pt={1}>
        <Button
          colorPalette="teal"
          size="lg"
          minW={{ base: "full", sm: "176px" }}
          onClick={onSave}
          disabled={!canWrite || !isDirty || isSaving || hasServerConflict}
          loading={isSaving}
          loadingText="保存中"
          gap={2}
        >
          <LuSave aria-hidden />
          並び順を保存
        </Button>
      </Flex>
    </Stack>
  );
}

function SortableStaffOrderRow({
  person,
  index,
  itemCount,
  disabled,
  onMove,
}: {
  person: StaffOrderPerson;
  index: number;
  itemCount: number;
  disabled: boolean;
  onMove: (nextIndex: number) => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: person.personId,
    disabled,
  });
  const detail = [person.email, person.shopNames.length > 0 ? person.shopNames.join(" / ") : "所属店舗なし"]
    .filter(Boolean)
    .join("、");

  return (
    <Flex
      ref={setNodeRef}
      as="li"
      position="relative"
      zIndex={isDragging ? 1 : undefined}
      opacity={isDragging ? 0.35 : 1}
      transform={CSS.Transform.toString(transform)}
      transition={transition}
      align="center"
      gap={{ base: 2, sm: 3 }}
      bg="white"
      borderWidth="1px"
      borderColor="blackAlpha.100"
      borderRadius="xl"
      boxShadow="xs"
      px={{ base: 2, sm: 3 }}
      py={2.5}
      minH="68px"
    >
      <Flex
        boxSize="32px"
        flexShrink={0}
        align="center"
        justify="center"
        borderRadius="full"
        bg="gray.100"
        color="gray.700"
        fontSize="sm"
        fontWeight="bold"
        aria-hidden
      >
        {index + 1}
      </Flex>

      <Stack gap={0.5} minW={0} flex={1}>
        <Text fontWeight="semibold" color="gray.900" truncate>
          {person.name}
        </Text>
        {person.email && (
          <Text fontSize="xs" color="fg.muted" truncate>
            {person.email}
          </Text>
        )}
        <HStack gap={1} minW={0} color="fg.muted">
          <LuStore aria-hidden />
          <Text fontSize="xs" truncate>
            {person.shopNames.length > 0 ? person.shopNames.join(" / ") : "所属店舗なし"}
          </Text>
        </HStack>
      </Stack>

      <HStack gap={1} flexShrink={0}>
        <IconButton
          ref={setActivatorNodeRef}
          aria-label={`${person.name}をドラッグして並べ替え。現在${index + 1}番目。${detail}`}
          variant="ghost"
          colorPalette="gray"
          minW="44px"
          minH="44px"
          touchAction="none"
          cursor={disabled ? "not-allowed" : isDragging ? "grabbing" : "grab"}
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <LuGripVertical size={20} aria-hidden />
        </IconButton>
        <StaffOrderMoveMenu
          personName={person.name}
          index={index}
          itemCount={itemCount}
          disabled={disabled}
          onMove={onMove}
        />
      </HStack>
    </Flex>
  );
}

function StaffOrderMoveMenu({
  personName,
  index,
  itemCount,
  disabled,
  onMove,
}: {
  personName: string;
  index: number;
  itemCount: number;
  disabled: boolean;
  onMove: (nextIndex: number) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const actions = [
    { label: "1つ上へ", icon: LuArrowUp, nextIndex: index - 1, unavailable: index === 0 },
    { label: "1つ下へ", icon: LuArrowDown, nextIndex: index + 1, unavailable: index === itemCount - 1 },
    { label: "先頭へ", icon: LuChevronsUp, nextIndex: 0, unavailable: index === 0 },
    { label: "最後へ", icon: LuChevronsDown, nextIndex: itemCount - 1, unavailable: index === itemCount - 1 },
  ];

  return (
    <Menu.Root positioning={{ placement: "bottom-end" }}>
      <Menu.Trigger asChild>
        <IconButton
          ref={triggerRef}
          aria-label={`${personName}の並び替えメニュー`}
          variant="ghost"
          colorPalette="gray"
          minW="44px"
          minH="44px"
          disabled={disabled}
        >
          <LuEllipsis size={20} aria-hidden />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="180px">
            {actions.map((action) => (
              <Menu.Item
                key={action.label}
                value={action.label}
                disabled={action.unavailable}
                cursor={action.unavailable ? "not-allowed" : "pointer"}
                onSelect={
                  action.unavailable
                    ? undefined
                    : () => {
                        onMove(action.nextIndex);
                        requestAnimationFrame(() => triggerRef.current?.focus());
                      }
                }
              >
                <action.icon aria-hidden />
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

export function StaffOrderEditorStateView({
  state,
}: {
  state: { kind: "empty" } | { kind: "unavailable"; availability: Exclude<StaffOrderAvailability, "ready"> };
}) {
  if (state.kind === "empty") {
    return (
      <Stack as="main">
        <Empty
          icon={LuUsers}
          title="並び替えるスタッフがいません"
          description="スタッフを追加すると、ここで表示順を変更できます。"
          minH="360px"
          variant="section"
        />
      </Stack>
    );
  }

  const presentation = {
    tooManyPeople: {
      title: "スタッフが多いため並び替えできません",
      description: "安全に並び順を保存できる人数を超えています。スタッフ構成をご確認ください。",
    },
    tooManyActiveShops: {
      title: "利用中の店舗が多いため並び替えできません",
      description: "安全に各店舗へ並び順を反映できる店舗数を超えています。店舗構成をご確認ください。",
    },
    legacyDataIncomplete: {
      title: "スタッフ情報を確認してください",
      description: "店舗との紐付けが完了していないスタッフがいるため、現在は並び順を変更できません。",
    },
  }[state.availability];

  return (
    <Stack as="main">
      <Empty
        icon={LuUsers}
        title={presentation.title}
        description={presentation.description}
        minH="360px"
        tone="danger"
      />
    </Stack>
  );
}
