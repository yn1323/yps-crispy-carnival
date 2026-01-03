import { Box, Button, Field, Flex, Icon, IconButton, Input, Text, VStack } from "@chakra-ui/react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuCheck, LuGripVertical, LuInfo, LuPencil, LuPlus, LuTag, LuTrash2, LuX } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { FormCard } from "@/src/components/ui/FormCard";
import { toaster } from "@/src/components/ui/toaster";
import { POSITION_MAX_COUNT, POSITION_NAME_MAX_LENGTH } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";

type PositionType = {
  _id: Id<"shopPositions">;
  name: string;
  order: number;
};

type PositionManagerProps = {
  shopId: Id<"shops">;
  positions: PositionType[];
};

// 個別ポジションアイテム（ドラッグ可能）
type PositionItemProps = {
  position: PositionType;
  isEditing: boolean;
  editingName: string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onDeleteClick: () => void;
  isUpdating: boolean;
  editError: string | null;
};

const PositionItem = ({
  position,
  isEditing,
  editingName,
  onEditStart,
  onEditCancel,
  onEditChange,
  onEditSave,
  onDeleteClick,
  isUpdating,
  editError,
}: PositionItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: position._id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onEditSave();
    } else if (e.key === "Escape") {
      onEditCancel();
    }
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      bg="gray.50"
      borderRadius="lg"
      p={3}
      _hover={{ bg: "gray.100" }}
      transition="all 0.15s"
      boxShadow={isDragging ? "lg" : "none"}
    >
      <Flex align="center" gap={3}>
        {/* ドラッグハンドル */}
        <Box
          {...attributes}
          {...listeners}
          cursor="grab"
          color="gray.400"
          _hover={{ color: "gray.600" }}
          aria-label="並び替え"
          flexShrink={0}
        >
          <Icon as={LuGripVertical} boxSize={5} />
        </Box>

        {isEditing ? (
          // 編集モード
          <Flex flex={1} gap={2} align="flex-start" direction="column">
            <Flex gap={2} w="full">
              <Field.Root invalid={!!editError} flex={1}>
                <Input
                  value={editingName}
                  onChange={(e) => onEditChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={POSITION_NAME_MAX_LENGTH}
                  size="sm"
                  autoFocus
                  aria-invalid={!!editError}
                />
              </Field.Root>
              <IconButton aria-label="保存" size="sm" colorPalette="teal" onClick={onEditSave} loading={isUpdating}>
                <LuCheck />
              </IconButton>
              <IconButton aria-label="キャンセル" size="sm" variant="ghost" onClick={onEditCancel}>
                <LuX />
              </IconButton>
            </Flex>
            {editError && (
              <Text fontSize="xs" color="red.500">
                {editError}
              </Text>
            )}
          </Flex>
        ) : (
          // 通常表示
          <>
            <Text flex={1} fontWeight="medium" color="gray.700">
              {position.name}
            </Text>
            <Flex gap={1}>
              <IconButton
                aria-label="ポジション名を編集"
                size="sm"
                variant="ghost"
                colorPalette="gray"
                onClick={onEditStart}
              >
                <LuPencil />
              </IconButton>
              <IconButton
                aria-label="ポジションを削除"
                size="sm"
                variant="ghost"
                colorPalette="red"
                onClick={onDeleteClick}
              >
                <LuTrash2 />
              </IconButton>
            </Flex>
          </>
        )}
      </Flex>
    </Box>
  );
};

// 削除確認ダイアログ
type DeleteDialogProps = {
  positionName: string;
  positionId: Id<"shopPositions"> | null;
  isOpen: boolean;
  onOpenChange: (details: { open: boolean }) => void;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
};

const DeleteDialog = ({ positionName, isOpen, onOpenChange, onClose, onConfirm, isDeleting }: DeleteDialogProps) => {
  return (
    <Dialog
      title="ポジションを削除"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      onClose={onClose}
      onSubmit={onConfirm}
      submitLabel="削除する"
      submitColorPalette="red"
      isLoading={isDeleting}
      role="alertdialog"
    >
      <VStack align="stretch" gap={4}>
        <Text>「{positionName}」を削除しますか？</Text>
      </VStack>
    </Dialog>
  );
};

