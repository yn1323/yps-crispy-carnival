import { Flex, IconButton, Text } from "@chakra-ui/react";
import { LuMinus, LuPlus } from "react-icons/lu";

type StepperCellProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  isChanged?: boolean;
};

export const StepperCell = ({
  value,
  onChange,
  min = 0,
  max = 10,
  disabled = false,
  isChanged = false,
}: StepperCellProps) => {
  return (
    <Flex
      align="center"
      gap={1}
      justify="center"
      bg={isChanged ? "orange.50" : "transparent"}
      borderRadius="md"
      px={1}
      py={0.5}
      transition="all 0.15s ease"
    >
      <IconButton
        variant="outline"
        size="2xs"
        aria-label="減らす"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
      >
        <LuMinus />
      </IconButton>
      <Text textAlign="center" fontSize="sm" fontWeight="medium" minW="2ch" userSelect="none">
        {value}
      </Text>
      <IconButton
        variant="outline"
        size="2xs"
        aria-label="増やす"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
      >
        <LuPlus />
      </IconButton>
    </Flex>
  );
};
