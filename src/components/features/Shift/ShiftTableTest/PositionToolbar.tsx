import { Box, Button, Flex, Icon, IconButton, Text } from "@chakra-ui/react";
import { LuEraser, LuHash, LuMousePointer2, LuPaintbrush, LuPalette, LuRedo2, LuUndo2 } from "react-icons/lu";
import { FILL_RATE_COLORS, type PositionType, type SummaryDisplayMode, type ToolMode } from "./types";

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
  summaryDisplayMode: SummaryDisplayMode;
  onSummaryDisplayModeChange: (mode: SummaryDisplayMode) => void;
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
  summaryDisplayMode,
  onSummaryDisplayModeChange,
}: PositionToolbarProps) => {
  const isPositionDisabled = toolMode !== "assign";

  const tipsText = (() => {
    if (toolMode === "select") {
      return "バーをクリックして詳細を確認。バーの端をドラッグでリサイズできます";
    }
    if (toolMode === "erase") {
      return "クリックで詳細確認。ドラッグで範囲消去。バーの端でリサイズ";
    }
    // assign
    if (!selectedPositionId) {
      return "ポジションを選んでください";
    }
    const pos = positions.find((p) => p.id === selectedPositionId);
    return pos ? `${pos.name} — シフト表の上をドラッグで割り当て` : "ポジションを選んでください";
  })();

  return (
    <Box border="1px solid" borderColor="gray.200" borderRadius="lg" p={3}>
      {/* 上段: 4グループ */}
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
              label="割当"
              isActive={toolMode === "assign"}
              onClick={() => onToolModeChange("assign")}
            />
            <ToolButton
              icon={LuEraser}
              label="消す"
              isActive={toolMode === "erase"}
              onClick={() => onToolModeChange("erase")}
              activeColorPalette="red"
            />
          </Flex>
        </Box>

        {/* セパレータ */}
        <Box borderLeft="1px solid" borderColor="gray.200" alignSelf="stretch" />

        {/* グループ3: ポジション */}
        <Box opacity={isPositionDisabled ? 0.4 : 1} pointerEvents={isPositionDisabled ? "none" : "auto"} flex={1}>
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

        {/* セパレータ */}
        <Box borderLeft="1px solid" borderColor="gray.200" alignSelf="stretch" />

        {/* グループ4: サマリー表示切替 */}
        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>
            サマリー
          </Text>
          <Flex gap={1}>
            <ToolButton
              icon={LuPalette}
              label="色"
              isActive={summaryDisplayMode === "color"}
              onClick={() => onSummaryDisplayModeChange("color")}
            />
            <ToolButton
              icon={LuHash}
              label="数値"
              isActive={summaryDisplayMode === "number"}
              onClick={() => onSummaryDisplayModeChange("number")}
            />
          </Flex>
        </Box>
      </Flex>

      {/* 下段: Tips + 凡例 */}
      <Flex align="center" justify="space-between" mt={2} minH="24px">
        <Text fontSize="sm" color="gray.500">
          {tipsText}
        </Text>
        <Flex align="center" gap={8} flexShrink={0}>
          {/* 充足度カラースケール */}
          <Flex align="center" gap={1.5}>
            <Text fontSize="xs" color="gray.500">
              充足度
            </Text>
            <Box>
              <Flex>
                {FILL_RATE_COLORS.map((color, i) => (
                  <Box
                    key={color.bg}
                    w="20px"
                    h="10px"
                    bg={color.bg}
                    borderLeftRadius={i === 0 ? "sm" : undefined}
                    borderRightRadius={i === FILL_RATE_COLORS.length - 1 ? "sm" : undefined}
                  />
                ))}
              </Flex>
              <Flex mt="1px">
                <Flex w="100px" justify="space-between">
                  <Text fontSize="9px" color="gray.400" lineHeight="1">
                    0%
                  </Text>
                  <Text fontSize="9px" color="gray.400" lineHeight="1">
                    100%
                  </Text>
                </Flex>
                <Box w="20px" textAlign="center">
                  <Text fontSize="9px" color="gray.400" lineHeight="1">
                    超
                  </Text>
                </Box>
              </Flex>
            </Box>
          </Flex>

          {/* スタッフ希望時間 */}
          <Flex align="center" gap={2}>
            <Box w="32px" h="12px" border="2px dashed" borderColor="gray.400" borderRadius="sm" />
            <Text fontSize="sm" color="gray.600">
              スタッフ希望時間
            </Text>
          </Flex>
        </Flex>
      </Flex>
    </Box>
  );
};
