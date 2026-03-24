import { Box, Button, Flex, Text } from "@chakra-ui/react";
import type { PositionType } from "../../types";

type PositionToolbarProps = {
  positions: PositionType[];
  selectedPositionId: string | null;
  onPositionSelect: (positionId: string) => void;
};

export const PositionToolbar = ({ positions, selectedPositionId, onPositionSelect }: PositionToolbarProps) => {
  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" p={3}>
      <Flex gap={4} align="flex-start" flexWrap="wrap">
        <Box flex={1}>
          <Text fontSize="xs" color="gray.500" mb={1}>
            ポジション
          </Text>
          <Flex gap={1} flexWrap="wrap">
            {positions.map((position) => {
              const isSelected = selectedPositionId === position.id;
              return (
                <Button
                  key={position.id}
                  size="sm"
                  variant={isSelected ? "solid" : "outline"}
                  bg={isSelected ? position.color : "transparent"}
                  borderColor={position.color}
                  color={isSelected ? "white" : "gray.700"}
                  onClick={() => onPositionSelect(position.id)}
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
          </Flex>
        </Box>
      </Flex>
    </Box>
  );
};
