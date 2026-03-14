import { Flex, Icon, Text, VStack } from "@chakra-ui/react";
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
import { useState } from "react";
import { LuInfo } from "react-icons/lu";
import { POSITION_MAX_COUNT } from "@/src/constants/validations";
import { PositionAddForm } from "../Position/PositionAddForm";
import { SortablePositionItem } from "../Position/SortablePositionItem";
import { validatePositionName } from "../Position/validatePositionName";

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

export const PositionEditor = ({ positions, onChange, disabled }: PositionEditorProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newPositionName, setNewPositionName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const isMaxReached = positions.length >= POSITION_MAX_COUNT;

  const handleAdd = () => {
    const trimmedName = newPositionName.trim();
    const error = validatePositionName(
      trimmedName,
      positions.map((p) => p.name),
    );
    if (error) {
      setAddError(error);
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

  const handleEditStart = (position: LocalPosition) => {
    setEditingId(position.id);
    setEditingName(position.name);
    setEditError(null);
  };

  const handleEditSave = () => {
    if (!editingId) return;

    const trimmedName = editingName.trim();
    const otherNames = positions.filter((p) => p.id !== editingId).map((p) => p.name);
    const error = validatePositionName(trimmedName, otherNames);
    if (error) {
      setEditError(error);
      return;
    }

    onChange(positions.map((p) => (p.id === editingId ? { ...p, name: trimmedName } : p)));
    setEditingId(null);
    setEditingName("");
    setEditError(null);
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditingName("");
    setEditError(null);
  };

  const handleDelete = (positionId: string) => {
    onChange(positions.filter((p) => p.id !== positionId));
  };

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

  return (
    <VStack align="stretch" gap={3}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={positions.map((p) => p.id)} strategy={verticalListSortingStrategy}>
          <VStack align="stretch" gap={2}>
            {positions.map((position) => (
              <SortablePositionItem
                key={position.id}
                id={position.id}
                name={position.name}
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

      <PositionAddForm
        isAdding={isAdding}
        newPositionName={newPositionName}
        addError={addError}
        isMaxReached={isMaxReached}
        disabled={disabled}
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
          <br />
          スタッフの熟練度を設定することで、シフト作成時の参考にします
        </Text>
      )}
    </VStack>
  );
};
