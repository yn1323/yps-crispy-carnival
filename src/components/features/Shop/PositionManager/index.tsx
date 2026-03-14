import { Box, Flex, Icon, Text, VStack } from "@chakra-ui/react";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { useAtomValue } from "jotai";
import { useState } from "react";
import { LuInfo, LuTag } from "react-icons/lu";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { POSITION_COLORS } from "@/convex/constants";
import { ColorPicker } from "@/src/components/ui/ColorPicker";
import { Dialog, useDialog } from "@/src/components/ui/Dialog";
import { FormCard } from "@/src/components/ui/FormCard";
import { toaster } from "@/src/components/ui/toaster";
import { POSITION_MAX_COUNT } from "@/src/constants/validations";
import { userAtom } from "@/src/stores/user";
import { PositionAddForm } from "../Position/PositionAddForm";
import { SortablePositionItem } from "../Position/SortablePositionItem";
import { validatePositionName } from "../Position/validatePositionName";

type PositionType = {
  _id: Id<"shopPositions">;
  name: string;
  color?: string;
  order: number;
};

type PositionManagerProps = {
  shopId: Id<"shops">;
  positions: PositionType[];
};

export const PositionManager = ({ shopId, positions: initialPositions }: PositionManagerProps) => {
  const user = useAtomValue(userAtom);
  const [positions, setPositions] = useState(initialPositions);
  const [isAdding, setIsAdding] = useState(false);
  const [newPositionName, setNewPositionName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<Id<"shopPositions"> | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [editingColor, setEditingColor] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<Id<"shopPositions"> | null>(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");

  const deleteDialog = useDialog();

  const createPosition = useMutation(api.position.mutations.create);
  const updatePositionName = useMutation(api.position.mutations.updateName);
  const updatePositionColor = useMutation(api.position.mutations.updateColor);
  const removePosition = useMutation(api.position.mutations.remove);
  const updatePositionOrder = useMutation(api.position.mutations.updateOrder);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const isMaxReached = positions.length >= POSITION_MAX_COUNT;

  const handleAdd = async () => {
    if (!user.authId) return;

    const trimmedName = newPositionName.trim();
    const error = validatePositionName(
      trimmedName,
      positions.map((p) => p.name),
    );
    if (error) {
      setAddError(error);
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

  const handleEditStart = (position: PositionType) => {
    setEditingId(position._id);
    setEditingName(position.name);
    setEditingColor(position.color ?? POSITION_COLORS[position.order % POSITION_COLORS.length]);
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!user.authId || !editingId) return;

    const trimmedName = editingName.trim();
    const otherNames = positions.filter((p) => p._id !== editingId).map((p) => p.name);
    const error = validatePositionName(trimmedName, otherNames);
    if (error) {
      setEditError(error);
      return;
    }

    setIsUpdating(true);
    try {
      const currentPosition = positions.find((p) => p._id === editingId);
      await updatePositionName({
        positionId: editingId,
        name: trimmedName,
        authId: user.authId,
      });

      if (
        editingColor !==
        (currentPosition?.color ?? POSITION_COLORS[currentPosition?.order ?? 0 % POSITION_COLORS.length])
      ) {
        await updatePositionColor({
          positionId: editingId,
          color: editingColor,
          authId: user.authId,
        });
      }

      setPositions(positions.map((p) => (p._id === editingId ? { ...p, name: trimmedName, color: editingColor } : p)));
      setEditingId(null);
      setEditingName("");
      setEditingColor("");
      setEditError(null);
      toaster.success({ title: "ポジションを更新しました" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "ポジション名の更新に失敗しました";
      setEditError(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName("");
    setEditError(null);
  };

  const handleDeleteClick = (position: PositionType) => {
    setDeleteTargetId(position._id);
    setDeleteTargetName(position.name);
    deleteDialog.open();
  };

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
          setPositions(positions);
          toaster.error({ title: "並び順の更新に失敗しました" });
        }
      }
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={positions.map((p) => p._id)} strategy={verticalListSortingStrategy}>
              <VStack align="stretch" gap={2}>
                {positions.map((position) => (
                  <SortablePositionItem
                    key={position._id}
                    id={position._id}
                    name={position.name}
                    isEditing={editingId === position._id}
                    editingName={editingName}
                    onEditStart={() => handleEditStart(position)}
                    onEditCancel={handleEditCancel}
                    onEditChange={setEditingName}
                    onEditSave={handleEditSave}
                    onDeleteClick={() => handleDeleteClick(position)}
                    isUpdating={isUpdating}
                    editError={editingId === position._id ? editError : null}
                    namePrefix={
                      <Box
                        w={4}
                        h={4}
                        borderRadius="full"
                        bg={position.color ?? POSITION_COLORS[position.order % POSITION_COLORS.length]}
                        flexShrink={0}
                      />
                    }
                    editExtra={<ColorPicker value={editingColor} onChange={setEditingColor} />}
                  />
                ))}
              </VStack>
            </SortableContext>
          </DndContext>

          <PositionAddForm
            isAdding={isAdding}
            newPositionName={newPositionName}
            addError={addError}
            isMaxReached={isMaxReached}
            isCreating={isCreating}
            onAdd={handleAdd}
            onCancel={() => {
              setIsAdding(false);
              setNewPositionName("");
              setAddError(null);
            }}
            onChange={(value) => {
              setNewPositionName(value);
              setAddError(null);
            }}
            onStartAdding={() => setIsAdding(true)}
          />

          {isMaxReached && (
            <Flex align="center" gap={2} p={3} bg="blue.50" borderRadius="md">
              <Icon as={LuInfo} color="blue.600" />
              <Text fontSize="sm" color="blue.700">
                ポジションは最大{POSITION_MAX_COUNT}件まで登録できます
              </Text>
            </Flex>
          )}

          {positions.length > 1 && !isMaxReached && (
            <Text fontSize="xs" color="gray.500">
              ドラッグで並び順を変更できます
            </Text>
          )}
        </VStack>
      </FormCard>

      <Dialog
        title="ポジションを削除"
        isOpen={deleteDialog.isOpen}
        onOpenChange={deleteDialog.onOpenChange}
        onClose={deleteDialog.close}
        onSubmit={handleDeleteConfirm}
        submitLabel="削除する"
        submitColorPalette="red"
        isLoading={isDeleting}
        role="alertdialog"
      >
        <VStack align="stretch" gap={4}>
          <Text>「{deleteTargetName}」を削除しますか？</Text>
        </VStack>
      </Dialog>
    </>
  );
};
