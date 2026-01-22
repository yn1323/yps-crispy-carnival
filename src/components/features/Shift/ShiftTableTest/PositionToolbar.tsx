import { Box, Button, Flex, Icon, Text } from "@chakra-ui/react";
import { LuEraser } from "react-icons/lu";
import type { PositionType, ToolSelection } from "./types";

type PositionToolbarProps = {
  positions: PositionType[];
  selectedTool: ToolSelection;
  onSelect: (tool: ToolSelection) => void;
};

export const PositionToolbar = ({ positions, selectedTool, onSelect }: PositionToolbarProps) => {
  const handlePositionClick = (position: PositionType) => {
    // 同じポジションをクリックしたら選択解除
    if (selectedTool !== "eraser" && selectedTool?.id === position.id) {
      onSelect(null);
    } else {
      onSelect(position);
    }
  };

  const handleEraserClick = () => {
    // 消しゴムをクリックしたらトグル
    if (selectedTool === "eraser") {
      onSelect(null);
    } else {
      onSelect("eraser");
    }
  };

  const isEraserSelected = selectedTool === "eraser";
  const selectedPosition = selectedTool !== "eraser" ? selectedTool : null;

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
            onClick={() => handlePositionClick(position)}
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

      {/* 消しゴムボタン */}
      <Box borderLeft="1px solid" borderColor="gray.200" pl={2} ml={2}>
        <Button
          size="sm"
          variant={isEraserSelected ? "solid" : "outline"}
          colorPalette={isEraserSelected ? "red" : "gray"}
          onClick={handleEraserClick}
          transition="all 0.15s"
        >
          <Icon as={LuEraser} mr={1} />
          消しゴム
        </Button>
      </Box>

      {/* 操作ヒント */}
      {selectedPosition && (
        <Text fontSize="sm" color="gray.500" ml={2}>
          (バー上をドラッグで塗り)
        </Text>
      )}
      {isEraserSelected && (
        <Text fontSize="sm" color="red.500" ml={2}>
          (バー上をクリック/ドラッグで削除)
        </Text>
      )}

      {/* 凡例: 希望シフト時間 */}
      <Flex align="center" ml={4} pl={4} borderLeft="1px solid" borderColor="gray.200">
        <Box w="32px" h="12px" border="2px dashed" borderColor="gray.400" borderRadius="sm" mr={2} />
        <Text fontSize="sm" color="gray.600">
          スタッフ希望時間
        </Text>
      </Flex>
    </Flex>
  );
};
