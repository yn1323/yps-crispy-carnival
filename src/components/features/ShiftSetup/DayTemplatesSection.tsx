import { Badge, Box, chakra, Flex, HStack, Text } from "@chakra-ui/react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef } from "react";
import { LuGripVertical, LuPlus, LuSparkles, LuUsers } from "react-icons/lu";
import { SHIFT_DAY_TEMPLATE_LIMIT } from "@/convex/constants";
import { Button } from "@/src/components/ui/Button";
import { Empty } from "@/src/components/ui/Empty";
import { isPositionsUnsplit } from "@/src/domains/shift/operations";
import { DayTemplateEditor } from "./DayTemplateEditor";
import { formatDayTemplateUsage, getDayTemplateLabel, needsDayTemplateReentry } from "./dayTemplateDrafts";
import { SetupLockedNote, SetupSection } from "./parts";
import type { DayTemplateDraft, ShiftSetupData, ShiftSetupEditorView, ShiftSetupIntents } from "./types";

/** スマートフォンで押しやすい高さを確保する、ページ上の主なボタンの高さ。 */
const MOBILE_TAP_HEIGHT = { base: "44px", md: "40px" };
const SECTION_DESCRIPTION = "時間帯ごとの必要な人員配置を設定し、シフト作成時のテンプレートとします。";

type Props = {
  setup: ShiftSetupData;
  canWrite: boolean;
  /** 保存の応答を待っている間。テンプレートを操作できない状態にする。 */
  isSaving: boolean;
  dayTemplates: ShiftSetupEditorView["dayTemplates"];
  intents: ShiftSetupIntents;
  onOpenAssist: () => void;
};

export function DayTemplatesSection({ setup, canWrite, isSaving, dayTemplates, intents, onOpenAssist }: Props) {
  const { drafts, selectedRowKey, issueMessages, canAdd } = dayTemplates;
  const canUseAssist = setup.assistAvailable && canWrite;
  const selectedDraft = drafts.find((draft) => draft.rowKey === selectedRowKey);

  const nameInputRef = useRef<HTMLInputElement>(null);
  // テンプレートを足す直前に編集していたテンプレート。undefinedは、足す操作をしていないことを表す。
  const selectedBeforeAddRef = useRef<string | null | undefined>(undefined);
  const addDayTemplate = () => {
    if (!canWrite || !canAdd) return;
    selectedBeforeAddRef.current = selectedRowKey;
    intents.onAddDayTemplate();
  };
  useEffect(() => {
    // 足したテンプレートへ切り替わったときだけ、名前の欄へ移る。
    if (selectedBeforeAddRef.current === undefined || selectedBeforeAddRef.current === selectedRowKey) return;
    selectedBeforeAddRef.current = undefined;
    const input = nameInputRef.current;
    if (!input) return;
    // 足したテンプレートの先頭が見える位置へ送り、名前をそのまま打ち替えられるようにする。
    input.scrollIntoView({ block: "nearest" });
    input.focus({ preventScroll: true });
  }, [selectedRowKey]);

  const assistButton = (variant: "ghost" | "outline") => (
    <Button
      type="button"
      variant={variant}
      colorPalette={variant === "ghost" ? "teal" : undefined}
      bg={variant === "outline" ? "white" : undefined}
      size={variant === "ghost" ? "sm" : "md"}
      minH={variant === "outline" ? MOBILE_TAP_HEIGHT : undefined}
      gap={1.5}
      fontWeight="semibold"
      flexShrink={0}
      onClick={onOpenAssist}
    >
      <LuSparkles aria-hidden />
      AIで下書きを作る
    </Button>
  );

  // 必要人数はポジションごとに決めるため、ポジションを追加するまでは中身を見せない。
  if (isPositionsUnsplit(setup.positions)) {
    return (
      <SetupSection
        headingId="shift-setup-day-templates-heading"
        title="必要人数"
        step={2}
        description={SECTION_DESCRIPTION}
        isBusy={isSaving}
      >
        <SetupLockedNote>ポジションを追加すると、必要人数を設定できます</SetupLockedNote>
      </SetupSection>
    );
  }

  return (
    <SetupSection
      headingId="shift-setup-day-templates-heading"
      title="必要人数"
      step={2}
      description={SECTION_DESCRIPTION}
      isBusy={isSaving}
      action={drafts.length > 0 && canUseAssist ? assistButton("ghost") : undefined}
    >
      {!selectedDraft ? (
        <Empty
          icon={LuUsers}
          title="必要人数を設定しましょう"
          titleAs="h3"
          description={canWrite ? "必要人数のテンプレートを曜日ごとに作ります。" : undefined}
          variant="section"
          bg="white"
          py={8}
          action={
            canWrite ? (
              <Flex gap={2} wrap="wrap" justify="center">
                <Button type="button" colorPalette="teal" minH={MOBILE_TAP_HEIGHT} onClick={addDayTemplate}>
                  <LuPlus aria-hidden />
                  テンプレートを作る
                </Button>
                {canUseAssist && assistButton("outline")}
              </Flex>
            ) : undefined
          }
        />
      ) : (
        <Box borderWidth="1px" borderColor="blackAlpha.100" borderRadius="xl" bg="white">
          <DayTemplateTabs
            drafts={drafts}
            selectedRowKey={selectedDraft.rowKey}
            issueMessages={issueMessages}
            canWrite={canWrite}
            canAdd={canAdd}
            onSelect={intents.onSelectDayTemplate}
            onReorder={intents.onReorderDayTemplates}
            onAdd={addDayTemplate}
          />
          <DayTemplateEditor
            // テンプレートを切り替えたら、開いていた確認とコピー元の選択を持ち越さない。
            key={selectedDraft.rowKey}
            draft={selectedDraft}
            drafts={drafts}
            setup={setup}
            canWrite={canWrite}
            issueMessage={issueMessages[selectedDraft.rowKey]}
            intents={intents}
            nameInputRef={nameInputRef}
          />
        </Box>
      )}
    </SetupSection>
  );
}

