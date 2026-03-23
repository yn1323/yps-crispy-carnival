import { Box, Button, Flex, Icon, IconButton, Text } from "@chakra-ui/react";
import { LuMousePointer2, LuPaintbrush, LuRedo2, LuUndo2 } from "react-icons/lu";
import type { PositionType, ToolMode } from "../../types";

type ToolButtonProps = {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
  activeColorPalette?: string;
};

const ToolButton = ({ icon, label, isActive, onClick, activeColorPalette }: ToolButtonProps) => (
  <Button
    size="sm"
    variant={isActive ? "solid" : "outline"}
    colorPalette={isActive ? (activeColorPalette ?? "blue") : "gray"}
    onClick={onClick}
    transition="all 0.15s"
  >
    <Icon as={icon} mr={1} />
    {label}
  </Button>
);

type PositionToolbarProps = {
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  positions: PositionType[];
  selectedPositionId: string | null;
  onPositionSelect: (positionId: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export const PositionToolbar = ({
  toolMode,
  onToolModeChange,
  positions,
  selectedPositionId,
  onPositionSelect,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: PositionToolbarProps) => {
  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" p={3}>
      {/* 履歴・ツール・ポジション */}
      <Flex gap={4} align="flex-start" flexWrap="wrap">
        {/* グループ1: 履歴 */}
        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            履歴
          </Text>
          <Flex gap={1}>
            <IconButton size="sm" variant="outline" onClick={onUndo} disabled={!canUndo} aria-label="元に戻す">
              <Icon as={LuUndo2} />
            </IconButton>
            <IconButton size="sm" variant="outline" onClick={onRedo} disabled={!canRedo} aria-label="やり直し">
              <Icon as={LuRedo2} />
            </IconButton>
          </Flex>
        </Box>

        {/* セパレータ */}
        <Box borderLeft="1px solid" borderColor="gray.200" alignSelf="stretch" />

        {/* グループ2: ツール */}
        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            ツール
          </Text>
          <Flex gap={1}>
            <ToolButton
              icon={LuMousePointer2}
              label="選択"
              isActive={toolMode === "select"}
              onClick={() => onToolModeChange("select")}
            />
            <ToolButton
              icon={LuPaintbrush}
              label="シフト割当"
              isActive={toolMode === "assign"}
              onClick={() => onToolModeChange("assign")}
            />
          </Flex>
        </Box>

        {/* セパレータ */}
        <Box borderLeft="1px solid" borderColor="gray.200" alignSelf="stretch" />

        {/* グループ3: ポジション */}
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
                  onClick={() => {
                    onPositionSelect(position.id);
                    // ポジション選択時に自動でシフト割当モードに切替
                    if (toolMode !== "assign") {
                      onToolModeChange("assign");
                    }
                  }}
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
