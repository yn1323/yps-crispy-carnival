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
import { useState } from "react";
import { LuCheck, LuGripVertical, LuInfo, LuPencil, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import { POSITION_MAX_COUNT, POSITION_NAME_MAX_LENGTH } from "@/src/constants/validations";

export type LocalPosition = {
  id: string;
  name: string;
  order: number;
};

type PositionEditorProps = {
  positions: LocalPosition[];
  onChange: (positions: LocalPosition[]) => void;
  disabled?: boolean;
};

// 個別ポジションアイテム（ドラッグ可能）
type PositionItemProps = {
  position: LocalPosition;
  isEditing: boolean;
  editingName: string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onDeleteClick: () => void;
  editError: string | null;
  disabled?: boolean;
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
  editError,
  disabled,
}: PositionItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: position.id,
    disabled,
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
          cursor={disabled ? "not-allowed" : "grab"}
          color="gray.400"
          _hover={{ color: disabled ? "gray.400" : "gray.600" }}
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
              <IconButton aria-label="保存" size="sm" colorPalette="teal" onClick={onEditSave}>
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
                disabled={disabled}
              >
                <LuPencil />
              </IconButton>
              <IconButton
                aria-label="ポジションを削除"
                size="sm"
                variant="ghost"
                colorPalette="red"
                onClick={onDeleteClick}
                disabled={disabled}
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

// メインコンポーネント
export const PositionEditor = ({ positions, onChange, disabled }: PositionEditorProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newPositionName, setNewPositionName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const isMaxReached = positions.length >= POSITION_MAX_COUNT;

  // 追加処理
  const handleAdd = () => {
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

    const newPosition: LocalPosition = {
      id: crypto.randomUUID(),
      name: trimmedName,
      order: positions.length,
    };

    onChange([...positions, newPosition]);
    setNewPositionName("");
    setIsAdding(false);
    setAddError(null);
  };

  // 編集開始
  const handleEditStart = (position: LocalPosition) => {
    setEditingId(position.id);
    setEditingName(position.name);
    setEditError(null);
  };

  // 編集保存
  const handleEditSave = () => {
    if (!editingId) return;

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
    if (positions.some((p) => p.id !== editingId && p.name === trimmedName)) {
      setEditError("このポジション名は既に存在します");
      return;
    }

    onChange(positions.map((p) => (p.id === editingId ? { ...p, name: trimmedName } : p)));
    setEditingId(null);
    setEditingName("");
    setEditError(null);
  };

  // 編集キャンセル
  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName("");
    setEditError(null);
  };

  // 削除処理（新規作成時は確認なしで即削除）
  const handleDelete = (positionId: string) => {
    onChange(positions.filter((p) => p.id !== positionId));
  };

  // ドラッグ終了
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = positions.findIndex((p) => p.id === active.id);
      const newIndex = positions.findIndex((p) => p.id === over.id);
      const newPositions = arrayMove(positions, oldIndex, newIndex).map((p, index) => ({
        ...p,
        order: index,
      }));

      onChange(newPositions);
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
    <VStack align="stretch" gap={3}>
      {/* ポジション一覧 */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={positions.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <VStack align="stretch" gap={2}>
            {positions.map((position) => (
              <PositionItem
                key={position.id}
                position={position}
                isEditing={editingId === position.id}
                editingName={editingName}
                onEditStart={() => handleEditStart(position)}
                onEditCancel={handleEditCancel}
                onEditChange={setEditingName}
                onEditSave={handleEditSave}
                onDeleteClick={() => handleDelete(position.id)}
                editError={editingId === position.id ? editError : null}
                disabled={disabled}
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
              <Button size="sm" colorPalette="teal" onClick={handleAdd}>
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
          disabled={isMaxReached || disabled}
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
          <br />
          スタッフの熟練度を設定することで、シフト作成時の参考にします
        </Text>
      )}
    </VStack>
  );
};