// メインコンポーネント
export const PositionManager = ({ shopId, positions: initialPositions }: PositionManagerProps) => {
  const user = useAtomValue(userAtom);
  const [positions, setPositions] = useState(initialPositions);
  const [isAdding, setIsAdding] = useState(false);
  const [newPositionName, setNewPositionName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<Id<"shopPositions"> | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<Id<"shopPositions"> | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");

  const deleteDialog = useDialog();

  // Mutations
  const createPosition = useMutation(api.position.mutations.create);
  const updatePositionName = useMutation(api.position.mutations.updateName);
  const removePosition = useMutation(api.position.mutations.remove);
  const updatePositionOrder = useMutation(api.position.mutations.updateOrder);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const isMaxReached = positions.length >= POSITION_MAX_COUNT;

  // 追加処理
  const handleAdd = async () => {
    if (!user.authId) return;

    const trimmedName = newPositionName.trim();
    if (!trimmedName) {
      setAddError("ポジション名を入力してください");
      return;
    }

    if (trimmedName.length > POSITION_NAME_MAX_LENGTH) {
      setAddError(`${POSITION_NAME_MAX_LENGTH}文字以内で入力してください`);
      return;
    }

    // 重複チェック（ローカル）
    if (positions.some((p) => p.name === trimmedName)) {
      setAddError("このポジション名は既に存在します");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createPosition({
        shopId,
        name: trimmedName,
        authId: user.authId,
      });

      if (result.positionId) {
        setPositions([
          ...positions,
          {
            _id: result.positionId,
            name: trimmedName,
            order: positions.length,
          },
        ]);
      }

      setNewPositionName("");
      setIsAdding(false);
      setAddError(null);
      toaster.success({ title: "ポジションを追加しました" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ポジションの追加に失敗しました";
      setAddError(message);
    } finally {
      setIsCreating(false);
    }
  };

  // 編集開始
  const handleEditStart = (position: PositionType) => {
    setEditingId(position._id);
    setEditingName(position.name);
    setEditError(null);
  };

  // 編集保存
  const handleEditSave = async () => {
    if (!user.authId || !editingId) return;

    const trimmedName = editingName.trim();
    if (!trimmedName) {
      setEditError("ポジション名を入力してください");
      return;
    }

    if (trimmedName.length > POSITION_NAME_MAX_LENGTH) {
      setEditError(`${POSITION_NAME_MAX_LENGTH}文字以内で入力してください`);
      return;
    }

    // 重複チェック（ローカル、自分以外）
    if (positions.some((p) => p._id !== editingId && p.name === trimmedName)) {
      setEditError("このポジション名は既に存在します");
      return;
    }

    setIsUpdating(true);
    try {
      await updatePositionName({
        positionId: editingId,
        name: trimmedName,
        authId: user.authId,
      });

      setPositions(positions.map((p) => (p._id === editingId ? { ...p, name: trimmedName } : p)));
      setEditingId(null);
      setEditingName("");
      setEditError(null);
      toaster.success({ title: "ポジション名を更新しました" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ポジション名の更新に失敗しました";
      setEditError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  // 編集キャンセル
  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName("");
    setEditError(null);
  };

  // 削除クリック
  const handleDeleteClick = (position: PositionType) => {
    setDeleteTargetId(position._id);
    setDeleteTargetName(position.name);
    deleteDialog.open();
  };

  // 削除確定
  const handleDeleteConfirm = async () => {
    if (!user.authId || !deleteTargetId) return;

    setIsDeleting(true);
    try {
      await removePosition({
        positionId: deleteTargetId,
        authId: user.authId,
      });

      setPositions(positions.filter((p) => p._id !== deleteTargetId));
      deleteDialog.close();
      setDeleteTargetId(null);
      setDeleteTargetName("");
      toaster.success({ title: "ポジションを削除しました" });
    } catch (error) {
      toaster.error({
        title: "ポジションの削除に失敗しました",
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // ドラッグ終了
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = positions.findIndex((p) => p._id === active.id);
      const newIndex = positions.findIndex((p) => p._id === over.id);
      const newPositions = arrayMove(positions, oldIndex, newIndex);

      setPositions(newPositions);

      if (user.authId) {
        try {
          await updatePositionOrder({
            positionIds: newPositions.map((p) => p._id),
            authId: user.authId,
          });
        } catch {
          // エラー時は元に戻す
          setPositions(positions);
          toaster.error({ title: "並び順の更新に失敗しました" });
        }
      }
    }
  };

  // 追加フォームのキーダウン
  const handleAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleAdd();
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setNewPositionName("");
      setAddError(null);
    }
  };

  return (
    <>
      <FormCard
        icon={LuTag}
        title="ポジション"
        rightElement={
          <Text fontSize="sm" color="gray.500">
            {positions.length} / {POSITION_MAX_COUNT} 件
          </Text>
        }
      >
        <VStack align="stretch" gap={3}>
          {/* ポジション一覧 */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={positions.map((p) => p._id)} strategy={verticalListSortingStrategy}>
              <VStack align="stretch" gap={2}>
                {positions.map((position) => (
                  <PositionItem
                    key={position._id}
                    position={position}
                    isEditing={editingId === position._id}
                    editingName={editingName}
                    onEditStart={() => handleEditStart(position)}
                    onEditCancel={handleEditCancel}
                    onEditChange={setEditingName}
                    onEditSave={handleEditSave}
                    onDeleteClick={() => handleDeleteClick(position)}
                    isUpdating={isUpdating}
                    editError={editingId === position._id ? editError : null}
                  />
                ))}
              </VStack>
            </SortableContext>
          </DndContext>

          {/* 追加フォーム */}
          {isAdding ? (
            <Box bg="gray.50" borderRadius="lg" p={3}>
              <Flex gap={2} align="flex-start" direction="column">
                <Flex gap={2} w="full">
                  <Field.Root invalid={!!addError} flex={1}>
                    <Input
                      value={newPositionName}
                      onChange={(e) => {
                        setNewPositionName(e.target.value);
                        setAddError(null);
                      }}
                      onKeyDown={handleAddKeyDown}
                      placeholder="新しいポジション名"
                      maxLength={POSITION_NAME_MAX_LENGTH}
                      size="sm"
                      autoFocus
                    />
                  </Field.Root>
                  <Button size="sm" colorPalette="teal" onClick={handleAdd} loading={isCreating}>
                    追加
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setIsAdding(false);
                      setNewPositionName("");
                      setAddError(null);
                    }}
                  >
                    キャンセル
                  </Button>
                </Flex>
                {addError && (
                  <Text fontSize="xs" color="red.500">
                    {addError}
                  </Text>
                )}
              </Flex>
            </Box>
          ) : (
            <Button
              variant="ghost"
              colorPalette="teal"
              size="sm"
              onClick={() => setIsAdding(true)}
              disabled={isMaxReached}
              gap={2}
            >
              <Icon as={LuPlus} />
              ポジションを追加
            </Button>
          )}

          {/* 最大件数到達メッセージ */}
          {isMaxReached && (
            <Flex align="center" gap={2} p={3} bg="blue.50" borderRadius="md">
              <Icon as={LuInfo} color="blue.600" />
              <Text fontSize="sm" color="blue.700">
                ポジションは最大{POSITION_MAX_COUNT}件まで登録できます
              </Text>
            </Flex>
          )}

          {/* ヒント */}
          {positions.length > 1 && !isMaxReached && (
            <Text fontSize="xs" color="gray.500">
              ドラッグで並び順を変更できます
            </Text>
          )}
        </VStack>
      </FormCard>

      {/* 削除確認ダイアログ */}
      <DeleteDialog
        positionName={deleteTargetName}
        positionId={deleteTargetId}
        isOpen={deleteDialog.isOpen}
        onOpenChange={deleteDialog.onOpenChange}
        onClose={deleteDialog.close}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </>
  );
};
