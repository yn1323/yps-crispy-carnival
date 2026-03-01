import { Box, Field, Flex, Icon, IconButton, Input, Text } from "@chakra-ui/react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { LuCheck, LuGripVertical, LuPencil, LuTrash2, LuX } from "react-icons/lu";
import { POSITION_NAME_MAX_LENGTH } from "@/src/constants/validations";

export type SortablePositionItemProps = {
  id: string;
  name: string;
  isEditing: boolean;
  editingName: string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onDeleteClick: () => void;
  editError: string | null;
  disabled?: boolean;
  isUpdating?: boolean;
  /** 通常表示時の名前の前に表示（カラードット等） */
  namePrefix?: ReactNode;
  /** 編集モード時に追加表示（カラーピッカー等） */
  editExtra?: ReactNode;
};

export const SortablePositionItem = ({
  id,
  name,
  isEditing,
  editingName,
  onEditStart,
  onEditCancel,
  onEditChange,
  onEditSave,
  onDeleteClick,
  editError,
  disabled,
  isUpdating,
  namePrefix,
  editExtra,
}: SortablePositionItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
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
          <Flex flex={1} gap={2} align="flex-start" direction="column">
            <Flex gap={2} w="full" align="center">
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
            {editExtra}
            {editError && (
              <Text fontSize="xs" color="red.500">
                {editError}
              </Text>
            )}
          </Flex>
        ) : (
          <>
            {namePrefix}
            <Text flex={1} fontWeight="medium" color="gray.700">
              {name}
            </Text>
            <Flex gap={1}>
              <IconButton
                aria-label="ポジションを編集"
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