type TabsProps = {
  drafts: readonly DayTemplateDraft[];
  selectedRowKey: string;
  issueMessages: Readonly<Record<string, string>>;
  canWrite: boolean;
  canAdd: boolean;
  onSelect: (rowKey: string) => void;
  onReorder: (activeRowKey: string, overRowKey: string) => void;
  onAdd: () => void;
};

/**
 * 編集するテンプレートを選ぶ。カードの上に、名前と使う日を横に並べ、最後にテンプレートを足すボタンを置く。
 * PCでもスマートフォンでも同じ並びにし、1行に収まらない件数は折り返す。
 */
function DayTemplateTabs({
  drafts,
  selectedRowKey,
  issueMessages,
  canWrite,
  canAdd,
  onSelect,
  onReorder,
  onAdd,
}: TabsProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // 1件だけのときと閲覧専用では、並べ替えられない。
  const canReorder = canWrite && drafts.length > 1;
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  };

  return (
    <Box px={{ base: 3, md: 5 }} py={{ base: 3, md: 4 }} borderBottomWidth="1px" borderColor="blackAlpha.100" minW={0}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={drafts.map((draft) => draft.rowKey)} strategy={rectSortingStrategy}>
          <Flex as="ul" aria-label="テンプレートの一覧" listStyleType="none" wrap="wrap" gap={2} minW={0}>
            {drafts.map((draft, index) => (
              <SortableDayTemplateItem
                key={draft.rowKey}
                rowKey={draft.rowKey}
                disabled={!canReorder}
                isSelected={draft.rowKey === selectedRowKey}
                handleLabel={`${getDayTemplateLabel(draft)}をドラッグして並べ替え。現在${index + 1}番目。`}
              >
                <DayTemplateTab
                  draft={draft}
                  isSelected={draft.rowKey === selectedRowKey}
                  hasIssue={issueMessages[draft.rowKey] !== undefined}
                  onSelect={() => onSelect(draft.rowKey)}
                />
              </SortableDayTemplateItem>
            ))}
            <Box as="li" display="flex">
              <Button
                type="button"
                variant="outline"
                bg="white"
                size="sm"
                h="auto"
                minH={TAB_MIN_HEIGHT}
                borderStyle="dashed"
                disabled={!canWrite || !canAdd}
                onClick={onAdd}
              >
                <LuPlus aria-hidden />
                テンプレートを追加
              </Button>
            </Box>
          </Flex>
        </SortableContext>
      </DndContext>
      {!canAdd && (
        <Text mt={2} fontSize="xs" color="fg.muted">
          テンプレートは{SHIFT_DAY_TEMPLATE_LIMIT}件まで作れます
        </Text>
      )}
    </Box>
  );
}

