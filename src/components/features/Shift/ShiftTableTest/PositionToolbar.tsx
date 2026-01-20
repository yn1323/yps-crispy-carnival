import { Box, Button, Flex, Text } from "@chakra-ui/react";
import type { PositionType } from "./types";

type PositionToolbarProps = {
  positions: PositionType[];
  selectedPosition: PositionType | null;
  onSelect: (position: PositionType | null) => void;
};

export const PositionToolbar = ({ positions, selectedPosition, onSelect }: PositionToolbarProps) => {
  const handleClick = (position: PositionType) => {
    // 同じポジションをクリックしたら選択解除
    if (selectedPosition?.id === position.id) {
      onSelect(null);
    } else {
      onSelect(position);
    }
  };

  return (
    <Flex gap={2} align="center" flexWrap="wrap">
      <Text fontWeight="bold" color="gray.700" mr={2}>
        ポジション:
      </Text>
      {positions.map((position) => {
        const isSelected = selectedPosition?.id === position.id;
        return (
          <Button
            key={position.id}
            size="sm"
            variant={isSelected ? "solid" : "outline"}
            bg={isSelected ? position.color : "transparent"}
            borderColor={position.color}
            color={isSelected ? "white" : "gray.700"}
            onClick={() => handleClick(position)}
            _hover={{
              bg: isSelected ? position.color : `${position.color}20`,
            }}
            transition="all 0.15s"
          >
            <Box w="12px" h="12px" borderRadius="full" bg={isSelected ? "white" : position.color} mr={2} />
            {position.name}
          </Button>
        );
      })}
      {selectedPosition && (
        <Text fontSize="sm" color="gray.500" ml={2}>
          (バー上をドラッグで塗り)
        </Text>
      )}
    </Flex>
  );
};
