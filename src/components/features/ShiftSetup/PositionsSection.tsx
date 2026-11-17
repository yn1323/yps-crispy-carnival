import { chakra, Field, Flex, Grid, Stack, Text } from "@chakra-ui/react";
import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
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
import { type FormEvent, type ReactNode, useMemo, useRef, useState } from "react";
import { LuCheck, LuGripVertical, LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { POSITION_ACTIVE_LIMIT, POSITION_NAME_MAX_LENGTH } from "@/convex/constants";
import { Button, IconButton } from "@/src/components/ui/Button";
import { Dialog } from "@/src/components/ui/Dialog";
import { Input } from "@/src/components/ui/FormControls";
import { isPositionsUnsplit, isUnnamedDefaultPosition } from "@/src/domains/shift/operations";
import { PositionBadge, PositionDot, SetupCard, SetupLockedNote, SetupSection } from "./parts";
import {
  addPositionDraft,
  canAddPosition,
  findPositionDraftErrors,
  hasRenamedPosition,
  POSITION_COLOR_OPTIONS,
  type PositionDraft,
  reorderPositionDrafts,
  toPositionDrafts,
  toPositionInputs,
  toUnsplitPositionInputs,
} from "./script";
import type { DialogState, PositionInput, ShiftSetupPosition } from "./types";

const FORM_ID = "shift-setup-positions-form";
const ICON_BUTTON_SIZE = { base: "44px", md: "36px" };

type Props = {
  /** 編集中の値を反映したポジション。 */
  positions: readonly ShiftSetupPosition[];
  /** 最後に保存したポジション。 */
  savedPositions: readonly ShiftSetupPosition[];
  canWrite: boolean;
  /** 保存の応答を待っている間。ポジションを操作できない状態にする。 */
  isSaving: boolean;
  dialog: DialogState;
  /** Dialogで決めた一覧を、ページの編集中の値へ反映する。保存はページの「保存する」で行う。 */
  onApply: (positions: PositionInput[]) => void;
};

export function PositionsSection({ positions, savedPositions, canWrite, isSaving, dialog, onApply }: Props) {
  // ポジションをまだ追加していない店舗（名前を付けていない最初のポジションだけの店舗を含む）では、
  // 仮の名前を見せず、最初にポジションを追加するよう促す。
  const isUnsplit = isPositionsUnsplit(positions);

  return (
    <SetupSection
      headingId="shift-setup-positions-heading"
      title="ポジション"
      step={1}
      description="スタッフの担当領域を設定します。例）ホール、キッチンなど"
      isBusy={isSaving}
      action={
        // ポジションがまだない店舗では、同じ場所に、最初の操作として目立つ「追加する」を出す。開くDialogは同じ。
        isUnsplit ? (
          <Button
            type="button"
            colorPalette="teal"
            size="sm"
            gap={1.5}
            flexShrink={0}
            disabled={!canWrite}
            onClick={dialog.open}
          >
            <LuPlus aria-hidden />
            ポジションを追加する
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            colorPalette="teal"
            size="sm"
            gap={1.5}
            fontWeight="semibold"
            flexShrink={0}
            disabled={!canWrite}
            onClick={dialog.open}
          >
            <LuPencil aria-hidden />
            ポジションを編集する
          </Button>
        )
      }
    >
      {isUnsplit ? (
        <SetupLockedNote>ポジションが未設定です。ポジションを追加してください</SetupLockedNote>
      ) : (
        <SetupCard>
          <Flex as="ul" listStyleType="none" wrap="wrap" gap={2} px={{ base: 4, md: 5 }} py={4}>
            {positions.map((position) => (
              <chakra.li key={position._id} display="flex" minW={0}>
                <PositionBadge name={position.name} color={position.color} />
              </chakra.li>
            ))}
          </Flex>
        </SetupCard>
      )}

      <Dialog
        title="ポジションを編集"
        isOpen={dialog.isOpen && canWrite}
        onOpenChange={dialog.onOpenChange}
        onClose={dialog.close}
        formId={FORM_ID}
        submitLabel="決定する"
        mobileFullScreen
        maxW={{ md: "560px" }}
        maxH={{ md: "85dvh" }}
        bodyProps={{ px: { base: 4, lg: 6 }, pt: 2, pb: { base: 4, lg: 5 } }}
      >
        <PositionsForm
          key={dialog.isOpen ? "open" : "closed"}
          positions={positions}
          savedPositions={savedPositions}
          onSubmit={onApply}
        />
      </Dialog>
    </SetupSection>
  );
}

type FormProps = {
  positions: readonly ShiftSetupPosition[];
  savedPositions: readonly ShiftSetupPosition[];
  onSubmit: (positions: PositionInput[]) => void;
};

function PositionsForm({ positions, savedPositions, onSubmit }: FormProps) {
  const [drafts, setDrafts] = useState(() => toPositionDrafts(positions));
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [paletteRowKey, setPaletteRowKey] = useState<string | null>(null);
  const addedCountRef = useRef(0);
  const focusRowKeyRef = useRef<string | null>(null);

  const errors = hasSubmitted ? findPositionDraftErrors(drafts) : null;
  const isRenamed = hasRenamedPosition(savedPositions, drafts);
  // 名前を付けていない最初のポジションには、これまでの勤務がすべて入っている。
  const unnamedDefaultId = savedPositions.find(isUnnamedDefaultPosition)?._id;
  const canAdd = canAddPosition(drafts);

  const updateDraft = (rowKey: string, patch: Partial<PositionDraft>) =>
    setDrafts((current) => current.map((draft) => (draft.rowKey === rowKey ? { ...draft, ...patch } : draft)));

  const handleAdd = () => {
    addedCountRef.current += 1;
    const rowKey = `new-${addedCountRef.current}`;
    focusRowKeyRef.current = rowKey;
    setDrafts((current) => addPositionDraft(current, rowKey));
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const announcements = useMemo<Announcements>(() => {
    const orderOf = (rowKey: string | number) => drafts.findIndex((draft) => draft.rowKey === String(rowKey)) + 1;
    const labelOf = (rowKey: string | number) =>
      drafts.find((draft) => draft.rowKey === String(rowKey))?.name.trim() || `ポジション${orderOf(rowKey)}`;
    return {
      onDragStart: ({ active }) => `${labelOf(active.id)}の移動を開始しました。`,
      onDragOver: ({ active, over }) =>
        over ? `${labelOf(active.id)}を${orderOf(over.id)}番目へ移動します。` : "移動先がありません。",
      onDragEnd: ({ active, over }) =>
        over ? `${labelOf(active.id)}を${orderOf(over.id)}番目へ移動しました。` : "並べ替えを取り消しました。",
      onDragCancel: ({ active }) => `${labelOf(active.id)}の並べ替えを取り消しました。`,
    };
  }, [drafts]);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setDrafts((current) => reorderPositionDrafts(current, String(active.id), String(over.id)));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setHasSubmitted(true);
    if (findPositionDraftErrors(drafts)) return;
    // すべて削除した場合は、ポジションを追加していない状態へ戻す。
    onSubmit(drafts.length === 0 ? toUnsplitPositionInputs(savedPositions) : toPositionInputs(drafts));
  };

  return (
    <chakra.form id={FORM_ID} noValidate onSubmit={handleSubmit}>
      <Stack gap={4}>
        <Text fontSize="sm" color="fg.muted">
          左のアイコンをドラッグ＆ドロップで並び替えできます
        </Text>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          accessibility={{ announcements, screenReaderInstructions: SORT_INSTRUCTIONS }}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={drafts.map((draft) => draft.rowKey)} strategy={verticalListSortingStrategy}>
            <Stack as="ul" listStyleType="none" gap={0} divideY="1px" divideColor="blackAlpha.100">
              {drafts.map((draft, index) => {
                const label = draft.name.trim() || `ポジション${index + 1}`;
                // これまでの勤務が入っている、名前を付けていない最初のポジションの行。
                const isUnnamedDefaultRow = draft.id !== undefined && draft.id === unnamedDefaultId;
                const error = errors?.rows[draft.rowKey];
                const isPaletteOpen = paletteRowKey === draft.rowKey;
                const paletteId = `${FORM_ID}-palette-${draft.rowKey}`;

                return (
                  <SortablePositionItem
                    key={draft.rowKey}
                    rowKey={draft.rowKey}
                    // 1件だけのときは並べ替える相手がないため、つかめないようにする。
                    disabled={drafts.length < 2}
                    handleLabel={`${label}をドラッグして並べ替え。現在${index + 1}番目。`}
                  >
                    {(handle) => (
                      <>
                        <Grid templateColumns="auto auto minmax(0, 1fr) auto" gap={2} alignItems="center">
                          {handle}
                          <chakra.button
                            type="button"
                            aria-label={`${label}の色を変更`}
                            aria-expanded={isPaletteOpen}
                            aria-controls={paletteId}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            boxSize={ICON_BUTTON_SIZE}
                            borderWidth="1px"
                            borderColor="gray.300"
                            borderRadius="md"
                            bg="white"
                            cursor="pointer"
                            _hover={{ bg: "gray.50" }}
                            _active={{ bg: "gray.100" }}
                            _focusVisible={{ outline: "2px solid", outlineColor: "teal.600", outlineOffset: "2px" }}
                            onClick={() => setPaletteRowKey(isPaletteOpen ? null : draft.rowKey)}
                          >
                            <PositionDot color={draft.color} size="20px" />
                          </chakra.button>

                          <Field.Root invalid={!!error} minW={0}>
                            <Input
                              ref={(element) => {
                                if (element && focusRowKeyRef.current === draft.rowKey) {
                                  focusRowKeyRef.current = null;
                                  element.focus();
                                }
                              }}
                              aria-label={`ポジション${index + 1}の名前`}
                              value={draft.name}
                              maxLength={POSITION_NAME_MAX_LENGTH}
                              placeholder={isUnnamedDefaultRow ? "例：ホール" : "例：キッチン"}
                              bg="white"
                              onChange={(event) => updateDraft(draft.rowKey, { name: event.target.value })}
                            />
                          </Field.Root>

                          <IconButton
                            type="button"
                            aria-label={`${label}を削除`}
                            variant="ghost"
                            colorPalette="red"
                            color="red.600"
                            boxSize={ICON_BUTTON_SIZE}
                            onClick={() =>
                              setDrafts((current) => current.filter((item) => item.rowKey !== draft.rowKey))
                            }
                          >
                            <LuTrash2 aria-hidden />
                          </IconButton>
                        </Grid>

                        {isPaletteOpen && (
                          <Flex id={paletteId} role="group" aria-label={`${label}の色`} wrap="wrap" gap={1.5}>
                            {POSITION_COLOR_OPTIONS.map((option) => {
                              const isSelected = option.value === draft.color;
                              return (
                                <chakra.button
                                  key={option.value}
                                  type="button"
                                  aria-label={option.label}
                                  aria-pressed={isSelected}
                                  display="flex"
                                  alignItems="center"
                                  justifyContent="center"
                                  boxSize={ICON_BUTTON_SIZE}
                                  borderRadius="full"
                                  color="white"
                                  cursor="pointer"
                                  boxShadow={
                                    isSelected ? "0 0 0 2px white, 0 0 0 4px var(--chakra-colors-gray-800)" : undefined
                                  }
                                  _focusVisible={{
                                    outline: "2px solid",
                                    outlineColor: "teal.600",
                                    outlineOffset: "3px",
                                  }}
                                  style={{ background: option.value }}
                                  onClick={() => {
                                    updateDraft(draft.rowKey, { color: option.value });
                                    setPaletteRowKey(null);
                                  }}
                                >
                                  {isSelected && <LuCheck aria-hidden />}
                                </chakra.button>
                              );
                            })}
                          </Flex>
                        )}

                        {error && (
                          <Text role="alert" fontSize="xs" color="red.600">
                            {error}
                          </Text>
                        )}
                      </>
                    )}
                  </SortablePositionItem>
                );
              })}
            </Stack>
          </SortableContext>
        </DndContext>

        <Stack gap={1} align="flex-end">
          <Button
            type="button"
            variant="outline"
            bg="white"
            minH={{ base: "44px", md: "40px" }}
            disabled={!canAdd}
            onClick={handleAdd}
          >
            <LuPlus aria-hidden />
            ポジションを追加
          </Button>
          {!canAdd && (
            <Text fontSize="xs" color="fg.muted">
              ポジションは{POSITION_ACTIVE_LIMIT}件まで登録できます
            </Text>
          )}
        </Stack>

        {errors?.form && (
          <Text role="alert" fontSize="sm" color="red.600">
            {errors.form}
          </Text>
        )}

        {isRenamed && (
          <Text fontSize="sm" color="fg.muted" lineHeight="tall">
            名前の変更は、確定していないシフトから反映されます。
            <br />
            確定済みのシフトは、確定したときの名前のまま表示されます。
          </Text>
        )}
      </Stack>
    </chakra.form>
  );
}

const SORT_INSTRUCTIONS = {
  draggable:
    "並べ替えるにはスペースキーを押します。上下の矢印キーで移動し、もう一度スペースキーを押して確定します。エスケープキーで取り消します。",
};

const SORT_DISABLED_REASON = "2件以上あると並べ替えできます";

type SortablePositionItemProps = {
  rowKey: string;
  /** 並べ替えられないとき。つかむ場所を無効の見た目にする。 */
  disabled: boolean;
  /** つかむ場所の読み上げ名。 */
  handleLabel: string;
  /** 行の中身。つかむ場所のボタンを受け取り、行の先頭に置く。 */
  children: (handle: ReactNode) => ReactNode;
};

/** ドラッグ＆ドロップで並べ替えられる、ポジションの1行。つかむ場所は先頭のボタンだけにする。 */
function SortablePositionItem({ rowKey, disabled, handleLabel, children }: SortablePositionItemProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: rowKey,
    disabled,
  });

  const handle = (
    <IconButton
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      type="button"
      aria-label={disabled ? `${handleLabel} ${SORT_DISABLED_REASON}` : handleLabel}
      aria-disabled={disabled || undefined}
      title={disabled ? SORT_DISABLED_REASON : undefined}
      variant="ghost"
      colorPalette="gray"
      color="gray.500"
      boxSize={ICON_BUTTON_SIZE}
      touchAction="none"
      cursor={disabled ? "not-allowed" : isDragging ? "grabbing" : "grab"}
      opacity={disabled ? 0.4 : 1}
    >
      <LuGripVertical aria-hidden />
    </IconButton>
  );

  return (
    <Stack
      ref={setNodeRef}
      as="li"
      gap={2}
      py={3}
      position="relative"
      zIndex={isDragging ? 1 : undefined}
      bg="white"
      opacity={isDragging ? 0.6 : 1}
      transform={CSS.Transform.toString(transform)}
      transition={transition}
    >
      {children(handle)}
    </Stack>
  );
}