/** 名前と使う日の2行が入り、指でも押せる高さ。 */
const TAB_MIN_HEIGHT = "52px";

type SortableItemProps = {
  rowKey: string;
  disabled: boolean;
  isSelected: boolean;
  /** つかむ場所の読み上げ名。 */
  handleLabel: string;
  children: React.ReactNode;
};

/** ドラッグ＆ドロップで並べ替えられる、テンプレートの1件。左上の小さいアイコンをつかんで動かす。 */
function SortableDayTemplateItem({ rowKey, disabled, isSelected, handleLabel, children }: SortableItemProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowKey,
    disabled,
  });

  return (
    <Box
      ref={setNodeRef}
      as="li"
      position="relative"
      display="flex"
      minW={0}
      maxW="100%"
      zIndex={isDragging ? 1 : undefined}
      opacity={isDragging ? 0.6 : 1}
      transform={CSS.Transform.toString(transform)}
      transition={transition}
    >
      {children}
      {!disabled && (
        <chakra.button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          type="button"
          aria-label={handleLabel}
          position="absolute"
          top="2px"
          left="2px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          boxSize="18px"
          borderRadius="sm"
          color={isSelected ? "whiteAlpha.800" : "gray.400"}
          touchAction="none"
          cursor={isDragging ? "grabbing" : "grab"}
          _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "1px" }}
        >
          <LuGripVertical size={12} aria-hidden />
        </chakra.button>
      )}
    </Box>
  );
}

type TabProps = {
  draft: DayTemplateDraft;
  isSelected: boolean;
  hasIssue: boolean;
  onSelect: () => void;
};

function DayTemplateTab({ draft, isSelected, hasIssue, onSelect }: TabProps) {
  const label = getDayTemplateLabel(draft);
  const usage = formatDayTemplateUsage(draft);
  const status = hasIssue ? "要確認" : needsDayTemplateReentry(draft) ? "再設定" : undefined;

  return (
    <chakra.button
      type="button"
      aria-label={[label, usage, ...(status ? [status] : [])].join(" ")}
      aria-current={isSelected ? "true" : undefined}
      display="flex"
      flexDirection="column"
      alignItems="stretch"
      justifyContent="center"
      gap={0.5}
      minW="5.5rem"
      maxW="100%"
      minH={TAB_MIN_HEIGHT}
      // 左上のつかむアイコンに名前が重ならないよう、左を少し広く取る。
      ps={5}
      pe={3}
      py={2}
      textAlign="start"
      borderWidth="1px"
      borderRadius="md"
      cursor="pointer"
      transitionProperty="background-color"
      transitionDuration="faster"
      _focusVisible={{ outline: "2px solid", outlineColor: "teal.700", outlineOffset: "2px" }}
      // 選んでいるテンプレートは、濃いtealの地と白い文字で示す。選んでいないテンプレートと、押している間の地色は中立にする。
      {...(isSelected
        ? { bg: "teal.600", borderColor: "teal.600", color: "white", _active: { bg: "teal.700" } }
        : {
            bg: "white",
            borderColor: "gray.300",
            color: "gray.900",
            _hover: { bg: "gray.50" },
            _active: { bg: "gray.200", transitionDuration: "0ms" },
          })}
      onClick={onSelect}
    >
      <HStack gap={2} minW={0}>
        <Text as="span" flex={1} minW={0} fontSize="sm" fontWeight="bold" truncate>
          {label}
        </Text>
        {status && (
          <Badge colorPalette="orange" size="sm" flexShrink={0}>
            {status}
          </Badge>
        )}
      </HStack>
      <Text as="span" fontSize="xs" color={isSelected ? "whiteAlpha.900" : "fg.muted"} truncate>
        {usage}
      </Text>
    </chakra.button>
  );
}
