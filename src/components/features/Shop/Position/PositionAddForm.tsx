import { Box, Button, Field, Flex, Icon, Input, Text } from "@chakra-ui/react";
import { LuPlus } from "react-icons/lu";
import { POSITION_NAME_MAX_LENGTH } from "@/src/constants/validations";

type PositionAddFormProps = {
  isAdding: boolean;
  newPositionName: string;
  addError: string | null;
  isMaxReached: boolean;
  disabled?: boolean;
  isCreating?: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onChange: (value: string) => void;
  onStartAdding: () => void;
};

export const PositionAddForm = ({
  isAdding,
  newPositionName,
  addError,
  isMaxReached,
  disabled,
  isCreating,
  onAdd,
  onCancel,
  onChange,
  onStartAdding,
}: PositionAddFormProps) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      onAdd();
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  if (isAdding) {
    return (
      <Box bg="gray.50" borderRadius="lg" p={3}>
        <Flex gap={2} align="flex-start" direction="column">
          <Flex gap={2} w="full">
            <Field.Root invalid={!!addError} flex={1}>
              <Input
                value={newPositionName}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="新しいポジション名"
                maxLength={POSITION_NAME_MAX_LENGTH}
                size="sm"
                autoFocus
              />
            </Field.Root>
            <Button size="sm" colorPalette="teal" onClick={onAdd} loading={isCreating}>
              追加
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancel}>
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
    );
  }

  return (
    <Button
      variant="ghost"
      colorPalette="teal"
      size="sm"
      onClick={onStartAdding}
      disabled={isMaxReached || disabled}
      gap={2}
    >
      <Icon as={LuPlus} />
      ポジションを追加
    </Button>
  );
};
